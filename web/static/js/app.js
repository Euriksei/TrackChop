// pega os elementos da tela que vou usar direto
const slot = document.getElementById('slot');
const inputArquivo = document.getElementById('arquivo-input');
const mesa = document.getElementById('mesa');
const nomeMusica = document.getElementById('nome-musica');
const statusLinha = document.getElementById('status-linha');
const caixaErro = document.getElementById('erro');
const transporte = document.getElementById('transporte');
const botaoBackward = document.getElementById('botao-backward');
const botaoPlay = document.getElementById('botao-play');
const botaoForward = document.getElementById('botao-forward');
const scrubber = document.getElementById('scrubber');
const tempos = document.getElementById('tempos');
const secaoBiblioteca = document.getElementById('biblioteca');
const seletorBiblioteca = document.getElementById('seletor-biblioteca');
const botaoRemoverBiblioteca = document.getElementById('remover-biblioteca');
const botaoVoltarImportacao = document.getElementById('voltar-importacao');
const botaoAbrirDownloads = document.getElementById('abrir-downloads');
const painelDownloads = document.getElementById('painel-downloads');
const listaDownloads = document.getElementById('lista-downloads');
const botaoAjuda = document.getElementById('botao-ajuda');
const painelAjuda = document.getElementById('painel-ajuda');
const botaoFecharAjuda = document.getElementById('fechar-ajuda');
const painelPanMobile = document.getElementById('painel-pan-mobile');
const panMobileTitulo = document.getElementById('pan-mobile-titulo');
const panMobileValor = document.getElementById('pan-mobile-valor');
const panMobileSlider = document.getElementById('pan-mobile-slider');
const panMobileFechar = document.getElementById('pan-mobile-fechar');
const toast = document.getElementById('toast');
const strips = Array.from(document.querySelectorAll('.strip'));

// guarda o estado da biblioteca (músicas já separadas)
let bibliotecaAtual = {};

// estado geral do player
let audios = {};               // aqui ficam os <audio> de cada faixa
let ganhos = {};               // ganho por faixa (0.0 até 2.0)
let ganhosAnteriores = {};     // pra lembrar ganho quando muta/desmuta
let panPorFaixa = {};          // pan por faixa (-1 esquerda, +1 direita)
let muteAtivo = {};            // mute por faixa
let soloAtivo = {};            // solo por faixa
let nosGanho = {};             // GainNode por faixa
let nosPan = {};               // StereoPannerNode por faixa (se suportado)
let fontes = {};               // MediaElementSource por faixa
let contextoAudio = null;
let tocando = false;         // se o play geral tá ativo ou não
let arrastandoBarra = false; // evita bug enquanto mexe no scrubber
let jobAtual = null;         // id do processamento atual
let telaAtual = 'importacao';
let toastTimer = null;
let faixaPanMobileAtual = null;

function mostrarToast(mensagem) {
  if (!toast || !mensagem) return;
  toast.textContent = mensagem;
  toast.classList.add('visivel');

  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('visivel');
  }, 1500);
}

function mostrarTelaMesa() {
  telaAtual = 'mesa';
  mesa.classList.add('ativa');
  slot.style.display = 'none';
  secaoBiblioteca.style.display = 'none';
}

function mostrarTelaImportacao() {
  telaAtual = 'importacao';
  mesa.classList.remove('ativa');
  slot.style.display = 'block';
  secaoBiblioteca.style.display = 'block';
  painelDownloads?.classList.remove('aberto');
  painelAjuda?.classList.remove('aberto');
  carregarBiblioteca();
}

function atualizarPainelDownloads() {
  if (!listaDownloads) return;

  if (!jobAtual) {
    listaDownloads.innerHTML = '<span class="download-vazio">Nenhuma faixa disponivel.</span>';
    return;
  }

  const prontas = strips.filter((strip) => strip.classList.contains('pronto'));
  if (!prontas.length) {
    listaDownloads.innerHTML = '<span class="download-vazio">Aguardando faixas prontas...</span>';
    return;
  }

  listaDownloads.innerHTML = '';
  prontas.forEach((strip) => {
    const chave = strip.dataset.chave;
    const nomeFaixa = strip.querySelector('.track-label').textContent.trim();
    const link = document.createElement('a');
    link.className = 'download-link';
    link.href = `/download/${jobAtual}/${chave}`;
    link.download = '';
    link.textContent = nomeFaixa;
    listaDownloads.appendChild(link);
  });
}

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
  // tiro a UI de reprodução da biblioteca
  transporte.classList.remove('ativa');
  seletorBiblioteca.selectedIndex = 0;

  // monto o form de upload e mostro nome da música na tela
  const dados = new FormData();
  dados.append('musica', arquivo);
  nomeMusica.textContent = arquivo.name;
  mostrarTelaMesa();
  atualizarPainelDownloads();

  // reseto todas as faixas visuais pra estado inicial
  strips.forEach((s) => resetarVisualFaixa(s));
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

        strips.forEach(strip => {
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
          atualizarPainelDownloads();
          carregarBiblioteca();
          mostrarToast('Faixas prontas para tocar');
        }
      });
  }, 1000);
}

