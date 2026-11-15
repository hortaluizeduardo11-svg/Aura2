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
    // ---------------------------------------------------------------- peoples, ages, war, plague, wonders
    'tab-peoples': ['............', '.l.......r.r', '.ll.ggg..rrr', '.GGlgsgs.rhr', '.GhGgggg.rrr', '.GGGgwwg.r.r', '..G..ww.....', '.eee.ddd.ooo', 'eeeeddddoooo', 'eeeedddddooo', 'e.e.d..d.o.o', '............'],
    'tab-war': ['w..........w', 'gw........wg', '.gw......wg.', '..gw....wg..', '...gw..wg...', '....gwwg....', '....wggw....', '...wg..gw...', '.bwg....gwb.', '.nb......bn.', 'nn........nn', 'n..........n'],
    'tab-plague': ['....dddd....', '....xwwx....', '....xwwx....', '...xwwwwx...', '..xwwwwwwx..', '.xwlaaaalwx.', '.xaaGaaGaax.', 'xaaaaaGaaaax', 'xaGaaaaaaGax', 'xaaaGaaaaaax', '.xaaaaaaaax.', '..xxxxxxxx..'],
    'race-sylvan': ['....eeee....', '...eGGGGe...', '..eGhhhhGe..', 'h.ehxhhxhe.h', 'hhehhhhhhehh', '.hehhhrhheh.', '...ehhhhe...', '...eGGGGe...', '..eGGGGGGe..', '.eGGlGGlGGe.', '.eGGGGGGGGe.', '............'],
    'race-stonekin': ['....gggg....', '...gwwwwg...', '..gddddddg..', '..hhhhhhhh..', '..hxhhhhxh..', '..hhhhhhhh..', '..oohhhhoo..', '.oooooooooo.', '.oooo..oooo.', '..oooooooo..', '...oooooo...', '....oooo....'],
    'race-ashborn': ['w..........w', 'ww........ww', '.wwrrrrrrww.', '..rrrrrrrr..', '..rkyrrykr..', '..rrrrrrrr..', '..rrnrrnrr..', '..rwrrrrwr..', '..rwrrrrwr..', '...rrrrrr...', '....rrrr....', '............'],
    'race-saurian': ['....o.o.o...', '...ooooooo..', '..GGGGGGGG..', '.GGGyGGGGGG.', '.GGkGGGGGGGG', 'GGGGGGGGGGGG', 'lllllllGGGG.', '.wlwlwlGGG..', '..lllllGG...', '.....GGGG...', '....GGGGGG..', '............'],
    'race-hivekin': ['.b........b.', '..b......b..', '...b....b...', '....oooo....', '...oooooo...', '..ookkookko.', '..ookkookko.', '..oooooooo..', '...onooono..', '....oooo....', '...n....n...', '............'],
    'race-tidefolk': ['.....B......', '....BBc.....', '...cccccc...', 'c.cccccccc.c', 'ccckcccckccc', 'cccccccccccc', '.cccccccccc.', '..cSSSSSSc..', '...cSSSSc...', '..B.cccc.B..', '.BB......BB.', '............'],
    'race-lithari': ['.....c......', '....cSc.....', '...cSSBc....', '..cSSBBc.p..', '..cSBBBcpPp.', '..cSBBNcpPp.', '..cSBNNcpvp.', '..cBBNNc.p..', '...cBNc.....', '..pccccp....', '.ppppppppp..', '............'],
    'race-voidborn': ['...gggggg...', '..gwwwwwwg..', '.gwwwwwwwwg.', '.gwwwwwwwwg.', '.gkkkwwkkkg.', '.gkkkwwkkkg.', '..gkwwwwkg..', '..gwwwwwwg..', '...gwddwg...', '....gwwg....', '.....gg.....', '............'],
    'uplift': ['.....y......', '....yzy.....', '.....y......', '...nnnnn....', '..nnnnnnn...', '..ntthttn...', '..nkthtkn...', '..ntttttn...', '...ntxtn....', '..nnnnnnn...', '.nnnnnnnnn..', '.nn.....nn..'],
    'eureka': ['....zzzz....', '...zyyyyz...', '..zyyzzyyz..', '..zyzzzzyz..', '..zyyzzyyz..', '...zyyyyz...', '....zyyz....', '....gddg....', '....dggd....', '....gddg....', '.....dd.....', 'y..........y'],
    'brain': ['...yyyyyy...', '..yzyoyzyy..', '.yzoyyyoyzy.', '.yyyoyyyyoy.', 'yoyyyoyyoyyy', 'yyozyyyozyoy', 'yyyyoyyyyyyy', '.yoyyyyoyyy.', '.yyyoyyyyoy.', '..yyyyyyyy..', '....oyyo....', '.....oo.....'],
    'declare': ['w...........', 'wrrrrrrr....', 'wrrrrrrrr...', 'wrryrryrr...', 'wrrrryrrr...', 'wrrrrrrrr...', 'wrrrrrrr....', 'w......g....', 'w.....gw....', 'w....gw.....', 'w.bbgw......', 'w.nb........'],
    'treaty': ['............', '.ssssssssss.', 'sbssssssssbs', '.sdddddddds.', '.ssssssssss.', '.sddddddds..', '.ssssssssss.', '.sdddd..rr..', '.ssssss.rr..', 'sbssssssssbs', '.ssssssssss.', '............'],
    'alliance': ['............', '............', '............', 'BB........rr', 'BBBhhhhhhrrr', 'BBhhhhhhhhrr', 'BBhhhhhhhhrr', 'BB.hhhhhh.rr', 'BB..hhhh..rr', 'BB........rr', '............', '............'],
    'revolt': ['....hhhh....', '...hhhhhh...', '...hxhxhh...', '...hhhhhh...', '...hhhhhh...', '....hhhh....', '....rrrr....', '....rrrr....', '....rrrr....', '...rrrrrr...', '..o..o..o...', '.ooooooooo..'],
    'levy': ['.w...w...w..', '.g...g...g..', '.b...b...b..', 'gbg.gbg.gbg.', 'gbg.gbg.gbg.', 'hbh.hbh.hbh.', 'BbB.BbB.BbB.', 'BbB.BbB.BbB.', 'BbB.BbB.BbB.', '.b...b...b..', 'B.B.B.B.B.B.', '............'],
    'fortify': ['............', 'g.g.g..g.g.g', 'gggggg.ggggg', 'gdggdg.gdggd', 'gggggggggggg', 'gdgggdgggdgg', 'gggggggggggg', 'ggdggxxggdgg', 'ggggxkkxgggg', 'gdggxkkxggdg', 'ggggxkkxgggg', 'dddddddddddd'],
    'blitz': ['.......yyy..', '......yyy...', '.....yyy....', '....yyyyyy..', '.......yy...', '......yy....', '.....yy.....', '....yyyyy...', '.......y....', '..r...y.....', '.rrr.y......', 'rrrrr.......'],
    'nuke': ['...oooooo...', '..oyyyyyyo..', '.oyzzzzzzyo.', '.oyyzzzzyyo.', '..ooyyyyoo..', '....oyyo....', '....oyyo....', '....oyyo....', '...ooyyoo...', '..ooyyyyoo..', '.oooooooooo.', 'dddddddddddd'],
    'zero': ['............', '.....a......', '..a..a..a...', '...aGGGa....', '..GGlGGGG...', 'aaGlGGeGGaa.', '..GGGeGGG...', '..GGeGGlG...', '...aGGGa....', '..a..a..a...', '.....a......', '............'],
    'legend': ['..........y.', '.........yz.', '........yy..', '.....wwwy...', '....wwwwww..', '...pwwxwwww.', '..ppwwwwwwww', '.pp.wwwww.ww', 'pp..wwwww...', 'p..wwwwww...', '..wwwwwww...', '..wwwwwww...'],
    'starseed': ['y...........', 'zyo.........', '.yoo........', '...oGGGG....', '...GGGGGG...', '..GGkGGkGG..', '..GkkGGkkG..', '..GGGGGGGG..', '...GGllGG...', '....GGGG....', '..G..GG..G..', '.G..G..G..G.'],
    'dive': ['.c..c..c..c.', 'cBccBccBccBc', 'BBBBBBBBBBBB', 'BBBBBBBBBBBB', 'BBBoooBBBBBB', 'BBoooooBBoBB', 'BokooooooooB', 'BBoooooBBoBB', 'BBBoooBBBBBB', 'NNNNNNNNNNNN', 'NNPNNNGNNNPN', 'NPPPNGGGNPPP'],
    'ufo': ['....cccc....', '...cSSSSc...', '..cSSSSSSc..', '.gggggggggg.', 'gwgrgwgrgwgg', '.gggggggggg.', '...c.cc.c...', '..c..cc..c..', '.c...cc...c.', 'c....cc....c', '.....cc.....', '............'],
    'goo': ['............', '....gggg....', '..ggwwggg...', '.ggwggggdg..', '.gwgggddggg.', 'gggggdgggdgg', 'ggdgggggdggg', '.gggdgggggd.', '..dgggggdg..', '...dddgdd...', '.g...g....g.', '............'],
    'hole': ['....pppp....', '..ppvvvvpp..', '.pvooooovvp.', '.vooxxxxoov.', 'pvoxkkkkxovp', 'pvoxkkkkxovp', 'pvoxkkkkxovp', '.vooxxxxoov.', '.pvoooooovp.', '..ppvvvvpp..', '....pppp....', '............'],
    'dragon': ['r.........r.', 'rr.......rr.', 'rrr.....rrr.', '.rrrr.rrrr..', '..rrrrrrr...', '...rrrrrkr..', '...rrrrrrrr.', '..rrrrr..y..', '.rrrrr......', 'rrr.rr......', 'r....rr.....', '.......r....'],
    // ---------------------------------------------------------------- realms, wonders, monsters
    'tab-realms': ['............', '............', '.y...y...y..', '.yy.yyy.yy..', '.yyyyyyyyy..', '.yryyByyry..', '.yyyyyyyyy..', '.yyyyyyyyy..', '.ooooooooo..', '............', '............', '............'],
    'crown': ['............', '.....r......', '.y...y...y..', '.yy.yyy.yy..', '.yyyyyyyyy..', '.yByyryyBy..', '.yyyyyyyyy..', '.ooooooooo..', '............', '....hhhh....', '...hxhhxh...', '...hhhhhh...'],
    'assassin': ['..........w.', '.........wg.', '........wg..', '.......wg...', '......wg....', '.....wg.....', '..n.wg......', '..nng.......', '...nn.......', '..n.nn......', '.n...n......', '............'],
    'hero': ['.....y......', '....yzy.....', '.....y......', '....hhh.....', '....hhh...w.', '...BBBBB.wg.', '..hBBBBBwg..', '..hBBBBBg...', '....BBB.....', '....B.B.....', '...nn.nn....', '............'],
    'prophet': ['....zzzz....', '...z....z...', '....hhhh....', '....hxxh....', '....hhhh....', '.....hh.....', '...wwwwww...', '..wwwwwwww..', '..wwwwwwww..', '..wwwwwwww..', '...wwwwww...', '...ww..ww...'],
    'golden': ['.....y......', '.y...y...y..', '..y.zzz.y...', '...zyyyz....', 'yyzyyyyyzyy.', '...zyyyz....', '..y.zzz.y...', '.y...y...y..', '.....y......', '.ooooooooo..', 'oyoyoyoyoyo.', '.ooooooooo..'],
    'revolution': ['.r..........', '.rrrrr......', '.rrrrrr.....', '.rrrrr......', '.r..........', '.r...oo.....', '.r..oyyo....', '.r..oyyo....', '.r...bb.....', '.r...bb.....', '.r...bb.....', '.r...bb.....'],
    'unite': ['............', '.BB......rr.', 'BBBB....rrrr', 'BBBB....rrrr', '.BB......rr.', '...B....r...', '....Bppr....', '.....pp.....', '....pppp....', '...pppppp...', '...pppppp...', '....pppp....'],
    'exodus': ['............', '..hh........', '..BB...hh...', '.BBBB..BB...', '..BB..BBBB..', '.B..B..BB...', '......B..B..', '.ss..ss..ss.', 'ss..ss..ss..', '.ss..ss..ss.', '..ss..ss..ss', '............'],
    'town': ['............', '.....rr.....', '....rrrr....', '...rrrrrr...', '..rrrrrrrr..', '...wwwwww...', '...wyywyw...', '...wwwwww...', '...wwbbww...', 'GGGwwbbwwGGG', 'GGGGGGGGGGGG', '............'],
    'metropolis': ['......c.....', '......c.....', '.....ccc....', '.....cBc.dd.', '..gg.ccc.dd.', '..gg.cBc.dy.', '..gy.ccc.dd.', 'dd.g.cBc.dy.', 'dd.gyccc.dd.', 'dyggcccc.dd.', 'dddddddddddd', '............'],
    'wonder': ['.....yy.....', '.....ss.....', '....ssss....', '....ssss....', '...ssssss...', '...ssssss...', '..ssssssss..', '..ssssssss..', '.ssssssssss.', '.sssssnnsss.', 'sssssnnnnsss', 'dddddddddddd'],
    'launch': ['.....w......', '....www.....', '....wBw.....', '....www.....', '....www.....', '....wrw.....', '...wwwww....', '...w.y.w....', '.....o......', '....oyo.....', '...o.o.o....', '..d..d..d...'],
    'kraken': ['............', '....pppp....', '...pppppp...', '...pyppyp...', '...pppppp...', '...pppppp...', '.p.pp.pp.p..', 'p..p..p..p..', 'p.pp..pp..p.', 'pp..pp..pp.p', 'BBBBBBBBBBBB', 'BcBBBcBBBcBB'],
    'kaiju': ['.....eee....', '....eeyee...', '....eeeee...', '...weeee....', '....eeee....', '.l..eeeeee..', 'lll.eeeeeee.', '.l.eeeeeeeee', '...eeeeeeeee', '....ee..ee.e', '....ee..ee..', '...eee.eee..'],
    'locusts': ['..x...x.....', '.x.x.x.x..x.', '..x...x..x.x', '...x.....x..', '.x...x.x....', 'x.x.x.x.x...', '.x...x...x.x', '....x...x.x.', 'GGGGGGGGGGGG', 'GaGGaGGaGGaG', 'bbbbbbbbbbbb', '............'],
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
