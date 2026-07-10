#!/usr/bin/env python3
"""
Servidor web do Separador de Faixas.
Roda localmente e serve uma interface de upload no navegador, com player
sincronizado e uma biblioteca de músicas já separadas.
"""

import sys
import re
import json
import shutil
import subprocess
import threading
import queue
import uuid
from datetime import datetime
from pathlib import Path

from flask import Flask, request, render_template, jsonify, send_from_directory, abort

PROJECT_DIR = Path(__file__).resolve().parent.parent

APP_DIR = PROJECT_DIR / "app"
WEB_DIR = PROJECT_DIR / "web"
DATA_DIR = PROJECT_DIR / "data"

UPLOAD_DIR = DATA_DIR / "uploads"
RESULT_DIR = DATA_DIR / "resultados"
BIBLIOTECA_PATH = DATA_DIR / "biblioteca.json"

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
RESULT_DIR.mkdir(parents=True, exist_ok=True)

MODELO = "htdemucs_6s"
EXTENSOES_PERMITIDAS = {".mp3", ".wav", ".m4a", ".flac", ".ogg", ".aac"}

FAIXAS = [
    {"chave": "bateria", "arquivo_original": "drums.wav", "arquivo_pt": "bateria.wav", "label": "Bateria"},
    {"chave": "baixo", "arquivo_original": "bass.wav", "arquivo_pt": "baixo.wav", "label": "Baixo"},
    {"chave": "guitarra", "arquivo_original": "guitar.wav", "arquivo_pt": "guitarra.wav", "label": "Guitarra"},
    {"chave": "teclado", "arquivo_original": "piano.wav", "arquivo_pt": "teclado.wav", "label": "Teclado"},
    {"chave": "voz", "arquivo_original": "vocals.wav", "arquivo_pt": "voz.wav", "label": "Voz"},
    {"chave": "outros", "arquivo_original": "other.wav", "arquivo_pt": "outros.wav", "label": "Outros"},
]

app = Flask(
    __name__,
    template_folder=str(WEB_DIR / "templates"),
    static_folder=str(WEB_DIR / "static"),
)
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024  # 100 MB por upload
app.config["TEMPLATES_AUTO_RELOAD"] = True
app.config["SEND_FILE_MAX_AGE_DEFAULT"] = 0
app.jinja_env.auto_reload = True

jobs = {}
fila = queue.Queue()
trava_biblioteca = threading.Lock()
PADRAO_PROGRESSO = re.compile(r"(\d{1,3})%\|")


# ---------- Biblioteca (persistência em disco) ----------

