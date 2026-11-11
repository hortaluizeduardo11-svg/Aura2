// Camada de edição (DOM): legendas, destaques, painel, rótulos, cartões e créditos.
// Os textos e fórmulas são gerados aqui, como elementos de edição, para manter a escrita correta.
import { clamp, ss, win } from './timeline.js';

const $ = (id) => document.getElementById(id);

export class Overlay {
  constructor(timeline) {
    this.tl = timeline;
    // o chamado da pessoa escondida também é legendado
    const ch = timeline.chamado;
    this.legendas = [{ txt: '— Ei! Aqui!', t0: ch.t0, t1: ch.t0 + ch.dur }]
      .concat(timeline.cenas.flatMap((c) => c.segmentos.flatMap((s) => s.legendas)));
    this.labels = {};
    this.lastSub = null;
  }

  label(id, html, cls = '') {
    if (!this.labels[id]) {
      const d = document.createElement('div');
      d.className = 'lbl3d ' + cls;
      d.innerHTML = html;
      $('labels').appendChild(d);
      this.labels[id] = d;
    }
    return this.labels[id];
  }

  // pos: {x, y} em pixels, op: opacidade
  placeLabel(id, html, pos, op, cls = '') {
    const d = this.label(id, html, cls);
    if (!pos || op <= 0.001) { d.style.opacity = 0; return; }
    d.style.opacity = op;
    d.style.transform = `translate(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px)`;
  }

  legenda(t) {
    const L = this.legendas;
    let cur = null;
    for (let i = 0; i < L.length; i++) {
      const l = L[i];
      const next = L[i + 1];
      // mantém a legenda até a próxima começar (no máximo 0,6 s após o fim da fala)
      const fim = Math.min(next ? next.t0 - 0.02 : l.t1 + 0.6, l.t1 + 0.6);
      if (t >= l.t0 - 0.06 && t < fim) { cur = { ...l, fim }; break; }
    }
    const el = $('sub');
    if (!cur) { el.style.opacity = 0; return; }
    if (el.dataset.txt !== cur.txt) { el.textContent = cur.txt; el.dataset.txt = cur.txt; }
    const a = ss(cur.t0 - 0.06, cur.t0 + 0.08, t) * (1 - ss(cur.fim - 0.12, cur.fim, t));
    el.style.opacity = a.toFixed(3);
    el.style.transform = `translateY(${((1 - ss(cur.t0 - 0.06, cur.t0 + 0.14, t)) * 10).toFixed(1)}px)`;
  }

