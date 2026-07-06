// pega os elementos da tela que vou usar direto
const slot = document.getElementById('slot');
const inputArquivo = document.getElementById('arquivo-input');
const mesa = document.getElementById('mesa');
const nomeMusica = document.getElementById('nome-musica');
const statusLinha = document.getElementById('status-linha');
const caixaErro = document.getElementById('erro');
const transporte = document.getElementById('transporte');
const botaoPlay = document.getElementById('botao-play');
const scrubber = document.getElementById('scrubber');
const tempos = document.getElementById('tempos');
const dica = document.getElementById('dica');
const secaoBiblioteca = document.getElementById('biblioteca');
const seletorBiblioteca = document.getElementById('seletor-biblioteca');
const botaoRemoverBiblioteca = document.getElementById('remover-biblioteca');

// guarda o estado da biblioteca (músicas já separadas)
let bibliotecaAtual = {};

// estado geral do player
let audios = {};              // aqui ficam os <audio> de cada faixa
let volumes = {};             // volume atual de cada faixa
let volumesAnteriores = {};   // pra lembrar volume quando muta/desmuta
let tocando = false;         // se o play geral tá ativo ou não
let arrastandoBarra = false; // evita bug enquanto mexe no scrubber
let jobAtual = null;         // id do processamento atual

// ---------- Upload ----------

// clica no slot abre o input de arquivo escondido
slot.addEventListener('click', () => inputArquivo.click());

// arrastar arquivo pra cima do slot
slot.addEventListener('dragover', (e) => { e.preventDefault(); slot.classList.add('arrastando'); });

// saiu de cima do slot
slot.addEventListener('dragleave', () => slot.classList.remove('arrastando'));
slot.addEventListener('drop', (e) => {
  e.preventDefault();
  slot.classList.remove('arrastando');

  // soltou o arquivo no slot
  if (e.dataTransfer.files.length) enviar(e.dataTransfer.files[0]);
});

// escolheu arquivo pelo input normal
inputArquivo.addEventListener('change', () => {
  if (inputArquivo.files.length) enviar(inputArquivo.files[0]);
});

// manda o arquivo pro backend e já prepara a interface
// e para qualquer coisa que estiver tocando antes
function enviar(arquivo) {
  pararTudo();
  // limpo mensagens antigas da tela
  caixaErro.style.display = 'none';
  dica.style.display = 'none';
  // tiro a UI de reprodução da biblioteca
  transporte.classList.remove('ativa');
  seletorBiblioteca.selectedIndex = 0;

  // monto o form de upload e mostro nome da música na tela
  const dados = new FormData();
  dados.append('musica', arquivo);
  nomeMusica.textContent = arquivo.name;
  mesa.classList.add('ativa');

  // reseto todas as faixas visuais pra estado inicial
  document.querySelectorAll('.strip').forEach(s => {
    s.classList.remove('pronto', 'processando', 'ligada');
    s.style.removeProperty('--pct');
    s.querySelector('.baixar').removeAttribute('href');
  });
  statusLinha.textContent = 'enviando…';

  fetch('/upload', { method: 'POST', body: dados })
    .then(r => r.json())
    .then(resp => {
      if (resp.erro) { mostrarErro(resp.erro); return; }
      jobAtual = resp.job_id;
      acompanhar(resp.job_id);
    })
    .catch(() => mostrarErro('Não consegui enviar o arquivo. Verifique se o servidor está rodando.'));
}

