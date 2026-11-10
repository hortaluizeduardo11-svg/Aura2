/* AURA: Genesis 2 — icons.js
 * Pixel icons for the power bar, its tabs and the tool dock. Each icon is a 12x12 drawing in a
 * shared palette; it is outlined in near-black like the world's sprites and handed out as a
 * 14x14 image (shown at 3x, pixelated). Drawn once, cached as data URLs. */
'use strict';
(function () {
  const AG = window.AG;
  const PAL = {
    w: '#f6f3ea', g: '#b8b5aa', d: '#77736a', x: '#3a3833', k: '#1c1b17',
    r: '#e0442f', o: '#f39331', y: '#f8d64e', z: '#fff1b0',
    b: '#9a6a3c', n: '#5c3d22', t: '#c99a62', s: '#ecd08a', h: '#f2c695',
    G: '#62c23f', e: '#2e7d32', l: '#b3e46b', a: '#c4ec3c',
    B: '#3f8fe6', c: '#9fe0ff', N: '#2a4f93', S: '#e6f2ff',
    p: '#a066e8', v: '#5d2f8e', P: '#f27bb4',
  };
  // 12 rows of 12 characters each; '.' is transparent
  const ART = {
    // ---------------------------------------------------------------- tabs
    'tab-terrain': ['............', '......w.....', '.....wwd....', '....wdddd...', '...gddddd.w.', '..gdddddddwd', '.gddddddddd.', 'gddddddddddd', 'GGGGGGGGGGGG', 'eGGGeGGGGeGG', 'bbbbbbbbbbbb', '............'],
    'tab-civ': ['............', '..y..y..y...', '..yy.yy.yy..', '..yyyyyyyy..', '..yrryyrry..', '..yyyyyyyy..', '....hhhh....', '....hhhh....', '...BBBBBB...', '..BBBBBBBB..', '..BB.BB.BB..', '....b..b....'],
    'tab-life': ['............', '............', '...wwwwww...', '..wwwwwwwwx.', '.wwwwwwwwwxx', '.wwwwwwwwwxk', '.wwwwwwwwwx.', '..x.x..x.x..', '..x.x..x.x..', '..d.d..d.d..', 'GGGGGGGGGGGG', '............'],
    'tab-weather': ['...dddd.....', '..dggggd....', '.dggggggdd..', 'dggggggggggd', 'dddddddddddd', '......yy....', '.....yy.....', '....yyyyy...', '......yy....', '.....yy.....', '....yy......', '...y........'],
    'tab-ruin': ['y...........', '.yo.........', '..oor.......', '...orr......', '....rxxx....', '....xddgx...', '....xddddx..', '.....xddx...', '..r..xxx..r.', '.rorr....ror', 'rooyoorroyoo', 'xxxxxxxxxxxx'],
    'tab-world': ['............', '............', '............', '............', '............', 'ww..ww..ww..', 'ww..ww..ww..', '............', '............', '............', '............', '............'],
    // ---------------------------------------------------------------- dock and bar
    back: ['............', '....w.......', '...ww.......', '..wwwwwww...', '.wwwwwwwww..', '..ww.....ww.', '...w......w.', '..........w.', '.........ww.', '....wwwwww..', '....wwwww...', '............'],
    brush: ['..........b.', '.........bb.', '........bb..', '.......bb...', '......bb....', '.....nn.....', '....yyn.....', '...yyy......', '..yyy.......', '.yyy........', 'yyy.........', 'y...........'],
    // ---------------------------------------------------------------- look
    inspect: ['............', '...xxxxx....', '..xcccccx...', '.xcwccccBx..', '.xcwccccBx..', '.xcccccccx..', '.xcccccBBx..', '..xcBBBBx...', '...xxxxxbb..', '........bbb.', '.........bbb', '..........b.'],
    possess: ['....pppp....', '...p....p...', '...p.pp.p...', '....pp.p....', '......p.....', '.....hhh....', '.....hhh....', '....BBBBB...', '...B.BBB.B..', '.....BBB....', '.....B.B....', '.....B.B....'],
    // ---------------------------------------------------------------- land
    raise: ['......y.....', '.....yyy....', '....yyyyy...', '......y.....', '......y.....', '....GGGGG...', '...GGGGGGG..', '..GbbbbbbbG.', '.GbbbbnbbbbG', '.bbnbbbbbnbb', '.bbbbbbbbbbb', '............'],
    lower: ['.....y......', '.....y......', '...yyyyy....', '....yyy.....', '.....y......', '............', 'GGGG....GGGG', 'bbbbG..Gbbbb', 'bbbbbBBbbbbb', 'bnbbbBBbbnbb', 'bbbbbbbbbbbb', '............'],
    smooth: ['............', '..ggggggg...', '..gwwwwwg...', '..ggggggg...', '.....dd.....', '.....dd.....', '............', 'GGGGGGGGGGGG', 'bbbbbbbbbbbb', 'bnbbbbbnbbbb', 'bbbbbbbbbbbb', '............'],
    grass: ['............', '............', '..l.....l...', '..l..l..l.l.', '.lG..l.lG.l.', '.lG.lG.lG.G.', 'GlGGlGGlGGlG', 'GGGGGGGGGGGG', 'eGeGeGeGeGeG', 'bbbbbbbbbbbb', 'bnbbbbnbbbbn', '............'],
    forest: ['.....G......', '....GGG.....', '...GGeGG....', '....GGG.....', '...GGGeG....', '..GGeGGGG...', '...GGGGG....', '..GGGGeGGG..', '.GGeGGGGGGG.', '.....bb.....', '.....bb.....', '...GGGGGG...'],
    desert: ['........yy..', '.......yyyy.', '.......yyyy.', '........yy..', '............', '............', '....sss.....', '..ssssss....', '.sssttssss..', 'ssssssssssss', 'sstsssssttss', 'ssssssssssss'],
    grain: ['..y...y...y.', '.yyy.yyy.yyy', '..y...y...y.', '.yyy.yyy.yyy', '..y...y...y.', '.yyy.yyy.yyy', '..t...t...t.', '..t...t...t.', '..t...t...t.', '..t...t...t.', 'GGGGGGGGGGGG', 'bbbbbbbbbbbb'],
    snowcap: ['............', '....S.......', '...cSS......', '..ccSSS.....', '..cSSSS.c...', '.ccSSSSccS..', '.cSSSSSSSSS.', 'ccSSSSSSSSSc', 'cBccSSSSccSc', 'BBccccccccBc', 'BBBBBccBBBBB', '............'],
    // ---------------------------------------------------------------- geology
    plate: ['............', '............', 'bbbbb.......', 'bnbbb..yy...', 'bbbbb..yyy..', 'bbbnbyyyyyy.', 'bbbbb..yyy..', 'bbbbb..yy...', 'bbbbb.dddddd', 'bnbbb.dgdddd', 'bbbbb.dddddd', '............'],
    fault: ['..d......d..', '.d........d.', '............', 'GGGGGG.GGGGG', 'bbbbbb.bbbbb', 'bbbbb.nbbbbb', 'bbbbbn.bbbbb', 'bbbbbb.nbbbb', 'bbbbb.nbbbbb', 'bnbbbb.bbbnb', 'bbbbb.bbbbbb', '............'],
    calm: ['..........G.', '.........GG.', '..G.....GG..', '..GG...GG...', '...GG.GG....', '....GGG.....', 'GGGGGGGGGGGG', 'bbbbbbbbbbbb', 'bbbbbdbbbbbb', 'bbbbbbdbbbbb', 'bnbbbdbbbnbb', 'bbbbbbbbbbbb'],
    erupt: ['....o.r.o...', '...r.oyo.r..', '....oyyyo...', '.....ryr....', '.....xrx....', '....xxrxx...', '...xxxrxxx..', '..xxxxxxxxx.', '.xxdxxxxxdxx', 'xxxxxxxxxxxx', '............', '............'],
    iceage: ['.....c......', '...c.c.c....', '....ccc.....', '.c..ccc..c..', '..ccSSScc...', 'cccSSwSSccc.', '..ccSSScc...', '.c..ccc..c..', '....ccc.....', '...c.c.c....', '.....c......', '............'],
    warm: ['...BBBB..r..', '..BGGBBB.rw.', '.BBGGGBB.r..', '.BBBGBBB.rw.', '.GBBBBGB.r..', '..BBBGGB.rw.', '...BBBB..r..', '.........r..', '........rrr.', '........rrr.', '.........r..', '............'],
    // ---------------------------------------------------------------- elements
    water: ['.....B......', '.....B......', '....BBB.....', '....BcB.....', '...BBcBB....', '...BcBBB....', '..BcBBBBB...', '..BcBBBBB...', '..BBBBBBB...', '...BBBBB....', '....BBB.....', '............'],
    lava: ['.....r......', '.....r......', '....rrr.....', '....ryr.....', '...rryrr....', '...ryoor....', '..ryooooor..', '..ryoooyor..', '..rooooooo..', '...rooooo...', '....rrr.....', '............'],
    acid: ['.........a..', '.....a..a.a.', '.....a...a..', '....aaa.....', '....ala.....', '...aalaa....', '...alaaa....', '..alaaaaa...', '..alaaaGa...', '..aaaaaGa...', '...aaaaa....', '....aaa.....'],
    fire: ['.....r......', '....rr..r...', '....rrr.rr..', '...rrorrrr..', '..rrooorrr..', '..rooyoorr..', '.rrooyyoorr.', '.rroyyyyorr.', '.rroyyyyoor.', '..rooyyoor..', '...rrooorr..', '............'],
    freeze: ['....ccc.....', '....cwc.....', '....cBc..c..', '....cBc.ccc.', '....cBc..c..', '....cBc.....', '....cBc.....', '...cBBBc....', '..cBBBBBc...', '..cBBwBBc...', '...cBBBc....', '....ccc.....'],
    drain: ['............', '...BBBBBB...', '..B......B..', '.B..BBBB..B.', '.B.B....B.B.', '.B.B.BB.B.B.', '.B.B.B..B.B.', '.B..B..B..B.', '..B..BB..B..', '...B....B...', '....BBBB....', '............'],
    // ---------------------------------------------------------------- weather
    rain: ['............', '...gggg.....', '..gwwwwg....', '.gwwwwwwgg..', 'gwwwwwwwwwg.', 'gggggggggggg', '............', '.B..B..B..B.', 'B..B..B..B..', '............', '.B..B..B..B.', 'B..B..B..B..'],
    thunder: ['...dddd.....', '..dggggd....', '.dggggggdd..', 'dggggggggggd', 'dddddddddddd', '......yy....', '.....yy.....', '....yyyyy...', '......yy....', '.....yy.....', '....yy......', '...y........'],
    blizzard: ['...gggg.....', '..gwwwwg....', '.gwwwwwwgg..', 'gwwwwwwwwwg.', 'gggggggggggg', '............', '.c...c...c..', 'ccc.ccc.ccc.', '.c...c...c..', '...c...c....', '..ccc.ccc...', '...c...c....'],
    heat: ['.y.y.y......', '..yyy.......', '.yyoyy......', '..yyy.......', '.y.y.y......', '............', 'tttttttttttt', 'ttnttttnnttt', 'tttnntnttttt', 'ttttnttttntt', 'tnntttttnttt', 'tttttttttttt'],
    bolt: ['.......yyy..', '......yyy...', '.....yyy....', '....yyy.....', '...yyyyyyy..', '......yyy...', '.....yyy....', '....yyy.....', '...yy.......', '..yy........', '.y..........', '............'],
    // ---------------------------------------------------------------- life
    people: ['............', '..hh....hh..', '..hh....hh..', '.BBBB..rrrr.', '.BBBB..rrrr.', '.BBBB..rrrr.', '..BB....rr..', '..BB....rr..', '..bb....bb..', '..b.b..b.b..', '............', 'GGGGGGGGGGGG'],
    grazers: ['............', '............', '...wwwwww...', '..wwwwwwwwx.', '.wwwwwwwwwxx', '.wwwwwwwwwxk', '.wwwwwwwww..', '..x.x..x.x..', '..x.x..x.x..', '............', 'GGGGGGGGGGGG', '............'],
    hunters: ['d.........d.', 'dd.......dd.', 'dgd.....dgd.', 'dggddddddgd.', 'dggggggggggd', 'dgyggggggygd', 'dggggggggggd', '.dgggwwgggd.', '..dggwwggd..', '...dgkkgd...', '....dddd....', '............'],
    birds: ['............', 'ww...ww.....', '.ww.ww......', '..www.......', '...w........', '......ww...w', '.......ww.ww', '........www.', '.........w..', '.ww.ww......', '..www.......', '...w........'],
    apes: ['...nnnnnn...', '..nnnnnnnn..', '.nnhhnnhhnn.', 'nnhhhhhhhhnn', 'nnhkhhhhkhnn', 'nnhhhhhhhhnn', '.nhhhnnhhhn.', '.nhhhhhhhhn.', '..nhhkkhhn..', '...nhhhhn...', '....nnnn....', '............'],
    geneup: ['.p....G..G..', '..p..G..GGG.', '...pG....G..', '...Gp.......', '..G..p......', '.G....p.....', '.G....p.....', '..G..p......', '...Gp.......', '...pG.......', '..p..G......', '.p....G.....'],
    genedown: ['.p....G.....', '..p..G..rrr.', '...pG.......', '...Gp.......', '..G..p......', '.G....p.....', '.G....p.....', '..G..p......', '...Gp.......', '...pG.......', '..p..G......', '.p....G.....'],
    mutate: ['.p....G..y..', '..p..G..yy..', '...pG..yy...', '...Gp.yyyy..', '..G..p..yy..', '.G....pyy...', '.G....py....', '..G..p......', '...Gp.......', '...pG.......', '..p..G......', '.p....G.....'],
    fertile: ['....PPP.....', '...PPyPP....', '...PyyyP....', '...PPyPP....', '....PPP.....', '.....G..y...', '..G..G.yzy..', '..GG.G..y...', '...GGG......', '.....G......', 'GGGGGGGGGGGG', 'bbbbbbbbbbbb'],
    // ---------------------------------------------------------------- divine
    bless: ['.....y......', '.....y......', '....yzy.....', '....yzy.....', '..yyzwzyy...', 'yyzzwwwzzyy.', '..yyzwzyy...', '....yzy.....', '....yzy.....', '.....y......', '.....y......', '............'],
    curse: ['...vvvvvv...', '..vppppppv..', '.vppppppppv.', '.vpkkppkkpv.', '.vpkkppkkpv.', '.vppppppppv.', '..vpppkppv..', '...vppppv...', '...vpvpvv...', '...vvvvvv...', '............', '............'],
    plague: ['..a..a..a...', '...aaaaa....', '.aaGGGGGaa..', '..aGGaGGa...', 'aaGGaGGGGaa.', '..aGGGGaGa..', 'aaGGGGGGGaa.', '..aGaGGGa...', '.aaGGGGGaa..', '...aaaaa....', '..a..a..a...', '............'],
    dream: ['............', '...zzz......', '..zz....w...', '.zz....www..', '.zz.....w...', '.zz.........', '.zz.....w...', '..zz...www..', '...zzz..w...', '............', '..pppppppp..', '.pppppppppp.'],
    omen: ['.........yy.', '........yyz.', '.......yyy..', '......yoo...', '.....oor....', '....orr.....', '...rr.......', '..r.........', '............', '..w.....w...', '.....w......', '..........w.'],
    inspire: ['.....y......', '...y.y.y....', '....yyy.....', '..yyyzyyy...', '....yyy.....', '...y.y.y....', '.....y......', '....hhh.....', '...hhhhh....', '...hhhhh....', '..BBBBBBB...', '.BBBBBBBBB..'],
    harmony: ['............', '.PPP...PPP..', 'PPwPP.PPPPP.', 'PwPPPPPPPPP.', 'PPPPPPPPPPP.', '.PPPPPPPPP..', '..PPPPPPP...', '...PPPPP....', '....PPP.....', '.....P......', '............', '............'],
    discord: ['............', '.rrr..rrrr..', 'rrwrr.rrrrr.', 'rwrrr.rrrrr.', 'rrrrr..rrrr.', '.rrrr.rrrr..', '..rrr..rr...', '...rr.rr....', '....r.r.....', '.....r......', '............', '............'],
    // ---------------------------------------------------------------- disasters
    meteor: ['y...........', '.yo.........', '..oo........', '...ooo......', '....orr.....', '.....rxxx...', '......xddx..', '......xdgdx.', '.......xdddx', '.......xdddx', '........xxx.', '............'],
    volcano: ['...gg.......', '..gddg.g....', '...gg.gdg...', '......gg....', '.....rrr....', '....xrorx...', '...xxroxxx..', '..xxxxrxxxx.', '.xxxxxrxxxxx', 'xxxxxxrrxxxx', 'xxxxxxxrxxxx', '............'],
    tornado: ['gggggggggggg', '.dddddddddd.', '..gggggggg..', '...dddddd...', '....gggggg..', '.....dddd...', '......ggg...', '.....ddd....', '......gg....', '.......d....', '......d.....', '............'],
    tsunami: ['............', '......BBBB..', '....BBccccB.', '...BccBBBcB.', '..BcBB...B..', '.BcBB.......', 'BcBB....B...', 'BBB....BcB..', 'BBBBBBBBcBB.', 'BBBBBBBBBBBB', 'NNNNNNNNNNNN', '............'],
    // ---------------------------------------------------------------- underground
    dig: ['..dddddd....', '.dggggggd...', 'dg..bb..gd..', 'd...bb...d..', '.....bb.....', '.....bb.....', '......bb....', '......bb....', '.......bb...', '.......bb...', '........bb..', '............'],
    fill: ['............', 'dddddddddddd', 'dgggdgggggdg', 'dddddddddddd', 'ggdgggggdggg', 'dddddddddddd', 'dgggdgggggdg', 'dddddddddddd', 'ggdgggggdggg', 'dddddddddddd', '............', '............'],
    ore: ['............', '....xxxx....', '..xxdddxxx..', '.xddoodddx..', '.xdooddyddx.', 'xddddddyydx.', 'xdgdddddddx.', 'xdggddrrddx.', '.xddddrrdx..', '..xxddddx...', '....xxxx....', '............'],
    magma: ['xxxxxxxxxxxx', 'xddddxddddxd', 'xxxxxxxxxxxx', 'dx........xd', 'x..........x', 'x.rrrooorr.x', 'xrrooyyoorrx', 'xroyyyyyyorx', 'xrrooyyoorrx', 'xxrrrrrrrrxx', 'xxxxxxxxxxxx', '............'],
    aquifer: ['xxxxxxxxxxxx', 'xddddxddddxd', 'xxxxxxxxxxxx', 'dx........xd', 'x..........x', 'x.BBBccBBB.x', 'xBBcccccBBBx', 'xBccBBBBccBx', 'xBBBBBBBBBBx', 'xxBBBBBBBBxx', 'xxxxxxxxxxxx', '............'],
  };
  const cache = new Map();
  // An icon as a data URL: the drawing plus a one-pixel near-black outline (14x14 in all).
  function url(id) {
    if (cache.has(id)) return cache.get(id);
    const rows = ART[id] || ART.inspect, c = document.createElement('canvas'); c.width = 14; c.height = 14;
    const g = c.getContext('2d'), on = (x, y) => y >= 0 && y < 12 && x >= 0 && x < 12 && rows[y][x] !== '.';
    g.fillStyle = 'rgba(16,16,13,0.92)';
    for (let y = -1; y <= 12; y++) for (let x = -1; x <= 12; x++) {
      if (on(x, y)) continue;
      if (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1)) g.fillRect(x + 1, y + 1, 1, 1);
    }
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) { const ch = rows[y][x]; if (ch !== '.') { g.fillStyle = PAL[ch] || '#ff00ff'; g.fillRect(x + 1, y + 1, 1, 1); } }
    const u = c.toDataURL();
    cache.set(id, u);
    return u;
  }
  AG.Icons = { url, ART, PAL, has: (id) => !!ART[id] };
})();