// ---------- Player ----------

function garantirContextoAudio() {
  if (contextoAudio) return contextoAudio;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  contextoAudio = new Ctx();
  return contextoAudio;
}

function conectarProcessamentoAudio(chave, el) {
  const ctx = garantirContextoAudio();
  if (!ctx) return;

  const source = ctx.createMediaElementSource(el);
  const gainNode = ctx.createGain();
  source.connect(gainNode);

  let panNode = null;
  if (typeof ctx.createStereoPanner === 'function') {
    panNode = ctx.createStereoPanner();
    gainNode.connect(panNode);
    panNode.connect(ctx.destination);
  } else {
    gainNode.connect(ctx.destination);
  }

  fontes[chave] = source;
  nosGanho[chave] = gainNode;
  nosPan[chave] = panNode;
}

function atualizarPan(chave) {
  const valorPan = panPorFaixa[chave] ?? 0;
  if (nosPan[chave]) {
    nosPan[chave].pan.value = valorPan;
  }
}

function atualizarMixagem() {
  const existeSolo = Object.values(soloAtivo).some(Boolean);

  strips.forEach((strip) => {
    const chave = strip.dataset.chave;
    const mute = !!muteAtivo[chave];
    const solo = !!soloAtivo[chave];
    const passaSolo = !existeSolo || solo;
    const ganhoBase = ganhos[chave] ?? 1;
    const ganhoFinal = (!mute && passaSolo) ? ganhoBase : 0;

    strip.classList.toggle('mutada', mute);
    strip.classList.toggle('solo', solo);
    strip.classList.toggle('ligada', ganhoFinal > 0);
    strip.classList.toggle('atenuada', existeSolo && !solo);

    const botaoMute = strip.querySelector('.mute-btn');
    const botaoSolo = strip.querySelector('.solo-btn');
    const botaoMuteMobile = strip.querySelector('.mute-btn-mobile');
    const botaoSoloMobile = strip.querySelector('.solo-btn-mobile');
    botaoMute?.classList.toggle('ativo', mute);
    botaoSolo?.classList.toggle('ativo', solo);
    botaoMuteMobile?.classList.toggle('ativo', mute);
    botaoSoloMobile?.classList.toggle('ativo', solo);

    if (nosGanho[chave]) {
      nosGanho[chave].gain.value = ganhoFinal;
    } else if (audios[chave]) {
      audios[chave].volume = Math.min(1, ganhoFinal);
    }

    atualizarPan(chave);
    sincronizarRotulosPan(strip, chave);
  });
}

function definirGanho(strip, chave, valor) {
  const preenchimento = strip.querySelector('.fader-fill');
  const rotulo = strip.querySelector('.volume-label');
  const sliderVolume = strip.querySelector('.volume-slider');
  const rotuloSlider = strip.querySelector('.volume-slider-label');

  const ganho = Math.max(0, Math.min(2, valor));
  ganhos[chave] = ganho;
  if (preenchimento) preenchimento.style.height = `${(ganho / 2) * 100}%`;
  if (rotulo) rotulo.textContent = `${Math.round(ganho * 100)}%`;
  if (sliderVolume) sliderVolume.value = String(Math.round(ganho * 100));
  if (sliderVolume) sliderVolume.style.setProperty('--vol-pct', `${Math.round((ganho / 2) * 100)}%`);
  if (rotuloSlider) rotuloSlider.textContent = `${Math.round(ganho * 100)}%`;
  atualizarMixagem();
}

function formatarPan(valorPan) {
  if (Math.abs(valorPan) < 0.01) return 'C';
  const pct = Math.round(Math.abs(valorPan) * 100);
  return valorPan < 0 ? `L${pct}` : `R${pct}`;
}

