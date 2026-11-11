# E se a luz contornasse paredes como o som?

## Descrição para a publicação

Você ouve alguém atrás da esquina, mas não vê essa pessoa. E se a luz contornasse paredes como o som? 🔦🧱

A luz visível **já sofre difração**, mas numa porta de 1 m o efeito é muito pequeno, porque o comprimento de onda dela (~500 nm) é cerca de 2 milhões de vezes menor que a abertura. Para muitos sons, com comprimentos de onda de dezenas de centímetros a alguns metros, a porta é "do tamanho certo", e o som se espalha pelas bordas.

Nesta simulação aumentamos o comprimento de onda (500 nm → 1 cm → 10 cm → 1 m) e imaginamos um observador capaz de detectar essas ondas. Ondas de centímetros ou metros **não são luz visível**: são micro-ondas e ondas de rádio. Receber sinal de uma região escondida também não significa ver uma imagem nítida dela, porque a difração limita os detalhes que um sistema consegue distinguir.

O segredo está na escala: a diferença é a relação entre o comprimento de onda e o tamanho dos obstáculos.

#física #ondas #difração #luz #som #ciência #curiosidades

## Créditos e referências (não narrados)

> Os princípios de difração são reais. A visão adaptada e a alteração controlada do comprimento de onda são recursos fictícios usados para explorar a hipótese.

A explicação sobre difração se baseia na seção 1.6, "Huygens's Principle". A explicação sobre perda de detalhes e resolução se baseia na seção 4.5, "Circular Apertures and Resolution".

Ling, S. J., Sanny, J., & Moebs, W. (2016). *University physics volume 3*. OpenStax. https://openstax.org/details/books/university-physics-volume-3

- Seção 1.6: https://openstax.org/books/university-physics-volume-3/pages/1-6-huygenss-principle
- Seção 4.5: https://openstax.org/books/university-physics-volume-3/pages/4-5-circular-apertures-and-resolution

## Notas sobre o que aparece na tela

- **Paredes**: barreiras ideais opacas em todas as etapas. O sinal só passa pela abertura de 1 m e se espalha a partir das bordas, sem atravessar a parede.
- **Mapas de intensidade e frentes de onda**: calculados pelo princípio de Huygens–Fresnel (soma de fontes secundárias ao longo da abertura, modelo escalar 2D) para cada comprimento de onda; veja `tools/campos.py`. A intensidade é mostrada em escala logarítmica, relativa à de uma onda sem parede.
- **Espaçamento das frentes**: só o caso de 1 m está em escala. Para 500 nm, 1 cm e 10 cm, o espaçamento desenhado foi ampliado e a tela indica "espaçamento fora de escala". As cores são simbólicas ("Representação das ondas").
- **Som**: representado com λ ≈ 1 m (cerca de 340 Hz), um valor típico da faixa da voz.
- **Valores do painel**: 500 nm, 1 cm, 10 cm e 1 m são etapas ilustrativas da comparação. Não marcam limites em que a difração começa de repente.
- **Resolução**: o critério de Rayleigh para aberturas circulares, θ ≈ 1,22 λ/D, mostra por que comprimentos de onda grandes borram os detalhes.

## Ficha técnica

- Formato: vertical 9:16, 1080 × 1920, 30 fps, cerca de 95 s (90 s de conteúdo e 5 s de créditos).
- Animação: Three.js (low-poly, materiais foscos, luz de fim de tarde), renderizada quadro a quadro.
- Narração: voz sintética em português brasileiro (Kokoro TTS, voz `pm_alex`).
- Trilha e efeitos: sintetizados em `tools/audio.py`.
- Tipografia: Instrument Serif e Inter.
