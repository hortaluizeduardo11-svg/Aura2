"""Mini-biblioteca de desenho 'diário ilustrado' sobre Cairo.

- traços de caneta com irregularidade fixa + 'line boil' (tremida a ~10 qps)
- preenchimentos chapados de marca-texto com leve desencontro do contorno
- papel creme granulado / papel azul-marinho do sonho
- texto manuscrito que se escreve sozinho
"""
import hashlib
import math

import cairo
import numpy as np

W, H = 1080, 1920
TAU = 2 * math.pi


def hexc(h, a=1.0):
    h = h.lstrip("#")
    return (int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255, a)


C = dict(
    ink=hexc("#1c1b26"), paper=hexc("#f8f0dc"), rule=hexc("#9ec4e8"), margin=hexc("#f09a9a"),
    yellow=hexc("#ffd83d"), yellow_d=hexc("#f0bd1c"), yellow_l=hexc("#fff0a6"),
    blue=hexc("#7fcdf2"), blue_l=hexc("#c6e9fb"), blue_d=hexc("#3f9fd6"),
    lilac=hexc("#b8a1ff"), lilac_d=hexc("#8d74e6"), lilac_l=hexc("#ddd1ff"),
    navy=hexc("#1a2150"), navy_d=hexc("#10163a"), navy_l=hexc("#2b3574"), navy_m=hexc("#222b62"),
    pink=hexc("#ff9cc4"), skin=hexc("#f0c29b"), skin_d=hexc("#d89c72"), hair=hexc("#3b291f"),
    phone=hexc("#2b2b38"), cream=hexc("#f7efdb"), green=hexc("#a8e892"), red=hexc("#ff6b6b"),
    gray=hexc("#8b90a6"), white=hexc("#ffffff"), wood=hexc("#e9c79a"), wood_d=hexc("#cfa173"),
)


def mix(a, b, k):
    return tuple(a[i] * (1 - k) + b[i] * k for i in range(4))


def alpha(c, a):
    return (c[0], c[1], c[2], c[3] * a)


# ------------------------------------------------------------------ easing
def clamp(x, a=0.0, b=1.0):
    return a if x < a else b if x > b else x


def prog(t, t0, t1):
    if t1 <= t0:
        return 1.0 if t >= t1 else 0.0
    return clamp((t - t0) / (t1 - t0))


def ease(x):
    x = clamp(x)
    return x * x * (3 - 2 * x)


def ease_out(x):
    x = clamp(x)
    return 1 - (1 - x) ** 3


def ease_in(x):
    x = clamp(x)
    return x ** 3


def back_out(x, s=1.7):
    x = clamp(x) - 1
    return 1 + x * x * ((s + 1) * x + s)


def lerp(a, b, k):
    return a + (b - a) * k


def lerp2(p, q, k):
    return (p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k)


# ------------------------------------------------------------------ ruído
def _rand(key):
    h = hashlib.blake2b(key.encode(), digest_size=32).digest()
    return np.frombuffer(h, dtype=np.uint32).astype(np.float64) / 2 ** 32


def rnd(key, i=0):
    return float(_rand(key)[i % 8])


# ------------------------------------------------------------------ geometria
def ellipse(cx, cy, rx, ry, rot=0.0, a0=0.0, a1=TAU, n=None):
    if n is None:
        n = int(max(16, (abs(a1 - a0) / TAU) * (rx + ry) * 0.9))
    a = np.linspace(a0, a1, n)
    x, y = rx * np.cos(a), ry * np.sin(a)
    cr, sr = math.cos(rot), math.sin(rot)
    return np.stack([cx + x * cr - y * sr, cy + x * sr + y * cr], 1)


def superellipse(cx, cy, rx, ry, p=2.6, n=120, squash_low=0.0):
    a = np.linspace(0, TAU, n)
    c, s = np.cos(a), np.sin(a)
    x = rx * np.sign(c) * np.abs(c) ** (2 / p)
    y = ry * np.sign(s) * np.abs(s) ** (2 / p)
    if squash_low:
        x = x * (1 - squash_low * np.clip(s, 0, 1) ** 1.5)
    return np.stack([cx + x, cy + y], 1)