function sincronizarRotulosPan(strip, chave) {
  const valorPan = panPorFaixa[chave] ?? 0;
  const texto = formatarPan(valorPan);
  const rotuloPan = strip.querySelector('.pan-label');
  if (rotuloPan) rotuloPan.textContent = texto;

  if (faixaPanMobileAtual && faixaPanMobileAtual.chave === chave && panMobileValor && panMobileSlider) {
    panMobileValor.textContent = texto;
    panMobileSlider.value = String(Math.round(valorPan * 100));
  }
}

function abrirPainelPanMobile(strip, chave) {
  if (!painelPanMobile || !window.matchMedia('(max-width: 480px)').matches) return;
  faixaPanMobileAtual = { strip, chave };

  const nomeFaixa = strip.querySelector('.mobile-track-name')?.textContent?.trim()
    || strip.querySelector('.track-label')?.textContent?.trim()
    || 'Faixa';

  if (panMobileTitulo) panMobileTitulo.textContent = `Panorama · ${nomeFaixa}`;
  if (panMobileSlider) panMobileSlider.value = String(Math.round((panPorFaixa[chave] ?? 0) * 100));
  if (panMobileValor) panMobileValor.textContent = formatarPan(panPorFaixa[chave] ?? 0);

  painelPanMobile.classList.add('aberto');
  painelPanMobile.setAttribute('aria-hidden', 'false');
}

function fecharPainelPanMobile() {
  if (!painelPanMobile) return;
  painelPanMobile.classList.remove('aberto');
  painelPanMobile.setAttribute('aria-hidden', 'true');
  faixaPanMobileAtual = null;
}

function registrarDuploToqueOuClique(elemento, aoDisparar) {
  if (!elemento) return;
  let ultimoToqueMs = 0;

  elemento.addEventListener('dblclick', (e) => {
    e.preventDefault();
    aoDisparar();
  });

  elemento.addEventListener('touchend', (e) => {
    const agora = Date.now();
    if (agora - ultimoToqueMs <= 320) {
      e.preventDefault();
      ultimoToqueMs = 0;
      aoDisparar();
      return;
    }
    ultimoToqueMs = agora;
  }, { passive: false });
}

function configurarControlesFaixa(strip, chave) {
  const botaoMute = strip.querySelector('.mute-btn');
  const botaoSolo = strip.querySelector('.solo-btn');
  const botaoMuteMobile = strip.querySelector('.mute-btn-mobile');
  const botaoSoloMobile = strip.querySelector('.solo-btn-mobile');
  const botaoPot = strip.querySelector('.pot-btn');
  const painelPan = strip.querySelector('.pan-controle');
  const sliderPan = strip.querySelector('.pan-slider');
  const sliderVolume = strip.querySelector('.volume-slider');

  if (!strip.dataset.controlesLigados) {
    const alternarMute = () => {
      if (!strip.classList.contains('pronto')) return;
      muteAtivo[chave] = !muteAtivo[chave];
      atualizarMixagem();
      mostrarToast(`${strip.querySelector('.track-label').textContent.trim()}: ${muteAtivo[chave] ? 'Mute ON' : 'Mute OFF'}`);
    };

    const alternarSolo = () => {
      if (!strip.classList.contains('pronto')) return;
      soloAtivo[chave] = !soloAtivo[chave];
      atualizarMixagem();
      mostrarToast(`${strip.querySelector('.track-label').textContent.trim()}: ${soloAtivo[chave] ? 'Solo ON' : 'Solo OFF'}`);
    };

    botaoMute?.addEventListener('click', alternarMute);
    botaoMuteMobile?.addEventListener('click', alternarMute);
    botaoSolo?.addEventListener('click', alternarSolo);
    botaoSoloMobile?.addEventListener('click', alternarSolo);

    botaoPot?.addEventListener('click', () => {
      if (!strip.classList.contains('pronto')) return;
      abrirPainelPanMobile(strip, chave);
    });

    sliderPan?.addEventListener('input', () => {
      if (!strip.classList.contains('pronto')) return;
      const valor = Number(sliderPan.value) / 100;
      panPorFaixa[chave] = valor;
      atualizarPan(chave);
      sincronizarRotulosPan(strip, chave);
    });

    sliderVolume?.addEventListener('input', () => {
      if (!strip.classList.contains('pronto')) return;
      definirGanho(strip, chave, Number(sliderVolume.value) / 100);
    });

    registrarDuploToqueOuClique(sliderVolume, () => {
      if (!strip.classList.contains('pronto')) return;
      ganhosAnteriores[chave] = 1;
      definirGanho(strip, chave, 1);
      mostrarToast(`${strip.querySelector('.track-label').textContent.trim()}: Volume em 100%`);
    });

    registrarDuploToqueOuClique(sliderPan, () => {
      if (!strip.classList.contains('pronto')) return;
      panPorFaixa[chave] = 0;
      if (sliderPan) sliderPan.value = '0';
      atualizarPan(chave);
      sincronizarRotulosPan(strip, chave);
      mostrarToast(`${strip.querySelector('.track-label').textContent.trim()}: Pan centralizado`);
    });

    registrarDuploToqueOuClique(painelPan, () => {
      if (!strip.classList.contains('pronto')) return;
      panPorFaixa[chave] = 0;
      if (sliderPan) sliderPan.value = '0';
      atualizarPan(chave);
      sincronizarRotulosPan(strip, chave);
      mostrarToast(`${strip.querySelector('.track-label').textContent.trim()}: Pan centralizado`);
    });

    strip.dataset.controlesLigados = '1';
  }

  if (botaoMute) botaoMute.disabled = false;
  if (botaoSolo) botaoSolo.disabled = false;
  if (botaoMuteMobile) botaoMuteMobile.disabled = false;
  if (botaoSoloMobile) botaoSoloMobile.disabled = false;
  if (botaoPot) botaoPot.disabled = false;
  if (sliderPan) sliderPan.disabled = false;
  if (sliderVolume) sliderVolume.disabled = false;
  if (sliderPan) sliderPan.value = String(Math.round((panPorFaixa[chave] ?? 0) * 100));
  sincronizarRotulosPan(strip, chave);
  atualizarMixagem();
}