  update(t, st) {
    this.legenda(t);

    // ---- destaque ----
    const hl = $('hl');
    const H = st.destaque;
    if (H) {
      if (hl.dataset.txt !== H.txt) { hl.querySelector('.txt').innerHTML = H.txt; hl.dataset.txt = H.txt; }
      hl.style.opacity = H.op.toFixed(3);
      hl.style.top = H.top + 'px';
      hl.style.filter = `blur(${((1 - H.op) * 6).toFixed(2)}px)`;
      hl.style.transform = `translateY(${((1 - H.op) * 14).toFixed(1)}px)`;
    } else hl.style.opacity = 0;

    // ---- painel ----
    const P = st.painel;
    const pn = $('panel');
    pn.style.opacity = P.vis.toFixed(3);
    const va = $('valA'), vb = $('valB');
    if (va.textContent !== P.de) va.textContent = P.de;
    if (vb.textContent !== P.para) vb.textContent = P.para;
    va.style.opacity = (1 - P.mix).toFixed(3);
    va.style.transform = `translateY(${(-P.mix * 40).toFixed(1)}px)`;
    va.style.filter = `blur(${(P.mix * 8).toFixed(1)}px)`;
    vb.style.opacity = P.mix.toFixed(3);
    vb.style.transform = `translateY(${((1 - P.mix) * 40).toFixed(1)}px)`;
    vb.style.filter = `blur(${((1 - P.mix) * 8).toFixed(1)}px)`;
    vb.style.display = P.mix > 0.001 ? 'block' : 'none';
    $('pill').style.opacity = P.pilula.toFixed(3);
    $('pill').style.transform = `translateX(${((1 - P.pilula) * -24).toFixed(1)}px)`;

    // ---- etiqueta "Representação das ondas" ----
    const tag = $('tag');
    tag.style.opacity = st.tag.op.toFixed(3);
    if (tag.dataset.extra !== st.tag.extra) { $('tagExtra').innerHTML = st.tag.extra; tag.dataset.extra = st.tag.extra; }

    // ---- rótulos ancorados no 3D ----
    for (const L of st.rotulos) this.placeLabel(L.id, L.html, L.pos, L.op, L.cls);

    // ---- cartão de definição ----
    $('def').style.opacity = st.def.toFixed(3);
    $('def').style.transform = `translateY(${((1 - st.def) * 16).toFixed(1)}px)`;

    // ---- lupa ----
    this.lupa(t, st.lupa);

    // ---- tela ilustrativa (detector) ----
    const D = st.detector;
    $('detector').style.opacity = D.op.toFixed(3);
    $('detector').style.transform = `translateY(${((1 - D.op) * 20).toFixed(1)}px) scale(${(0.97 + 0.03 * D.op).toFixed(3)})`;
    $('rowSinal').style.opacity = D.sinal.toFixed(3);
    $('rowImagem').style.opacity = D.imagem.toFixed(3);
    $('rowFormula').style.opacity = D.formula.toFixed(3);
    const blob = $('blob');
    const pulse = 1 + 0.05 * Math.sin(t * 3.1);
    blob.setAttribute('rx', (92 * pulse).toFixed(1));
    blob.setAttribute('ry', (120 * pulse).toFixed(1));

    // ---- legenda do mapa de intensidade ----
    $('legend').style.opacity = st.legenda.toFixed(3);

    // ---- tela dividida ----
    const S = st.split;
    $('splitL').style.opacity = S.toFixed(3);
    $('splitR').style.opacity = S.toFixed(3);
    $('divider').style.opacity = S.toFixed(3);

    // ---- visão adaptada (tom) ----
    $('grade').style.opacity = st.visaoAdaptada.toFixed(3);

    // ---- linhas de velocidade nas transições ----
    $('speed').style.opacity = st.speed.toFixed(3);
    $('speed').style.transform = `scale(${(1 + st.speed * 0.25).toFixed(3)})`;

    // ---- créditos ----
    $('credits').style.opacity = st.creditos.toFixed(3);
    $('fade').style.opacity = st.fade.toFixed(3);
  }

  lupa(t, L) {
    const el = $('lupa');
    el.style.opacity = L.op.toFixed(3);
    if (L.op <= 0.001) return;
    el.style.transform = `scale(${(0.9 + 0.1 * L.op).toFixed(3)})`;
    // sequência de zoom (potências de dez)
    const escalas = ['1 m', '10 cm', '1 cm', '1 mm', '100 µm', '10 µm', '1 µm'];
    const k = clamp(Math.floor(L.zoom * escalas.length), 0, escalas.length - 1);
    const bar = $('lupaBar');
    if (bar.textContent !== escalas[k]) bar.textContent = escalas[k];
    const rings = $('lupaRings');
    rings.style.opacity = (1 - L.ondas).toFixed(3);
    const ph = (L.zoom * escalas.length) % 1;
    rings.querySelectorAll('circle').forEach((c, i) => {
      const r = ((i / 5 + ph) % 1) * 230;
      c.setAttribute('r', r.toFixed(1));
      c.setAttribute('opacity', (0.5 * (1 - r / 230)).toFixed(3));
    });
    const ondas = $('lupaOndas');
    ondas.style.opacity = L.ondas.toFixed(3);
    // cristas: 160 px = 1 µm, portanto 500 nm = 80 px
    const off = (t * 26) % 80;
    ondas.querySelectorAll('line.crista').forEach((ln, i) => {
      const x = -60 + i * 80 + off;
      ln.setAttribute('x1', x.toFixed(1));
      ln.setAttribute('x2', x.toFixed(1));
    });
    $('lupaNota').style.opacity = L.nota.toFixed(3);
    // conector até o ponto da abertura
    const con = $('lupaCon');
    if (L.ancora) {
      con.setAttribute('x1', L.ancora.x.toFixed(1));
      con.setAttribute('y1', L.ancora.y.toFixed(1));
      con.style.opacity = L.op.toFixed(3);
    } else con.style.opacity = 0;
  }
}
