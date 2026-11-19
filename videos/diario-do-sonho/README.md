# Diário de sonhos — Dia 1

**E se desse pra ouvir o tempo passar mais devagar?**

Vídeo educativo em animação 2D, vertical 9:16 (1080 × 1920, 30 qps, 1 min 54 s), com narração
em português brasileiro. Uma entrada de diário de sonhos inspirada em *A Origem*, contada como
uma história:

1. **Dia 1** — o narrador dorme vendo *A Origem*, de fone. O despertador toca no quarto real (440 Hz).
2. **Nível 1** — o quarto afunda no sonho; o mesmo despertador chega lento e grave. "Quem buzinou
   no meu quarto?" Ele percebe que está sonhando, igual no filme.
3. **Sonho dentro de sonho** — como o filme funciona: a música no fone de quem dorme avisa que o
   chute (a queda) vai chegar; cada nível corre mais rápido que o de cima, então a música de fora
   chega esticada.
4. **A suspeita** — no filme a van cai no rio: será que o som ficou grave por entrar na água? O
   teste no aquário mostra que não: a frequência continua 440 Hz.
5. **A resposta** — foi o tempo: 440 Hz a 0,5× sem correção de tom vira 220 Hz (gráficos de
   pressão do ar na mesma escala: 4 ciclos contra 2).
6. **Mais fundo** — no nível 2 o despertador cai para 110 Hz; no filme, que estica o tempo umas
   20× por nível, viraria 22 Hz, quase grave demais pra ouvir. Vem o chute, em câmera lenta.
7. **Acordar?** — ele acorda, gira o pião como no filme, anota tudo e pausa o despertador... e as
   notas voltam graves. "Se eu pausei aqui… quem apertou o play lá fora?" O fio puxa a página e o
   vídeo volta ao primeiro quadro (loop).

Arquivo final: `out/diario-do-sonho-dia1.mp4`

Os cenários do filme aparecem só como rabiscos genéricos do narrador (trem, van na ponte, corredor
de hotel, montanhas de neve, pião); personagens e melodia são originais.

## Como foi feito (tudo gerado por código, sem imagens prontas)

| Arquivo | O que faz |
| --- | --- |
| `narration.py` | Roteiro, blocos de legenda e voz neural pt-BR (edge-tts). Os números são falados por extenso com concordância ("quatrocentas e quarenta vibrações"). |
| `timeline.py` | Linha do tempo única: cada fala entra quando a anterior termina de ser falada. Áudio e imagem leem daqui. |
| `audio.py` | Melodia original de três notas (lá4, mi5, dó#5), tons puros de 440/220 Hz no mesmo volume, trilha lo-fi original, efeitos sintetizados e mixagem. A versão "do sonho" é a mesma gravação **reamostrada** (0,5× e 0,25×): dura mais e cai uma ou duas oitavas, como no filme. |
| `draw.py` | Biblioteca de desenho "diário": papel granulado, linhas azuis, contornos de caneta com tremida (*line boil*), cores chapadas de marca-texto, texto que se escreve sozinho. |
| `character.py` | O narrador (moletom amarelo, fones grandes, sobrancelhas grossas) e os bonecos-rabisco. Um único desenho, só a pose muda. |
| `scenes.py` | As sete partes da história, transições e legendas. |
| `render.py` | Renderização paralela (Cairo → ffmpeg) e montagem com o áudio. |

## Reproduzir

```bash
pip install pycairo numpy scipy edge-tts
# fontes (Google Fonts, OFL): Fredoka, Caveat Brush, Patrick Hand em ~/.fonts
python3 narration.py build/voice2     # voz (gera cache em build/voice2)
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