function configurarFader(strip, chave) {
  const trilha = strip.querySelector('.fader-track');

  if (!strip.dataset.faderLigado) {
    function ganhoDoEvento(evento) {
      const rect = trilha.getBoundingClientRect();
      const y = evento.touches ? evento.touches[0].clientY : evento.clientY;
      const fracao = 1 - Math.max(0, Math.min(1, (y - rect.top) / rect.height));
      return fracao * 2;
    }

    let arrastandoFader = false;

    function iniciar(e) {
      if (!strip.classList.contains('pronto')) return;
      arrastandoFader = true;
      definirGanho(strip, chave, ganhoDoEvento(e));
      e.preventDefault();
    }

    function mover(e) {
      if (!arrastandoFader) return;
      definirGanho(strip, chave, ganhoDoEvento(e));
      e.preventDefault();
    }

    function soltar() {
      arrastandoFader = false;
    }

    trilha.addEventListener('mousedown', iniciar);
    trilha.addEventListener('touchstart', iniciar, { passive: false });
    window.addEventListener('mousemove', mover, { passive: false });
    window.addEventListener('touchmove', mover, { passive: false });
    window.addEventListener('mouseup', soltar);
    window.addEventListener('touchend', soltar);

    registrarDuploToqueOuClique(trilha, () => {
      if (!strip.classList.contains('pronto')) return;
      ganhosAnteriores[chave] = 1;
      definirGanho(strip, chave, 1);
      mostrarToast(`${strip.querySelector('.track-label').textContent.trim()}: Volume em 100%`);
    });

    strip.dataset.faderLigado = '1';
  }

  definirGanho(strip, chave, ganhos[chave] ?? 1);
}

