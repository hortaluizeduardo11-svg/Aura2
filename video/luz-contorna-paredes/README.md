# Vídeo: "E se a luz contornasse paredes como o som?"

Vídeo educativo vertical (1080 × 1920, cerca de 95 s) em animação 3D low-poly sobre difração. O vídeo final fica em `saida/e-se-a-luz-contornasse-paredes.mp4`. A descrição da publicação, os créditos e as referências estão em [`descricao.md`](descricao.md).

## Como foi feito

Todo o vídeo é gerado por código, de forma reprodutível:

| Etapa | Arquivo | O que faz |
|---|---|---|
| Física | `tools/campos.py` | Calcula, pelo princípio de Huygens–Fresnel, a intensidade e a fase atrás da abertura de 1 m para λ = 500 nm, 1 cm, 10 cm e 1 m. Gera `scene/data/campo_*.png`. |
| Narração | `tools/narracao.py` | Sintetiza a narração, cada cena numa só tomada (sem pausas inseridas), com o tempo de cada palavra para as legendas. Motor offline (Kokoro) ou Azure Speech (`tools/tts_azure.py`, voz neural mais humana). Gera `scene/data/timeline.json` e `scene/data/warp.json`. |
| Sincronia | `scene/data/warp.json` | Mapa suave do tempo do vídeo para o roteiro visual (`timeline_roteiro.json`), ancorado em cada trecho de legenda: trocar a voz não desalinha nenhum evento. |
| Visão simulada | `tools/visao.py` | Imagem da pessoa escondida borrada pela difração (padrão de Airy, abertura de 1 m) para λ = 1 cm, 10 cm e 1 m. |
| Cena | `scene/` | Página Three.js com cidade, personagens, ondas, painel e legendas. `window.renderAt(t)` desenha qualquer instante de forma determinística. |
| Captura | `tools/render.mjs` | Abre a cena no Chromium headless e grava os quadros direto no ffmpeg. |
| Áudio | `tools/audio.py` | Trilha instrumental sintetizada, efeitos (passos, transições, painel) e mixagem com ducking sob a narração. |
| Montagem | `tools/montar.sh` | Junta o vídeo, normaliza o áudio em −14 LUFS e exporta o MP4 final. |

Arquivos da cena:

- `scene/js/timeline.js`: roteiro visual (câmeras, poses, ondas e painel em função de t)
- `scene/js/world.js`: cidade, muro com a abertura e pátio
- `scene/js/people.js`: personagens
- `scene/js/waves.js`: shader das frentes de onda e do mapa de intensidade
- `scene/js/annotations.js`: régua, linha de visão, limites da sombra e controle fictício
- `scene/js/overlay.js` e `scene/index.html`: legendas, destaques, painel, cartões e créditos

## Reproduzir

Requisitos: Node 22+, Playwright com Chromium, ffmpeg, Python 3.11+.

```bash
cd video/luz-contorna-paredes
npm install
pip install -r tools/requirements.txt

# modelos de voz (GitHub releases do kokoro-onnx)
mkdir -p modelos
curl -L -o modelos/kokoro-v1.0.onnx https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
curl -L -o modelos/voices-v1.0.bin  https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin
python3 tools/expor_duracoes.py modelos      # cria kokoro-v1.0-dur.onnx

python3 tools/campos.py                      # mapas de difração
python3 tools/narracao.py modelos            # narração e tempos das legendas (voz offline)
# ou, com a voz neural do Azure (chave como segredo de rede do ambiente para
# brazilsouth.tts.speech.microsoft.com, cabeçalho Ocp-Apim-Subscription-Key, ou AZURE_SPEECH_KEY):
# python3 tools/narracao.py modelos --motor azure --regiao brazilsouth --voz pt-BR-AntonioNeural
node tools/render.mjs --retrato && python3 tools/visao.py   # visão simulada da pessoa escondida
node tools/render.mjs --eventos              # tempos de eventos para o áudio
python3 tools/audio.py                       # trilha, efeitos e mixagem
node tools/render.mjs --full --from 0 --to 38 &
node tools/render.mjs --full --from 38
wait
bash tools/montar.sh                         # saida/e-se-a-luz-contornasse-paredes.mp4
```

Para conferir um instante específico: `node tools/render.mjs --preview 12.5,30,59` (gera PNGs em `build/preview/`).
