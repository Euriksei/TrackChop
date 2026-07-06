# TrackChop
 V1.0.0

TrackChop é uma aplicação web que separa músicas em múltiplas faixas usando IA (Demucs),
permitindo ouvir cada instrumento de forma isolada diretamente no navegador. Ideal para tirar músicas e praticar.

Você pode separar:
- bateria
- baixo
- guitarra
- teclado
- voz
- outros

Tudo roda localmente no seu computador.

---

# 1. 💻 Instalação

1. Baixar o instalador

```text
TrackChopInstaller.exe
```
2. Instalar

Selecione a pasta de destino e aguarde o processo de instalação.

3. Abrir o Aplicativo
Use o atalho criado para abrir a pagina web e 
(http://localhost:5000) acessar as funcionalidades da aplicação

## 📱 Utilização em Celular (mesma rede Wi-Fi)

Qualquer dispositivo conectado a mesma rede wifi do computador pode ter acesso a essa ferramenta.
Basta verificar no CMD em qual endereço de rede a aplicação esta rodando, e acessar esse mesmo endereço no navegador

Ex:
```IP
http://192.168.21.43:5000
```

⚠️ Mesmo com acesso simultaneos so é possivel fazer o upload de um arquivo por vez

---

# 🎛️ Utilização

Com a aplicação e a pagina web funcionando é extremamente necessario manter a tela
do CMD aberta para que o programa continue rodando.

![alt text](image.png)

1. Usuário envia uma música

2. O backend usa IA (Demucs) para separar as faixas

3. O processamento ocorre localmente no PC

  - Por ser um processo que ocorre diretamente na GPU do computador,
  pode levar em media de 2 a 5 minutos dependendo das configurações do 
  computador e do tamanho da musica.

4. O navegador exibe as faixas separadas em tempo real

5. O usuário pode:
  * ativar/desativar instrumentos
  * controlar volume individual
  * sincronizar playback
  * baixar arquivos .wav


Abra esse endereço no navegador. Arraste uma música e acompanhe as faixas "acendendo"
conforme ficam prontas.

## 🎵 Usando o player

Depois que todas as faixas terminam de processar, aparece um player embaixo da mesa:

- **Clique em qualquer faixa** (bateria, baixo, guitarra, teclado, voz, outros) pra
  ativá-la, silenciá-la ou reduzir o volume — a barra de nível "apaga" quando a faixa está muda.
- Combine quantas quiser tocando juntas (ex: só baixo + bateria, ou voz + guitarra).
- O **▶** toca/pausa todas as faixas juntas, sempre sincronizadas.
- A **barra de progresso** funciona como em qualquer player — arraste para navegar na música.
- Cada faixa também tem um link **"baixar"** abaixo, se quiser o arquivo `.wav` separado.

Tudo isso toca direto no navegador (usando os próprios arquivos separados), sem precisar
baixar nada antes de ouvir. Durante a separação, a barra de cada faixa mostra o progresso
em porcentagem.

### 📚 Biblioteca (não precisa reprocessar)

Toda música separada fica salva automaticamente. Na próxima vez que você abrir o app,
aparece uma seção **"Biblioteca"** no topo, listando as músicas já separadas — clique no
nome pra abrir o player instantaneamente, sem esperar o processamento de novo.

- Os arquivos ficam guardados em `resultados/` e o índice da biblioteca em `biblioteca.json`.
- Pra remover uma música da biblioteca (e liberar espaço em disco), clique no **✕** ao lado
  do item.
- Isso funciona mesmo depois de fechar e abrir o servidor de novo — os dados não se perdem.


## ⚠️ Limitações importantes

- **Seu PC precisa estar ligado e com o CMD rodando** para o app funcionar,
  tanto pra você quanto pra quem acessar pela rede local.
- **Tamanho máximo de upload**: 100MB por arquivo (tamanho ajustavem em novas versões).
- Primeira execução do Demucs pode demorar (download do modelo ~300MB)

🚀 Observações

Este projeto foi feito para uso local e experimental, focado em:

- Processamento de áudio com IA
- Sistemas web locais
- Manipulação de áudio em tempo real
- integração backend + frontend
- Prática musical

# 🧠 Arquitetura técnica

## Backend

* Python + Flask
* Processamento com Demucs (IA)
* Polling de status (/status/<job_id>)

## Frontend
* HTML + CSS + JavaScript puro
* Player sincronizado multi-áudio
* Faders de volume individuais
* Biblioteca local via