function resetarVisualFaixa(strip) {
  const chave = strip.dataset.chave;
  const rotuloVolume = strip.querySelector('.volume-label');
  const botaoMute = strip.querySelector('.mute-btn');
  const botaoSolo = strip.querySelector('.solo-btn');
  const botaoMuteMobile = strip.querySelector('.mute-btn-mobile');
  const botaoSoloMobile = strip.querySelector('.solo-btn-mobile');
  const botaoPot = strip.querySelector('.pot-btn');
  const sliderVolume = strip.querySelector('.volume-slider');
  const rotuloSlider = strip.querySelector('.volume-slider-label');
  const sliderPan = strip.querySelector('.pan-slider');
  const rotuloPan = strip.querySelector('.pan-label');
  const preenchimento = strip.querySelector('.fader-fill');

  ganhos[chave] = 1;
  ganhosAnteriores[chave] = 1;
  panPorFaixa[chave] = 0;
  muteAtivo[chave] = false;
  soloAtivo[chave] = false;

  strip.classList.remove('pronto', 'processando', 'ligada', 'mutada', 'solo', 'atenuada');
  strip.style.removeProperty('--pct');

  if (rotuloVolume) rotuloVolume.textContent = '100%';
  if (preenchimento) preenchimento.style.height = '50%';
  if (rotuloPan) rotuloPan.textContent = 'C';
  if (sliderPan) sliderPan.value = '0';
  if (sliderVolume) sliderVolume.value = '100';
  if (sliderVolume) sliderVolume.style.setProperty('--vol-pct', '50%');
  if (rotuloSlider) rotuloSlider.textContent = '100%';

  if (botaoMute) botaoMute.disabled = true;
  if (botaoSolo) botaoSolo.disabled = true;
  if (botaoMuteMobile) botaoMuteMobile.disabled = true;
  if (botaoSoloMobile) botaoSoloMobile.disabled = true;
  if (botaoPot) botaoPot.disabled = true;
  if (sliderPan) sliderPan.disabled = true;
  if (sliderVolume) sliderVolume.disabled = true;
  botaoMute?.classList.remove('ativo');
  botaoSolo?.classList.remove('ativo');
  botaoMuteMobile?.classList.remove('ativo');
  botaoSoloMobile?.classList.remove('ativo');

  if (faixaPanMobileAtual && faixaPanMobileAtual.chave === chave) {
    fecharPainelPanMobile();
  }
}

function criarAudio(jobId, chave) {
  const el = new Audio(`/audio/${jobId}/${chave}`);
  el.preload = 'auto';
  el.crossOrigin = 'anonymous';
  audios[chave] = el;
  conectarProcessamentoAudio(chave, el);

  el.addEventListener('loadedmetadata', () => {
    if (chave === primeiraChaveCarregada() && isFinite(el.duration) && el.duration > 0) {
      scrubber.max = Math.floor(el.duration * 10);
      atualizarTempos(0, el.duration);
      atualizarVisualScrubber(0, el.duration);
    }
  });

  el.addEventListener('timeupdate', () => {
    if (chave !== primeiraChaveCarregada()) return;
    if (arrastandoBarra) return;
    scrubber.value = Math.floor(el.currentTime * 10);
    atualizarTempos(el.currentTime, el.duration);
    atualizarVisualScrubber(el.currentTime, el.duration);
    corrigirSincronia(el.currentTime);
  });

  atualizarMixagem();
}

function ativarFaixa(strip, jobId, chave) {
  strip.classList.add('pronto');
  criarAudio(jobId, chave);
  configurarControlesFaixa(strip, chave);
  configurarFader(strip, chave);
  atualizarPainelDownloads();
  atualizarMixagem();
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

function atualizarVisualScrubber(atual, duracao) {
  const duracaoValida = Number.isFinite(duracao) && duracao > 0;
  const pct = duracaoValida ? Math.max(0, Math.min(100, (atual / duracao) * 100)) : 0;
  scrubber.style.setProperty('--seek-pct', `${pct}%`);
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

  if (tocando && contextoAudio && contextoAudio.state === 'suspended') {
    contextoAudio.resume();
  }

  Object.values(audios).forEach((a) => {
    if (tocando) {
      a.play().catch(() => {
        tocando = false;
        botaoPlay.textContent = '▶';
      });
    } else {
      a.pause();
    }
  });
});

function pularTempo(segundos) {
  const ref = audios[primeiraChaveCarregada()];
  if (!ref) return;
  const duracao = isFinite(ref.duration) ? ref.duration : 0;
  const destino = Math.max(0, Math.min(duracao || ref.currentTime + segundos, ref.currentTime + segundos));
  Object.values(audios).forEach((a) => {
    a.currentTime = destino;
  });
  atualizarTempos(destino, duracao);
  atualizarVisualScrubber(destino, duracao);
  scrubber.value = Math.floor(destino * 10);
}

botaoBackward?.addEventListener('click', () => {
  pularTempo(-5);
  mostrarToast('Voltou 5s');
});

botaoForward?.addEventListener('click', () => {
  pularTempo(5);
  mostrarToast('Avancou 5s');
});

scrubber.addEventListener('mousedown', () => arrastandoBarra = true);
scrubber.addEventListener('touchstart', () => arrastandoBarra = true);
scrubber.addEventListener('input', () => {
  const t = scrubber.value / 10;
  const ref = audios[primeiraChaveCarregada()];
  atualizarTempos(t, ref ? ref.duration : 0);
  atualizarVisualScrubber(t, ref ? ref.duration : 0);
});
scrubber.addEventListener('change', () => {
  const t = scrubber.value / 10;
  Object.values(audios).forEach(a => a.currentTime = t);
  const ref = audios[primeiraChaveCarregada()];
  atualizarVisualScrubber(t, ref ? ref.duration : 0);
  arrastandoBarra = false;
});