// fica perguntando pro backend "como tá o processo?" a cada 1s
//Para gerar percentual
function acompanhar(jobId) {
  const intervalo = setInterval(() => {
    fetch(`/status/${jobId}`)
      .then(r => r.json())
      .then(job => {
        if (job.status === 'erro') {
          clearInterval(intervalo);
          mostrarErro(job.erro || 'Erro desconhecido ao processar.');
          return;
        }

        if (job.status === 'na_fila') statusLinha.textContent = 'na fila…';
        else if (job.status === 'processando') statusLinha.textContent = `separando as faixas… ${job.progresso || 0}%`;
        else if (job.status === 'concluido') statusLinha.textContent = 'toque nas faixas pra ouvir';

        document.querySelectorAll('.strip').forEach(strip => {
          const chave = strip.dataset.chave;
          const pronto = job.prontos && job.prontos.includes(chave);
          strip.classList.toggle('processando', job.status === 'processando' && !pronto);
          if (job.status === 'processando') strip.style.setProperty('--pct', `${Math.max(job.progresso || 0, 8)}%`);
          if (pronto && !strip.classList.contains('pronto')) {
            ativarFaixa(strip, jobId, chave);
          }
        });

        if (job.status === 'concluido') {
          clearInterval(intervalo);
          transporte.classList.add('ativa');
          dica.style.display = 'block';
          carregarBiblioteca();
        }
      });
  }, 1000);
}

// ---------- Player ----------

function criarAudio(jobId, chave) {
  const el = new Audio(`/audio/${jobId}/${chave}`);
  el.preload = 'auto';
  audios[chave] = el;

  el.addEventListener('loadedmetadata', () => {
    if (chave === primeiraChaveCarregada() && isFinite(el.duration) && el.duration > 0) {
      scrubber.max = Math.floor(el.duration * 10);
      atualizarTempos(0, el.duration);
    }
  });

  el.addEventListener('timeupdate', () => {
    if (chave !== primeiraChaveCarregada()) return;
    if (arrastandoBarra) return;
    scrubber.value = Math.floor(el.currentTime * 10);
    atualizarTempos(el.currentTime, el.duration);
    corrigirSincronia(el.currentTime);
  });
}

function configurarFader(strip, chave) {
  const trilha = strip.querySelector('.fader-track');
  const preenchimento = strip.querySelector('.fader-fill');
  const rotulo = strip.querySelector('.volume-label');

  function definirVolume(fracao) {
    fracao = Math.max(0, Math.min(1, fracao));
    preenchimento.style.height = `${fracao * 100}%`;
    rotulo.textContent = `${Math.round(fracao * 100)}%`;
    strip.classList.toggle('ligada', fracao > 0);
    volumes[chave] = fracao;
    if (audios[chave]) audios[chave].volume = fracao;
  }

  function fracaoDoEvento(evento) {
    const rect = trilha.getBoundingClientRect();
    const y = evento.touches ? evento.touches[0].clientY : evento.clientY;
    return 1 - Math.max(0, Math.min(1, (y - rect.top) / rect.height));
  }

  let arrastandoFader = false;

  function iniciar(e) {
    if (!strip.classList.contains('pronto')) return;
    arrastandoFader = true;
    definirVolume(fracaoDoEvento(e));
    e.preventDefault();
  }
  function mover(e) {
    if (!arrastandoFader) return;
    definirVolume(fracaoDoEvento(e));
    e.preventDefault();
  }
  function soltar() { arrastandoFader = false; }

  trilha.addEventListener('mousedown', iniciar);
  trilha.addEventListener('touchstart', iniciar, { passive: false });
  window.addEventListener('mousemove', mover, { passive: false });
  window.addEventListener('touchmove', mover, { passive: false });
  window.addEventListener('mouseup', soltar);
  window.addEventListener('touchend', soltar);

  trilha.addEventListener('dblclick', () => {
    if (volumes[chave] > 0) {
      volumesAnteriores[chave] = volumes[chave];
      definirVolume(0);
    } else {
      definirVolume(volumesAnteriores[chave] ?? 1);
    }
  });

  definirVolume(1);
}

function ativarFaixa(strip, jobId, chave) {
  strip.classList.add('pronto');
  strip.querySelector('.baixar').href = `/download/${jobId}/${chave}`;
  criarAudio(jobId, chave);
  configurarFader(strip, chave);
}