def rrect(x, y, w, h, r, n_corner=8):
    r = min(r, w / 2, h / 2)
    pts = []
    for cx, cy, a0 in [(x + w - r, y + r, -math.pi / 2), (x + w - r, y + h - r, 0),
                       (x + r, y + h - r, math.pi / 2), (x + r, y + r, math.pi)]:
        for k in range(n_corner + 1):
            a = a0 + (math.pi / 2) * k / n_corner
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return densify(np.array(pts), 8, closed=True)


def seg(x1, y1, x2, y2, step=8):
    n = max(2, int(math.hypot(x2 - x1, y2 - y1) / step) + 1)
    return np.stack([np.linspace(x1, x2, n), np.linspace(y1, y2, n)], 1)


def bez(p0, p1, p2, p3, n=None):
    if n is None:
        L = math.dist(p0, p1) + math.dist(p1, p2) + math.dist(p2, p3)
        n = max(8, int(L / 6))
    t = np.linspace(0, 1, n)[:, None]
    p0, p1, p2, p3 = (np.array(p, float) for p in (p0, p1, p2, p3))
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3


def catmull(points, closed=False, step=6):
    P = np.asarray(points, float)
    if closed:
        P = np.vstack([P[-1], P, P[0], P[1]])
    else:
        P = np.vstack([P[0], P, P[-1]])
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        n = max(2, int(np.linalg.norm(p2 - p1) / step))
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    if not closed:
        out.append(P[-2])
    return np.array(out)


def densify(pts, step=8, closed=False):
    P = np.asarray(pts, float)
    if closed:
        P = np.vstack([P, P[:1]])
    out = [P[0]]
    for a, b in zip(P[:-1], P[1:]):
        n = max(1, int(np.linalg.norm(b - a) / step))
        for k in range(1, n + 1):
            out.append(a + (b - a) * k / n)
    out = np.array(out)
    return out[:-1] if closed else out


def arclen(pts):
    d = np.diff(pts, axis=0)
    return np.concatenate([[0], np.cumsum(np.hypot(d[:, 0], d[:, 1]))])


def partial(pts, k):
    """Primeira fração k (0..1) de uma polilinha, por comprimento."""
    if k >= 1:
        return pts
    if k <= 0:
        return pts[:1]
    s = arclen(pts)
    target = s[-1] * k
    i = int(np.searchsorted(s, target))
    i = max(1, min(i, len(pts) - 1))
    a, b = pts[i - 1], pts[i]
    f = (target - s[i - 1]) / max(s[i] - s[i - 1], 1e-9)
    return np.vstack([pts[:i], a + (b - a) * f])


def point_at(pts, k):
    return tuple(partial(pts, k)[-1])


def transform(pts, dx=0.0, dy=0.0, rot=0.0, sx=1.0, sy=None, ox=0.0, oy=0.0):
    sy = sx if sy is None else sy
    P = np.asarray(pts, float) - (ox, oy)
    P = P * (sx, sy)
    cr, sr = math.cos(rot), math.sin(rot)
    P = np.stack([P[:, 0] * cr - P[:, 1] * sr, P[:, 0] * sr + P[:, 1] * cr], 1)
    return P + (ox + dx, oy + dy)