def carregar_biblioteca():
    if BIBLIOTECA_PATH.exists():
        try:
            return json.loads(BIBLIOTECA_PATH.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def salvar_na_biblioteca(job_id, nome_original, prontos):
    with trava_biblioteca:
        biblioteca = carregar_biblioteca()
        biblioteca[job_id] = {
            "nome": nome_original,
            "data": datetime.now().strftime("%d/%m/%Y %H:%M"),
            "prontos": prontos,
        }
        BIBLIOTECA_PATH.write_text(json.dumps(biblioteca, ensure_ascii=False, indent=2), encoding="utf-8")


def remover_da_biblioteca_disco(job_id):
    with trava_biblioteca:
        biblioteca = carregar_biblioteca()
        biblioteca.pop(job_id, None)
        BIBLIOTECA_PATH.write_text(json.dumps(biblioteca, ensure_ascii=False, indent=2), encoding="utf-8")


def restaurar_jobs_da_biblioteca():
    """Ao iniciar o servidor, torna disponíveis as músicas já separadas em execuções anteriores."""
    for job_id, info in carregar_biblioteca().items():
        if (RESULT_DIR / job_id).exists():
            jobs[job_id] = {
                "status": "concluido",
                "progresso": 100,
                "prontos": info["prontos"],
                "erro": None,
                "nome_original": info["nome"],
            }


# ---------- Processamento ----------

def processar_job(job_id, caminho_audio, nome_original):
    jobs[job_id]["status"] = "processando"
    jobs[job_id]["progresso"] = 0
    try:
        pasta_tmp = RESULT_DIR / job_id / "tmp"
        pasta_tmp.mkdir(parents=True, exist_ok=True)

        comando = [
            sys.executable, "-m", "demucs",
            "-n", MODELO,
            "-o", str(pasta_tmp),
            str(caminho_audio),
        ]

        processo = subprocess.Popen(
            comando,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )

        # O Demucs mostra uma barra de progresso (estilo tqdm) usando "\r".
        # Lemos caractere a caractere para capturar essas atualizações em tempo real.
        buffer = ""
        while True:
            char = processo.stderr.read(1)
            if char == "":
                break
            if char in ("\r", "\n"):
                m = PADRAO_PROGRESSO.search(buffer)
                if m:
                    jobs[job_id]["progresso"] = min(int(m.group(1)), 99)
                buffer = ""
            else:
                buffer += char

        processo.wait()
        if processo.returncode != 0:
            jobs[job_id]["status"] = "erro"
            jobs[job_id]["erro"] = "Erro ao separar o áudio. Veja o terminal do servidor para detalhes."
            return

        nome_musica = caminho_audio.stem
        pasta_modelo = pasta_tmp / MODELO / nome_musica
        pasta_final = RESULT_DIR / job_id

        prontos = []
        for faixa in FAIXAS:
            origem = pasta_modelo / faixa["arquivo_original"]
            if origem.exists():
                destino = pasta_final / faixa["arquivo_pt"]
                shutil.copy2(origem, destino)
                prontos.append(faixa["chave"])

        shutil.rmtree(pasta_tmp, ignore_errors=True)
        jobs[job_id]["prontos"] = prontos
        jobs[job_id]["progresso"] = 100
        jobs[job_id]["status"] = "concluido"

        salvar_na_biblioteca(job_id, nome_original, prontos)

    except Exception as e:
        jobs[job_id]["status"] = "erro"
        jobs[job_id]["erro"] = str(e)
    finally:
        caminho_audio.unlink(missing_ok=True)


def worker():
    while True:
        job_id, caminho_audio, nome_original = fila.get()
        processar_job(job_id, caminho_audio, nome_original)
        fila.task_done()


threading.Thread(target=worker, daemon=True).start()
restaurar_jobs_da_biblioteca()


# ---------- Rotas ----------

@app.route("/")
def index():
    return render_template("index.html", faixas=FAIXAS)


@app.route("/upload", methods=["POST"])
def upload():
    arquivo = request.files.get("musica")
    if not arquivo or arquivo.filename == "":
        return jsonify({"erro": "Nenhum arquivo enviado."}), 400

    ext = Path(arquivo.filename).suffix.lower()
    if ext not in EXTENSOES_PERMITIDAS:
        return jsonify({"erro": f"Formato {ext} não suportado. Use mp3, wav, m4a, flac, ogg ou aac."}), 400

    job_id = uuid.uuid4().hex[:10]
    caminho = UPLOAD_DIR / f"{job_id}{ext}"
    arquivo.save(caminho)

    jobs[job_id] = {
        "status": "na_fila",
        "progresso": 0,
        "prontos": [],
        "erro": None,
        "nome_original": arquivo.filename,
    }

    fila.put((job_id, caminho, arquivo.filename))

    return jsonify({"job_id": job_id})


@app.route("/status/<job_id>")
def status(job_id):
    job = jobs.get(job_id)
    if not job:
        return jsonify({"erro": "Job não encontrado."}), 404
    return jsonify(job)


@app.route("/biblioteca")
def biblioteca():
    itens = carregar_biblioteca()
    lista = [
        {"job_id": jid, "nome": info["nome"], "data": info["data"], "prontos": info["prontos"]}
        for jid, info in itens.items()
        if (RESULT_DIR / jid).exists()
    ]
    lista.sort(key=lambda i: i["data"], reverse=True)
    return jsonify(lista)


@app.route("/biblioteca/<job_id>", methods=["DELETE"])
def remover_da_biblioteca(job_id):
    remover_da_biblioteca_disco(job_id)
    shutil.rmtree(RESULT_DIR / job_id, ignore_errors=True)
    jobs.pop(job_id, None)
    return jsonify({"ok": True})


@app.route("/download/<job_id>/<chave_faixa>")
def download(job_id, chave_faixa):
    pasta, faixa = _resolver_faixa(job_id, chave_faixa)
    return send_from_directory(pasta, faixa["arquivo_pt"], as_attachment=True)


@app.route("/audio/<job_id>/<chave_faixa>")
def audio(job_id, chave_faixa):
    pasta, faixa = _resolver_faixa(job_id, chave_faixa)
    return send_from_directory(pasta, faixa["arquivo_pt"], as_attachment=False, conditional=True)


def _resolver_faixa(job_id, chave_faixa):
    job = jobs.get(job_id)
    if not job or job["status"] != "concluido":
        abort(404)
    faixa = next((f for f in FAIXAS if f["chave"] == chave_faixa), None)
    if not faixa or chave_faixa not in job.get("prontos", []):
        abort(404)
    return RESULT_DIR / job_id, faixa


if __name__ == "__main__":
    print("\nServidor rodando! Acesse no navegador:")
    print("  http://localhost:5000\n")
    print("Pra outras pessoas na mesma rede Wi-Fi acessarem, use o IP da sua máquina, ex:")
    print("  http://192.168.0.X:5000\n")
    app.run(host="0.0.0.0", port=5000, debug=False)
