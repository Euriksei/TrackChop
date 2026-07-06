#!/usr/bin/env python3
"""
Separador de Faixas Musicais
=============================
Separa uma música em: baixo, guitarra, bateria, teclado, voz e outros.

Uso:
    python separar.py "caminho/para/musica.mp3"

Na primeira execução, o Demucs vai baixar o modelo de IA (~300MB),
o que pode demorar alguns minutos. Nas próximas vezes será rápido.
"""

import sys
import shutil
import subprocess
from pathlib import Path

# Modelo com 6 faixas: drums, bass, other, vocals, guitar, piano
MODELO = "htdemucs_6s"

# Tradução dos nomes das faixas geradas pelo Demucs
TRADUCAO = {
    "drums.wav": "bateria.wav",
    "bass.wav": "baixo.wav",
    "guitar.wav": "guitarra.wav",
    "piano.wav": "teclado.wav",
    "vocals.wav": "voz.wav",
    "other.wav": "outros.wav",
}


def verificar_dependencias():
    try:
        import demucs  # noqa: F401
    except ImportError:
        print("Demucs não está instalado. Rode primeiro:")
        print("    pip install demucs")
        sys.exit(1)

    if shutil.which("ffmpeg") is None:
        print("Aviso: ffmpeg não foi encontrado no PATH.")
        print("Ele é necessário para ler a maioria dos formatos de áudio (mp3, m4a, etc).")
        print("Instale com:")
        print("  - Windows: https://ffmpeg.org/download.html (ou 'winget install ffmpeg')")
        print("  - Mac:     brew install ffmpeg")
        print("  - Linux:   sudo apt install ffmpeg")
        print()


def separar(caminho_musica: str):
    caminho = Path(caminho_musica).expanduser().resolve()
    if not caminho.exists():
        print(f"Arquivo não encontrado: {caminho}")
        sys.exit(1)

    PROJECT_DIR = Path(__file__).resolve().parent.parent

    pasta_saida = PROJECT_DIR / "data" / "faixas_separadas"
    pasta_saida.mkdir(exist_ok=True)

    print(f"Separando '{caminho.name}' com o modelo {MODELO}...")
    print("Isso pode levar alguns minutos, dependendo do tamanho da música e do seu computador.\n")

    comando = [
        sys.executable, "-m", "demucs",
        "-n", MODELO,
        "-o", str(pasta_saida),
        str(caminho),
    ]

    resultado = subprocess.run(comando)
    if resultado.returncode != 0:
        print("Ocorreu um erro ao rodar o Demucs. Veja a mensagem acima.")
        sys.exit(1)

    # O demucs salva em: faixas_separadas/htdemucs_6s/<nome_da_musica>/*.wav
    pasta_modelo = pasta_saida / MODELO / caminho.stem
    if not pasta_modelo.exists():
        print("Não encontrei a pasta de saída esperada. Verifique 'faixas_separadas/'.")
        return

    # Cria pasta final com nomes em português
    pasta_final = Path(f"{caminho.stem} - faixas")
    pasta_final.mkdir(exist_ok=True)

    for arquivo_original, nome_pt in TRADUCAO.items():
        origem = pasta_modelo / arquivo_original
        if origem.exists():
            destino = pasta_final / nome_pt
            shutil.copy2(origem, destino)

    # Limpa pasta temporária do demucs
    shutil.rmtree(pasta_saida, ignore_errors=True)

    print(f"\nPronto! Faixas salvas em: {pasta_final.resolve()}\n")
    for nome_pt in TRADUCAO.values():
        arq = pasta_final / nome_pt
        if arq.exists():
            print(f"  - {nome_pt}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print('Uso: python separar.py "caminho/para/musica.mp3"')
        sys.exit(1)

    verificar_dependencias()
    separar(sys.argv[1])