# ------------------------------------------------------------------ caneta
class Pen:
    def __init__(self, ctx, t, boil_rate=10.0, dark=False):
        self.c = ctx
        self.t = t
        self.boil = int(t * boil_rate)
        self.dark = dark
        self.wob = 1.0
        self.silhouette = None   # cor única p/ sombras longas

    # deslocamento suave ao longo do comprimento do traço
    def wobble(self, pts, key, closed=False, amp=1.0):
        a = amp * self.wob
        if a <= 0 or len(pts) < 3:
            return pts
        s = arclen(pts)
        L = max(s[-1], 1.0)
        a *= min(1.0, L / 260.0) ** 0.6
        r1 = _rand(key)
        r2 = _rand(f"{key}|{self.boil}")

        def comp(r, A, base):
            if closed:
                k1 = max(1, round(L / base))
                k2 = max(2, round(L / (base * 0.37)))
                return A * (np.sin(TAU * k1 * s / L + TAU * r[0]) + 0.5 * np.sin(TAU * k2 * s / L + TAU * r[1]))
            return A * (np.sin(TAU * s / base + TAU * r[0]) + 0.5 * np.sin(TAU * s / (base * 0.37) + TAU * r[1]))

        dx = comp(r1[0:2], 1.7 * a, 230) + comp(r2[0:2], 0.75 * a, 150)
        dy = comp(r1[2:4], 1.7 * a, 270) + comp(r2[2:4], 0.75 * a, 130)
        return pts + np.stack([dx, dy], 1)

    def _path(self, pts, closed):
        c = self.c
        c.move_to(*pts[0])
        for p in pts[1:]:
            c.line_to(*p)
        if closed:
            c.close_path()

    def fill(self, pts, color, key="f", off=(3.0, 2.5), op=None, wob=1.0):
        c = self.c
        col = self.silhouette or color
        p = self.wobble(np.asarray(pts, float), key + "#f", closed=True, amp=wob)
        if self.silhouette is None and off:
            p = p + off
        c.save()
        if op is not None and self.silhouette is None:
            c.set_operator(op)
        c.set_source_rgba(*col)
        self._path(p, True)
        c.fill()
        c.restore()

    def stroke(self, pts, key="s", color=None, lw=5.0, closed=False, progress=1.0, wob=1.0):
        if self.silhouette is not None:
            if closed:
                return
            color = self.silhouette
        c = self.c
        pts = np.asarray(pts, float)
        p = self.wobble(pts, key, closed=closed, amp=wob)
        if progress < 1.0:
            if closed:
                p = np.vstack([p, p[:1]])
            p = partial(p, progress)
            closed = False
            if len(p) < 2:
                return
        c.save()
        c.set_source_rgba(*(color or C["ink"]))
        c.set_line_width(lw)
        c.set_line_cap(cairo.LINE_CAP_ROUND)
        c.set_line_join(cairo.LINE_JOIN_ROUND)
        self._path(p, closed)
        c.stroke()
        c.restore()

    def shape(self, pts, key, fill=None, stroke=None, lw=5.0, closed=True, off=(3.0, 2.5),
              progress=1.0, wob=1.0, op=None):
        if fill is not None and progress >= 1.0:
            self.fill(pts, fill, key, off=off, op=op, wob=wob)
        if stroke is not False:
            self.stroke(pts, key, color=stroke, lw=lw, closed=closed, progress=progress, wob=wob)

    def tube(self, pts, key, width, color, lw=5.0, outline=None):
        """Traço grosso com contorno (mangas, fio, trilho)."""
        c = self.c
        p = self.wobble(np.asarray(pts, float), key, amp=0.6)
        c.save()
        c.set_line_cap(cairo.LINE_CAP_ROUND)
        c.set_line_join(cairo.LINE_JOIN_ROUND)
        if self.silhouette is not None:
            c.set_source_rgba(*self.silhouette)
            c.set_line_width(width + lw * 2)
            self._path(p, False)
            c.stroke()
            c.restore()
            return
        c.set_source_rgba(*(outline or C["ink"]))
        c.set_line_width(width + lw * 2)
        self._path(p, False)
        c.stroke()
        c.set_source_rgba(*color)
        c.set_line_width(width)
        self._path(p + (1.5, 1.0), False)
        c.stroke()
        c.restore()

    def dot(self, x, y, r, color=None):
        c = self.c
        c.save()
        c.set_source_rgba(*(self.silhouette or color or C["ink"]))
        c.arc(x, y, r, 0, TAU)
        c.fill()
        c.restore()


# ------------------------------------------------------------------ fontes/texto
FONTS = {
    "hand": ("Caveat Brush", None),
    "note": ("Patrick Hand", None),
    "cap": ("Fredoka", "wght=650"),
    "big": ("Fredoka", "wght=700"),
}