function pararTudo() {
  Object.values(audios).forEach(a => { a.pause(); a.src = ''; });
  audios = {};
  nosGanho = {};
  nosPan = {};
  fontes = {};
  tocando = false;
  botaoPlay.textContent = '▶';
  scrubber.value = 0;
  atualizarTempos(0, 0);
  atualizarVisualScrubber(0, 0);
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
      secaoBiblioteca.style.display = telaAtual === 'mesa' ? 'none' : 'block';

      lista.forEach(item => {
        bibliotecaAtual[item.job_id] = item;
        const opcao = document.createElement('option');
        opcao.value = item.job_id;
        opcao.textContent = `${item.nome} — ${item.data}`;
        seletorBiblioteca.appendChild(opcao);
      });
    })
    .catch(() => {
      // Se falhar, mantemos a tela funcional e mostramos o erro.
      if (telaAtual !== 'mesa') secaoBiblioteca.style.display = 'block';
      mostrarErro('Nao foi possivel carregar a biblioteca agora.');
    });
}

seletorBiblioteca?.addEventListener('change', () => {
  const jobId = seletorBiblioteca.value;
  const item = bibliotecaAtual[jobId];
  if (item) abrirDaBiblioteca(item.job_id, item.nome, item.prontos);
});

botaoRemoverBiblioteca?.addEventListener('click', () => {
  const jobId = seletorBiblioteca.value;
  if (!jobId) return;
  fetch(`/biblioteca/${jobId}`, { method: 'DELETE' }).then(() => carregarBiblioteca());
});

function abrirDaBiblioteca(jobId, nome, prontos) {
  pararTudo();
  caixaErro.style.display = 'none';
  jobAtual = jobId;
  nomeMusica.textContent = nome;
  mostrarTelaMesa();
  statusLinha.textContent = '';
  atualizarPainelDownloads();

  strips.forEach(strip => {
    const chave = strip.dataset.chave;
    const pronto = prontos.includes(chave);
    resetarVisualFaixa(strip);
    if (pronto) {
      ativarFaixa(strip, jobId, chave);
    }
  });

  transporte.classList.add('ativa');
}

botaoVoltarImportacao?.addEventListener('click', () => {
  pararTudo();
  mostrarTelaImportacao();
});

botaoAbrirDownloads?.addEventListener('click', () => {
  atualizarPainelDownloads();
  painelDownloads?.classList.toggle('aberto');
});

botaoAjuda?.addEventListener('click', () => {
  painelAjuda?.classList.toggle('aberto');
});

botaoFecharAjuda?.addEventListener('click', () => {
  painelAjuda?.classList.remove('aberto');
});

panMobileFechar?.addEventListener('click', () => {
  fecharPainelPanMobile();
});

painelPanMobile?.addEventListener('click', (evento) => {
  if (evento.target === painelPanMobile) {
    fecharPainelPanMobile();
  }
});

panMobileSlider?.addEventListener('input', () => {
  if (!faixaPanMobileAtual) return;
  const { strip, chave } = faixaPanMobileAtual;
  const valor = Number(panMobileSlider.value) / 100;
  panPorFaixa[chave] = valor;

  const sliderPanFaixa = strip.querySelector('.pan-slider');
  if (sliderPanFaixa) sliderPanFaixa.value = panMobileSlider.value;

  atualizarPan(chave);
  sincronizarRotulosPan(strip, chave);
});

registrarDuploToqueOuClique(panMobileSlider, () => {
  if (!faixaPanMobileAtual) return;
  const { strip, chave } = faixaPanMobileAtual;
  panPorFaixa[chave] = 0;
  panMobileSlider.value = '0';

  const sliderPanFaixa = strip.querySelector('.pan-slider');
  if (sliderPanFaixa) sliderPanFaixa.value = '0';

  atualizarPan(chave);
  sincronizarRotulosPan(strip, chave);
  mostrarToast(`${strip.querySelector('.track-label').textContent.trim()}: Pan centralizado`);
});

strips.forEach((strip) => resetarVisualFaixa(strip));
mostrarTelaImportacao();
carregarBiblioteca();