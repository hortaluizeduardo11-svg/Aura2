/* ==========================================================================
   UGF — DADOS DO DROP
   --------------------------------------------------------------------------
   Este é o único arquivo que precisa mudar para atualizar a loja:
   produtos, preços, tamanhos, tabela de medidas, WhatsApp e Instagram.
   O site (vitrine horizontal, página do produto, tabela de medidas e
   dados estruturados para o Google) é gerado a partir daqui.

   Imagens de produto: para cada peça exporte frente e costas em 4:5,
   em três larguras, com estes nomes:
     assets/img/products/<slug>-front-640.webp   (e -1000, -1300)
     assets/img/products/<slug>-back-640.webp    (e -1000, -1300)
   ========================================================================== */

window.UGF = {
  site: {
    // TODO: número oficial do WhatsApp, só dígitos com DDI + DDD (ex.: 5511999999999)
    whatsapp: '5500000000000',
    // TODO: perfil oficial do Instagram
    instagram: 'https://www.instagram.com/',
    instagramHandle: '@ugf',
  },

  drop: {
    number: '01',
    name: 'Drop 01',
    year: 2026,
  },

  sizes: ['P', 'M', 'G', 'GG'],

  // Medidas em centímetros, peça aberta na horizontal.
  // TODO: valores de referência para modelagem oversized; substituir pelas medidas reais da produção.
  sizeChart: {
    columns: ['Tamanho', 'Largura (peito)', 'Comprimento', 'Manga'],
    rows: [
      ['P', 58, 68, 60],
      ['M', 61, 70, 61],
      ['G', 64, 72, 62],
      ['GG', 67, 74, 63],
    ],
  },

  // Especificações comuns às peças do drop (aparecem na página do produto).
  specs: [
    ['Tecido', 'Algodão pesado 400g'],
    ['Lavagem', 'Vintage, estonada'],
    ['Modelagem', 'Oversized'],
    ['Acabamento', 'Punhos e barra em ribana'],
  ],

  products: [
    {
      slug: 'starburst-hoodie',
      name: 'Starburst Hoodie',
      type: 'Moletom com capuz',
      price: 179.9,
      colorway: 'Cinza Estonado',
      colorwayEn: 'Washed vintage',
      spec: '400G / Heavyweight / Washed vintage',
      front: 'Logo orbital pequeno no peito.',
      back: 'Estrela de 8 pontas em explosão + “Dream Bigger / Est. 2026” nas costas.',
      description:
        'A peça-assinatura do Drop 01. Cinza estonado com lavagem vintage, a estrela da marca estourando nas costas e o logo orbital discreto no peito.',
      images: 'assets/img/products/starburst-hoodie',
      alt: {
        front: 'Starburst Hoodie cinza estonado, frente, com logo orbital UGF pequeno no peito',
        back: 'Starburst Hoodie cinza estonado, costas, com estrela de 8 pontas e a frase Dream Bigger Est. 2026',
      },
    },
    {
      slug: 'tonal-quarter-zip',
      name: 'Tonal Quarter-Zip',
      type: 'Moletom meio-zíper',
      price: 179.9,
      colorway: 'Preto Estonado',
      colorwayEn: 'Washed black',
      spec: '400G / Heavyweight / Washed black',
      front: 'Wordmark tonal “UGF / Dream Bigger / Est. 2026” no peito.',
      back: 'Costas limpas.',
      description:
        'Gola alta com meio-zíper, preto estonado e assinatura tom sobre tom. Discreto de propósito: o detalhe aparece para quem chega perto.',
      images: 'assets/img/products/tonal-quarter-zip',
      alt: {
        front: 'Tonal Quarter-Zip preto estonado, frente, com wordmark UGF tom sobre tom no peito',
        back: 'Tonal Quarter-Zip preto estonado, costas lisas',
      },
    },
    {
      slug: 'dream-bigger-hoodie',
      name: 'Dream Bigger Hoodie',
      type: 'Moletom com capuz',
      price: 179.9,
      colorway: 'Cream',
      colorwayEn: 'Off-white',
      spec: '400G / Heavyweight / Off-white',
      front: 'Wordmark empilhado pequeno no peito.',
      back: '“Dream Bigger / Est. 2026” gigante nas costas.',
      description:
        'O manifesto escrito nas costas. Off-white cremoso, wordmark empilhado no peito e “Dream Bigger” em tamanho real atrás.',
      images: 'assets/img/products/dream-bigger-hoodie',
      alt: {
        front: 'Dream Bigger Hoodie off-white, frente, com wordmark UGF Dream Bigger pequeno no peito',
        back: 'Dream Bigger Hoodie off-white, costas, com Dream Bigger Est. 2026 em letras grandes',
      },
    },
  ],
};