def set_font(c, kind, size):
    fam, var = FONTS[kind]
    c.select_font_face(fam, cairo.FONT_SLANT_NORMAL, cairo.FONT_WEIGHT_NORMAL)
    fo = cairo.FontOptions()
    fo.set_antialias(cairo.ANTIALIAS_GRAY)
    fo.set_hint_style(cairo.HINT_STYLE_NONE)
    fo.set_hint_metrics(cairo.HINT_METRICS_OFF)
    if var:
        fo.set_variations(var)
    c.set_font_options(fo)
    c.set_font_size(size)


def text_w(c, text, kind, size):
    set_font(c, kind, size)
    return c.text_extents(text).x_advance


def hand_text(pen, text, x, y, size, kind="hand", color=None, progress=1.0, align="left",
              rot=0.0, key=None, jitter=True):
    """Texto manuscrito que 'se escreve' da esquerda para a direita.
    Devolve (largura, ponta_da_caneta)."""
    c = pen.c
    if progress <= 0:
        return 0, (x, y)
    set_font(c, kind, size)
    ext = c.text_extents(text)
    w = ext.x_advance
    x0 = x - w / 2 if align == "center" else x - w if align == "right" else x
    key = key or text
    jx = jy = jr = 0.0
    if jitter:
        r = _rand(f"{key}|{pen.boil}")
        jx, jy, jr = (r[0] - 0.5) * 1.4, (r[1] - 0.5) * 1.4, (r[2] - 0.5) * 0.006
    c.save()
    c.translate(x0 + jx, y + jy)
    c.rotate(rot + jr)
    if progress < 1:
        c.rectangle(ext.x_bearing - 10, -size * 1.4, (w + 20) * progress + 4, size * 2.2)
        c.clip()
    c.set_source_rgba(*(pen.silhouette or color or (C["cream"] if pen.dark else C["ink"])))
    c.move_to(0, 0)
    c.show_text(text)
    c.restore()
    tipx = x0 + w * progress
    wig = math.sin(progress * 60) * size * 0.18
    ca, sa = math.cos(rot), math.sin(rot)
    tip = (x0 + (tipx - x0) * ca - (-size * 0.3 + wig) * sa, y + (tipx - x0) * sa + (-size * 0.3 + wig) * ca)
    return w, tip


def wrap(c, text, kind, size, maxw):
    set_font(c, kind, size)
    words = text.split()
    lines, cur = [], ""
    for w_ in words:
        cand = (cur + " " + w_).strip()
        if c.text_extents(cand).x_advance <= maxw or not cur:
            cur = cand
        else:
            lines.append(cur)
            cur = w_
    if cur:
        lines.append(cur)
    return lines


def marker_swash(pen, x, y, w, h, color, key, progress=1.0, op=cairo.OPERATOR_MULTIPLY):
    """Faixa de marca-texto atrás de uma palavra."""
    if progress <= 0:
        return
    c = pen.c
    r = _rand(key)
    ww = w * progress
    pts = [(x - 6, y + h * 0.15 + r[0] * 4), (x + ww * 0.5, y + r[1] * 5 - 2), (x + ww + 6, y + h * 0.1 + r[2] * 4),
           (x + ww + 8, y + h * 0.9 + r[3] * 4), (x + ww * 0.5, y + h + r[4] * 4), (x - 8, y + h * 0.95 + r[5] * 3)]
    c.save()
    if not pen.dark and op is not None:
        c.set_operator(op)
    c.set_source_rgba(*color)
    p = catmull(pts, closed=True, step=8)
    pen._path(p, True)
    c.fill()
    c.restore()


# ------------------------------------------------------------------ papel
_PAPER_CACHE = {}