function primeiraChaveCarregada() { return Object.keys(audios)[0]; }

function corrigirSincronia(tempoReferencia) {
  Object.values(audios).forEach(a => {
    if (Math.abs(a.currentTime - tempoReferencia) > 0.25) a.currentTime = tempoReferencia;
  });
}

function atualizarTempos(atual, duracao) {
  tempos.textContent = `${formatarTempo(atual)} / ${formatarTempo(duracao)}`;
}

function formatarTempo(s) {
  if (!isFinite(s)) return '0:00';
  const min = Math.floor(s / 60);
  const seg = Math.floor(s % 60).toString().padStart(2, '0');
  return `${min}:${seg}`;
}

botaoPlay.addEventListener('click', () => {
  tocando = !tocando;
  botaoPlay.textContent = tocando ? '❙❙' : '▶';
  Object.values(audios).forEach(a => tocando ? a.play() : a.pause());
});

scrubber.addEventListener('mousedown', () => arrastandoBarra = true);
scrubber.addEventListener('touchstart', () => arrastandoBarra = true);
scrubber.addEventListener('input', () => {
  const t = scrubber.value / 10;
  const ref = audios[primeiraChaveCarregada()];
  atualizarTempos(t, ref ? ref.duration : 0);
});
scrubber.addEventListener('change', () => {
  const t = scrubber.value / 10;
  Object.values(audios).forEach(a => a.currentTime = t);
  arrastandoBarra = false;
});

function pararTudo() {
  Object.values(audios).forEach(a => { a.pause(); a.src = ''; });
  audios = {};
  tocando = false;
  botaoPlay.textContent = '▶';
}

function mostrarErro(msg) {
  caixaErro.textContent = msg;
  caixaErro.style.display = 'block';
  statusLinha.textContent = '';
}

// ---------- Biblioteca ----------

function carregarBiblioteca() {
  fetch('/biblioteca')
    .then(r => r.json())
    .then(lista => {
      bibliotecaAtual = {};
      seletorBiblioteca.innerHTML = '<option value="" disabled selected>Escolher música salva…</option>';

      if (!lista.length) { secaoBiblioteca.style.display = 'none'; return; }
      secaoBiblioteca.style.display = 'block';

      lista.forEach(item => {
        bibliotecaAtual[item.job_id] = item;
        const opcao = document.createElement('option');
        opcao.value = item.job_id;
        opcao.textContent = `${item.nome} — ${item.data}`;
        seletorBiblioteca.appendChild(opcao);
      });
    });
}

seletorBiblioteca.addEventListener('change', () => {
  const jobId = seletorBiblioteca.value;
  const item = bibliotecaAtual[jobId];
  if (item) abrirDaBiblioteca(item.job_id, item.nome, item.prontos);
});

botaoRemoverBiblioteca.addEventListener('click', () => {
  const jobId = seletorBiblioteca.value;
  if (!jobId) return;
  fetch(`/biblioteca/${jobId}`, { method: 'DELETE' }).then(() => carregarBiblioteca());
});

function abrirDaBiblioteca(jobId, nome, prontos) {
  pararTudo();
  caixaErro.style.display = 'none';
  jobAtual = jobId;
  nomeMusica.textContent = nome;
  mesa.classList.add('ativa');
  statusLinha.textContent = 'da biblioteca';
  dica.style.display = 'block';

  document.querySelectorAll('.strip').forEach(strip => {
    const chave = strip.dataset.chave;
    const pronto = prontos.includes(chave);
    strip.classList.remove('processando', 'pronto', 'ligada');
    strip.style.removeProperty('--pct');
    const linkBaixar = strip.querySelector('.baixar');
    if (pronto) {
      ativarFaixa(strip, jobId, chave);
    } else {
      linkBaixar.removeAttribute('href');
    }
  });

  transporte.classList.add('ativa');
}

carregarBiblioteca();