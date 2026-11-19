# Diário de sonhos — Dia 1

**E se desse pra ouvir o tempo passar mais devagar?**

Vídeo educativo em animação 2D, vertical 9:16 (1080 × 1920, 30 qps), com narração em
português brasileiro. Uma entrada de diário de sonhos inspirada em *A Origem*: o narrador
ouve o seu "sinal de despertar" mais lento e mais grave dentro do sonho, testa a hipótese da
refração e descobre que o que muda é a velocidade de reprodução: tocar a gravação a 0,5× sem
correção de tom faz 440 Hz virarem 220 Hz.

Arquivo final: `out/diario-do-sonho-dia1.mp4`

## Como foi feito (tudo gerado por código, sem imagens prontas)

| Arquivo | O que faz |
| --- | --- |
| `narration.py` | Roteiro, blocos de legenda e voz neural pt-BR (edge-tts). Os números são falados por extenso com concordância ("quatrocentas e quarenta vibrações"). |
| `timeline.py` | Linha do tempo única: cada fala entra quando a anterior termina de ser falada. Áudio e imagem leem daqui. |
| `audio.py` | Melodia original de três notas (lá4, mi5, dó#5), tons puros de 440/220 Hz no mesmo volume, trilha lo-fi original, efeitos sintetizados e mixagem. A versão "do sonho" é a mesma gravação **reamostrada** (0,5× e 0,25×): dura mais e cai uma ou duas oitavas, como no filme. |
| `draw.py` | Biblioteca de desenho "diário": papel granulado, linhas azuis, contornos de caneta com tremida (*line boil*), cores chapadas de marca-texto, texto que se escreve sozinho. |
| `character.py` | O narrador (moletom amarelo, fones grandes, sobrancelhas grossas) e os bonecos-rabisco. Um único desenho, só a pose muda. |
| `scenes.py` | As cinco cenas, transições e legendas. |
| `render.py` | Renderização paralela (Cairo → ffmpeg) e montagem com o áudio. |

## Reproduzir

```bash
pip install pycairo numpy scipy edge-tts
# fontes (Google Fonts, OFL): Fredoka, Caveat Brush, Patrick Hand em ~/.fonts
python3 narration.py build/voice      # voz (gera cache em build/voice)
python3 audio.py                      # build/mix.wav + build/timeline.json
python3 render.py out/diario-do-sonho-dia1.mp4 --jobs 4
```

## Decisões de direção

- **Realidade** em creme, azul-claro e amarelo, câmera estável; **sonho** em azul-marinho e
  lilás, quarto inclinado ~4°, cortina flutuando, sombras longas e movimentos esticados (a
  caneta leva toda a melodia lenta para tocar o chão).
- Transições com ideia: o fio do fone vira o trilho do trem; o trilho vira o eixo do tempo
  (os dormentes viram as marcas do eixo); o narrador desenha e enche o aquário com
  marca-texto azul; no fim, o fio puxa a página e revela o primeiro quadro (loop).
- Antes de cada comparação a trilha cai a silêncio; nas comparações só aparece o valor da
  frequência (440 Hz em amarelo, 220 Hz em lilás). Os gráficos de pressão do ar usam a mesma
  escala e a mesma amplitude: 4 ciclos contra 2 ciclos na mesma janela de tempo.
- Na água as frentes de compressão andam ~4,35× mais rápido e ficam ~4,35× mais afastadas,
  mas passam no mesmo ritmo (os detectores piscam juntos): a frequência não muda. A
  animação das frentes está em câmera lenta para ficar visível.
- Legendas com no máximo duas linhas, área útil longe dos botões laterais e da descrição do
  TikTok.