def paper_surface(kind="day"):
    if kind in _PAPER_CACHE:
        return _PAPER_CACHE[kind][0]
    from scipy.ndimage import gaussian_filter, zoom
    rng = np.random.default_rng(11 if kind == "day" else 23)
    if kind == "day":
        base, grain, blot = np.array(hexc("#f8f0dc")[:3]) * 255, 5.5, 7.0
    else:
        base, grain, blot = np.array(hexc("#1b2252")[:3]) * 255, 5.0, 9.0
    n = rng.normal(0, grain, (H, W))
    low = gaussian_filter(rng.normal(0, 1, (H // 8 + 2, W // 8 + 2)), 5)
    low = zoom(low, 8, order=1)[:H, :W]
    low = low / np.abs(low).max() * blot
    fib = np.zeros((H, W))
    for _ in range(260):
        x0, y0 = rng.uniform(0, W), rng.uniform(0, H)
        ang = rng.uniform(0, math.pi)
        L = rng.uniform(8, 30)
        for k in np.linspace(0, 1, int(L)):
            xi, yi = int(x0 + math.cos(ang) * L * k), int(y0 + math.sin(ang) * L * k)
            if 0 <= xi < W and 0 <= yi < H:
                fib[yi, xi] -= 10 if kind == "day" else -8
    yy, xx = np.mgrid[0:H, 0:W]
    v = ((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2
    img = base[None, None, :] + (n + low + gaussian_filter(fib, 0.6))[..., None]
    img *= (1 - 0.045 * v)[..., None]
    img = np.clip(img, 0, 255).astype(np.uint8)
    arr = np.zeros((H, W, 4), np.uint8)
    arr[..., 0], arr[..., 1], arr[..., 2], arr[..., 3] = img[..., 2], img[..., 1], img[..., 0], 255
    surf = cairo.ImageSurface.create_for_data(memoryview(arr), cairo.FORMAT_ARGB32, W, H, W * 4)
    _PAPER_CACHE[kind] = (surf, arr)
    return surf


MARGIN_X = 168
RULE_Y0, RULE_STEP = 330, 66


def draw_paper(pen, dark=False, rules=True, margin=True, spiral=True, alpha_=1.0):
    c = pen.c
    c.save()
    c.set_source_surface(paper_surface("night" if dark else "day"), 0, 0)
    c.paint_with_alpha(alpha_)
    if rules:
        col = alpha(C["lilac"], 0.28 * alpha_) if dark else alpha(C["rule"], 0.75 * alpha_)
        c.set_line_width(2.2)
        c.set_source_rgba(*col)
        y = RULE_Y0
        while y < H:
            c.move_to(0, y)
            c.line_to(W, y)
            y += RULE_STEP
        c.stroke()
        # linha dupla do cabeçalho
        c.set_line_width(1.6)
        c.move_to(0, RULE_Y0 - 120)
        c.line_to(W, RULE_Y0 - 120)
        c.stroke()
    if margin:
        col = alpha(C["lilac"], 0.55 * alpha_) if dark else alpha(C["margin"], 0.8 * alpha_)
        c.set_source_rgba(*col)
        c.set_line_width(2.6)
        c.move_to(MARGIN_X, 0)
        c.line_to(MARGIN_X, H)
        c.stroke()
    c.restore()
    if spiral:
        draw_spiral(pen, dark, alpha_)


def draw_spiral(pen, dark=False, a=1.0):
    c = pen.c
    c.save()
    for i in range(24):
        y = 70 + i * 82
        # furo
        c.set_source_rgba(*(alpha(C["navy_d"], 0.9 * a) if dark else alpha(hexc("#cfc4ad"), a)))
        c.arc(46, y, 11, 0, TAU)
        c.fill()
        c.set_source_rgba(*alpha(C["ink"], 0.35 * a))
        c.arc(46, y + 1.5, 11, 0.2, math.pi - 0.2)
        c.set_line_width(2)
        c.stroke()
        # anel metálico
        c.set_line_cap(cairo.LINE_CAP_ROUND)
        c.set_line_width(9)
        c.set_source_rgba(*alpha(hexc("#5d6070"), a))
        c.move_to(44, y)
        c.curve_to(30, y - 8, 4, y - 14, -6, y - 6)
        c.stroke()
        c.set_line_width(3.5)
        c.set_source_rgba(*alpha(hexc("#c9ccd8"), a))
        c.move_to(40, y - 3)
        c.curve_to(28, y - 9, 8, y - 13, 0, y - 9)
        c.stroke()
    c.restore()
