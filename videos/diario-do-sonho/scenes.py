"""Cenas do vídeo. Cada plano é uma página do diário que ganhou vida.

Realidade: papel creme, linhas azuis, amarelo/azul-claro, câmera estável.
Sonho: papel azul-marinho, linhas lilás, quarto inclinado, cortina flutuando,
sombras alongadas e movimentos esticados.
"""
import json
import math
import re

import cairo
import numpy as np

from draw import (C, H, TAU, W, MARGIN_X, Pen, alpha, back_out, bez, catmull, clamp, densify, draw_paper,
                  ease, ease_in, ease_out, ellipse, hand_text, hexc, lerp, lerp2, marker_swash, mix,
                  partial, point_at, prog, rnd, rrect, seg, set_font, text_w, wrap)
from character import draw_big_hand, draw_doodle, draw_head_only, draw_kid, sleeve

TL = {}
T = {}


def load(path="build/timeline.json"):
    global TL, T
    with open(path) as f:
        TL.update(json.load(f))
    T.update(TL["T"])


def tv(name, i=None):
    v = T[name]
    return v[i] if i is not None else v


# ------------------------------------------------------------------ utilidades
def talk(t):
    m = TL["mouth"]
    f = t * 30
    i = int(f)
    if i < 0 or i >= len(m) - 1:
        return 0.0
    v = m[i] * (1 - (f - i)) + m[i + 1] * (f - i)
    return clamp(v * 1.15, 0, 1.1)


def blink(t, seed=0.0, period=3.3):
    ph = (t + seed) % period
    return clamp(1 - abs(ph - 0.07) / 0.07) if ph < 0.14 else 0.0


def new_surface():
    s = cairo.ImageSurface(cairo.FORMAT_ARGB32, W, H)
    return s, cairo.Context(s)


def render_to_surface(fn, t, **kw):
    s, c = new_surface()
    fn(c, t, **kw)
    return s


def note(pen, x, y, s=1.0, col=None, sx=1.0, rot=0.0, key="n", ink=None, double=False):
    c = pen.c
    ink = ink or (C["cream"] if pen.dark else C["ink"])
    c.save()
    c.translate(x, y)
    c.rotate(rot)
    c.scale(s * sx, s)
    pen.shape(ellipse(0, 0, 17, 12, rot=-0.35, n=30), key + "h", fill=col or C["yellow"], stroke=ink, lw=4.5)
    pen.stroke(seg(15, -3, 15, -62, 4), key + "st", color=ink, lw=4.5)
    pen.stroke(bez((15, -62), (32, -52), (40, -36), (30, -20)), key + "fl", color=ink, lw=4.5)
    c.restore()


def clock(pen, x, y, r, ang, col, key):
    ink = C["cream"] if pen.dark else C["ink"]
    pen.shape(ellipse(x, y, r, r, n=60), key, fill=col, stroke=ink, lw=5)
    c = pen.c
    for i in range(12):
        a = i * TAU / 12
        pen.stroke(seg(x + math.cos(a) * r * 0.78, y + math.sin(a) * r * 0.78, x + math.cos(a) * r * 0.9,
                       y + math.sin(a) * r * 0.9, 3), key + f"tk{i}", color=C["ink"], lw=3, wob=0)
    pen.stroke(seg(x, y, x + math.cos(ang - math.pi / 2) * r * 0.72, y + math.sin(ang - math.pi / 2) * r * 0.72, 4),
               key + "m", color=C["ink"], lw=5, wob=0.3)
    a2 = ang / 12
    pen.stroke(seg(x, y, x + math.cos(a2 - math.pi / 2) * r * 0.45, y + math.sin(a2 - math.pi / 2) * r * 0.45, 4),
               key + "hh", color=C["ink"], lw=6, wob=0.3)
    pen.dot(x, y, 5, C["ink"])


def cord(pen, pts, key="cord", width=9.0, shadow=True):
    c = pen.c
    pts = np.asarray(pts, float)
    if shadow and not pen.dark:
        c.save()
        c.set_source_rgba(0, 0, 0, 0.13)
        c.set_line_width(width + 2)
        c.set_line_cap(cairo.LINE_CAP_ROUND)
        c.set_line_join(cairo.LINE_JOIN_ROUND)
        p = pts + (7, 9)
        c.move_to(*p[0])
        for q in p[1:]:
            c.line_to(*q)
        c.stroke()
        c.restore()
    pen.tube(pts, key, width, C["phone"], lw=3.0, outline=C["ink"] if not pen.dark else hexc("#05060f"))


def sag(a, b, amount=120, n=60):
    a, b = np.array(a, float), np.array(b, float)
    m1 = a + (b - a) * 0.3 + (0, amount)
    m2 = a + (b - a) * 0.7 + (0, amount)
    return bez(a, m1, m2, b, n=n)


def freq_label(pen, text, x, y, size, col, k, key):
    if k <= 0:
        return
    c = pen.c
    set_font(c, "big", size)
    w = c.text_extents(text).x_advance
    sc = 0.6 + 0.4 * back_out(clamp(k * 1.4))
    marker_swash(pen, x - 14, y - size * 0.80, w + 28, size * 0.98, col, key, progress=clamp(k * 2.2), op=None)
    c.save()
    cx, cy = x + w / 2, y - size * 0.35
    c.translate(cx, cy)
    c.scale(sc, sc)
    c.translate(-cx, -cy)
    c.set_source_rgba(*alpha(C["ink"], clamp(k * 3)))
    set_font(c, "big", size)
    c.move_to(x, y)
    c.show_text(text)
    c.restore()


def circle_mark(pen, cx, cy, rx, ry, k, col, key, lw=7):
    if k <= 0:
        return
    pts = ellipse(cx, cy, rx, ry, rot=-0.05, a0=-2.4, a1=-2.4 + TAU * 1.08, n=90)
    pen.stroke(pts, key, color=col, lw=lw, progress=ease_out(k))


def arrow(pen, pts, k, key, col=None, lw=5):
    if k <= 0:
        return
    col = col or (C["cream"] if pen.dark else C["ink"])
    pts = np.asarray(pts, float)
    pen.stroke(pts, key, color=col, lw=lw, progress=ease_out(k))
    if k >= 0.98:
        a, b = pts[-4], pts[-1]
        ang = math.atan2(b[1] - a[1], b[0] - a[0])
        for da in (2.6, -2.6):
            pen.stroke(seg(b[0], b[1], b[0] + 26 * math.cos(ang + da), b[1] + 26 * math.sin(ang + da), 4),
                       key + f"h{da}", color=col, lw=lw)


def tilt_begin(c, ang, cx=540, cy=980):
    c.save()
    c.translate(cx, cy)
    c.rotate(ang)
    c.translate(-cx, -cy)


def long_shadow(pen, base, fn, shear=0.55, sy=1.3, col=None):
    """Sombra alongada do sonho: redesenha a silhueta inclinada no chão/parede."""
    c = pen.c
    c.save()
    c.translate(*base)
    c.transform(cairo.Matrix(1, 0, shear, sy, 0, 0))
    c.translate(-base[0], -base[1])
    pen.silhouette = col or alpha(C["navy_d"], 0.75)
    fn()
    pen.silhouette = None
    c.restore()


def pointer_hand(pen, tip, press=0.0, key="ptr", origin=(-250, 2100)):
    """Mão em close apontando com o indicador (moletom amarelo)."""
    c = pen.c
    tx, ty = tip
    ang = math.atan2(origin[1] - ty, origin[0] - tx)
    hx, hy = tx + math.cos(ang) * 92, ty + math.sin(ang) * 92
    sleeve(pen, (hx + math.cos(ang) * 60, hy + math.sin(ang) * 60), origin, 116, 190, key + "slv")
    cuff = (hx + math.cos(ang) * 58, hy + math.sin(ang) * 58)
    pen.tube([cuff, (cuff[0] + math.cos(ang) * 30, cuff[1] + math.sin(ang) * 30)], key + "cf", 128, C["yellow_d"], lw=5.5)
    c.save()
    c.translate(hx, hy)
    c.rotate(ang + math.pi)
    sq = 1 - 0.08 * press
    c.scale(sq, 1)
    pen.shape(rrect(0, -16, 96, 32, 16), key + "fg", fill=C["skin"], lw=5)
    pen.shape(ellipse(-6, 6, 56, 50, n=50), key + "fist", fill=C["skin"], lw=5)
    pen.stroke(bez((-30, 30), (-10, 40), (10, 40), (30, 30)), key + "k1", lw=4)
    pen.shape(ellipse(14, -36, 30, 14, rot=-0.3, n=30), key + "th", fill=C["skin"], lw=4.5)
    c.restore()
    if press > 0.2:
        for i in range(3):
            a = -2.2 + i * 0.7
            pen.stroke(seg(tx + math.cos(a) * 34, ty + math.sin(a) * 34, tx + math.cos(a) * 54, ty + math.sin(a) * 54, 4),
                       key + f"pr{i}", lw=4)


# =================================================================== CENA A
CORD_A = bez((1140, 1010), (760, 1010), (560, 1640), (-60, 1500), n=140)
DIA1 = (215, 760, 235)


def shot_A(c, t, final=False):
    pen = Pen(c, t, boil_rate=10)
    zoom = 1.0 + 0.03 * ease(prog(t, 0, 2.0))
    c.save()
    c.translate(540, 700)
    c.scale(zoom, zoom)
    c.translate(-540, -700)
    draw_paper(pen)
    hand_text(pen, "diário de sonhos", 900, 190, 50, kind="note", color=alpha(C["blue_d"], 0.9), align="right", key="hdr")
    # lua e estrelinhas de rabisco na margem
    pen.shape(np.vstack([ellipse(112, 330, 30, 30, a0=-1.9, a1=1.9, n=30),
                         ellipse(126, 330, 22, 26, a0=1.75, a1=-1.75 + 0.0 - TAU + TAU, n=30)[::-1]]),
              "moonA", fill=C["yellow"], lw=4, op=cairo.OPERATOR_MULTIPLY)
    for i, (sx, sy) in enumerate([(98, 470), (130, 560), (96, 650)]):
        pen.stroke(seg(sx - 10, sy, sx + 10, sy, 3), f"stA{i}a", lw=3.5)
        pen.stroke(seg(sx, sy - 10, sx, sy + 10, 3), f"stA{i}b", lw=3.5)
    # rabisco de fone na margem
    pen.stroke(bez((80, 930), (78, 860), (142, 860), (140, 930)), "mhp", lw=5)
    pen.shape(rrect(66, 918, 26, 44, 10), "mhp1", fill=C["pink"], lw=4, op=cairo.OPERATOR_MULTIPLY)
    pen.shape(rrect(128, 918, 26, 44, 10), "mhp2", fill=C["pink"], lw=4, op=cairo.OPERATOR_MULTIPLY)
    k = prog(t, *tv("write_dia1"))
    x0, y0, size = DIA1
    w, tip = hand_text(pen, "Dia 1", x0, y0, size, progress=k, key="dia1")
    # notas curtas no fone (três notas)
    for i, nt in enumerate(tv("m1_notes")):
        a = prog(t, nt, nt + 0.25)
        if a <= 0:
            continue
        fade = 1 - prog(t, nt + 1.0, nt + 1.4)
        if fade <= 0:
            continue
        x, y = [(700, 640), (800, 585), (900, 640)][i]
        c.save()
        c.push_group()
        note(pen, x, y - 25 * ease_out(a), 1.3 * back_out(a), C["yellow"], key=f"nA{i}")
        c.pop_group_to_source()
        c.paint_with_alpha(fade)
        c.restore()
    # fio do fone atravessando a página (vibra com as notas)
    pts = CORD_A.copy()
    vib = 0.0
    for nt in tv("m1_notes"):
        if t >= nt:
            vib += 7 * math.exp(-(t - nt) * 7)
    if vib > 0.05:
        s = np.linspace(0, 1, len(pts))
        pts[:, 1] += vib * np.sin(s * 40 - t * 50) * np.sin(s * math.pi)
    cord(pen, pts, "cordA")
    c.restore()
    if final:
        return
    # mão escrevendo
    w0, w1 = tv("write_dia1")
    if t < w0:
        tipp = (x0 + 4, y0 - size * 0.32 + 6 * math.sin(t * 5) + 40 * (1 - ease(prog(t, 0, w0))))
    elif t <= w1:
        tipp = tip
    else:
        e = ease_in(prog(t, w1 + 0.05, tv("flip", 0) + 0.05))
        tipp = lerp2(tip, (1450, 1300), e)
    tipp = (540 + (tipp[0] - 540) * zoom, 700 + (tipp[1] - 700) * zoom)
    if tipp[0] < 1300:
        draw_big_hand(pen, tipp, ang=0.32, s=1.6, hold="pen", key="handA", sleeve_from=(1450, 1500))


# =================================================================== QUARTO DO SONHO
ROOM_TILT = -0.065


def dream_window(pen, t, x0, y0, w, h, key, curtain=True, slow=1.0):
    c = pen.c
    pen.shape(rrect(x0, y0, w, h, 10), key + "win", fill=C["navy_d"], stroke=C["cream"], lw=6)
    # lua e estrelas
    mx, my = x0 + w * 0.68, y0 + h * 0.3
    moon = np.vstack([ellipse(mx, my, 38, 38, a0=-2.0, a1=2.0, n=40),
                      ellipse(mx + 18, my - 4, 28, 32, a0=1.8, a1=-1.8, n=40)])
    pen.shape(moon, key + "moon", fill=C["yellow"], stroke=C["ink"], lw=4)
    for i in range(4):
        sx = x0 + w * (0.18 + 0.2 * i)
        sy = y0 + h * (0.62 - 0.12 * (i % 2))
        tw = 0.6 + 0.4 * math.sin(t * 2 * slow + i)
        pen.stroke(seg(sx - 8 * tw, sy, sx + 8 * tw, sy, 3), key + f"s{i}a", color=C["cream"], lw=3)
        pen.stroke(seg(sx, sy - 8 * tw, sx, sy + 8 * tw, 3), key + f"s{i}b", color=C["cream"], lw=3)
    pen.stroke(seg(x0 + w / 2, y0, x0 + w / 2, y0 + h, 6), key + "bar1", color=C["cream"], lw=5)
    pen.stroke(seg(x0, y0 + h * 0.5, x0 + w, y0 + h * 0.5, 6), key + "bar2", color=C["cream"], lw=5)
    if curtain:
        rod_y = y0 - 26
        pen.stroke(seg(x0 - 70, rod_y, x0 + w + 40, rod_y, 6), key + "rod", color=C["cream"], lw=7)
        top = [(x0 - 60 + i * 26, rod_y + 4) for i in range(7)]
        L = h + 90
        left, right = [], []
        for j in range(18):
            f = j / 17
            yy = rod_y + 4 + L * f
            sway = (34 * math.sin(t * 1.1 * slow + f * 2.6) + 22 * math.sin(t * 0.7 * slow + 1.3)) * f ** 1.4
            lift = -40 * f ** 2 * (0.5 + 0.5 * math.sin(t * 0.8 * slow))
            left.append((x0 - 60 + sway + 10 * math.sin(f * 7 + t * slow), yy + lift * 0.3))
            right.append((x0 + 96 + sway * 1.3 + 18 * math.sin(f * 5 + t * 1.3 * slow), yy + lift))
        poly = np.vstack([np.array(top), catmull(right, step=10), catmull(left[::-1], step=10)])
        pen.shape(poly, key + "curt", fill=C["lilac"], stroke=C["ink"], lw=5)
        for q in range(3):
            fx = 0.25 + 0.25 * q
            pts = [lerp2(l, r, fx) for l, r in zip(left[2:], right[2:])]
            pen.stroke(catmull(pts, step=12), key + f"fold{q}", color=alpha(C["lilac_d"], 0.9), lw=4)


def bed_back(pen, t):
    # cabeceira
    pen.shape(rrect(150, 840, 96, 420, 24), "headb", fill=C["lilac_d"], stroke=C["ink"], lw=5.5)
    pen.shape(rrect(150, 1150, 830, 70, 16), "frame", fill=C["lilac_d"], stroke=C["ink"], lw=5.5)
    pen.shape(rrect(220, 1218, 26, 50, 6), "leg1", fill=C["lilac_d"], stroke=C["ink"], lw=4)
    pen.shape(rrect(930, 1218, 26, 50, 6), "leg2", fill=C["lilac_d"], stroke=C["ink"], lw=4)
    pen.shape(rrect(240, 1078, 740, 80, 26), "mattress", fill=C["lilac_l"], stroke=C["ink"], lw=5)
    pen.shape(catmull([(250, 1000), (380, 985), (420, 1040), (380, 1085), (260, 1088), (232, 1040)], closed=True, step=6),
              "pillow", fill=C["cream"], stroke=C["ink"], lw=5)


def bed_front(pen, t):
    edge = [(380, 1060), (500, 1048), (640, 1066), (780, 1050), (930, 1062), (1000, 1070)]
    poly = np.vstack([catmull(edge, step=10), np.array([(1000, 1210), (360, 1210)])])
    pen.shape(poly, "blanket", fill=C["lilac"], stroke=C["ink"], lw=5.5)
    for i, xx in enumerate([480, 620, 770, 900]):
        pen.stroke(seg(xx, 1070, xx - 20, 1200, 6), f"bkt{i}", color=alpha(C["lilac_d"], 1), lw=5)
    pen.stroke(catmull([(360, 1206), (480, 1196), (620, 1212), (760, 1196), (1000, 1206)], step=10), "bkhem",
               color=C["ink"], lw=5)


def star(pen, x, y, r, col, key):
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((x + rr * math.cos(a), y + rr * math.sin(a)))
    pen.shape(densify(np.array(pts), 6, closed=True), key, fill=col, stroke=C["ink"], lw=4.5)


def floor(pen, y=1262):
    c = pen.c
    pen.fill([(-200, y), (1300, y), (1300, 2100), (-200, 2100)], C["navy_m"], "floor", off=None, wob=0)
    for i in range(9):
        xx = -200 + i * 190
        pen.stroke(seg(xx, y, xx - 180, 2100, 10), f"fb{i}", color=alpha(C["lilac"], 0.22), lw=3)
    pen.stroke(seg(-200, y, 1300, y, 8), "floorl", color=C["cream"], lw=4)


KID_B = (560, 930, 0.95)


def kid_pose_B(t):
    """Poses do plano B (antes de olhar embaixo da cama)."""
    lift_t = tv("cup_lift")
    n = tv("m1_slow_notes")
    p = dict(look=(0.25, 0.35), smile=0.3, blink=blink(t, 0.7, 2.6), hand_l=(-118, 100), hold_l="pen",
             hand_r=(112, 108), hold_r="phone", phone_screen="play", phone_rot=0.15)
    if t >= lift_t:
        a = back_out(prog(t, lift_t, lift_t + 0.18))
        p.update(cup_lift=a, eye_wide=clamp(a), brow_raise=14 * clamp(a), mouth_o=0.7 * (1 - prog(t, lift_t + 0.5, lift_t + 0.8)),
                 look=(-0.7, -0.3), smile=0.0, blink=0.0, hold_l=None)
        # olhos esticados, devagar (sonho)
        lk = ease(prog(t, n[1], n[1] + 0.9))
        p["look"] = lerp2((-0.7, -0.3), (0.9, -0.25), lk)
        lk2 = ease(prog(t, n[2] + 0.2, n[2] + 1.0))
        if lk2 > 0:
            p["look"] = lerp2(p["look"], (0.2, 1.0), lk2)
            p["brow_angle"] = -0.3 * lk2
            p["brow_raise"] = 14 * (1 - lk2)
            p["eye_wide"] = 1 - lk2 * 0.6
        lean = ease(prog(t, tv("cut_under") - 0.35, tv("cut_under")))
        p["lean"] = 0.12 * lean
        p["tilt"] = 0.25 * lean
    return p


def pen_fall(t):
    """Caneta caindo em câmera lenta: sai da mão no 1º grave e só toca o
    chão quando a 3ª nota acaba."""
    t0 = tv("cup_lift") + 0.05
    t1 = tv("m1_slow_notes", 2) + 1.1
    k = prog(t, t0, t1)
    y = lerp(1015, 1300, k ** 1.25)
    x = lerp(445, 410, k)
    rot = 0.4 + 2.3 * k
    if t > t1:
        b = prog(t, t1, t1 + 0.5)
        y = 1300 - 26 * math.sin(math.pi * b) * (1 - b)
    return x, y, rot


def draw_pen_obj(pen, x, y, rot, key="penobj"):
    c = pen.c
    c.save()
    c.translate(x, y)
    c.rotate(rot)
    pen.tube([(-55, 0), (45, 0)], key + "b", 13, hexc("#2d3a8c"), lw=3.5)
    pen.shape([(45, -6), (45, 6), (64, 0)], key + "t", fill=C["cream"], lw=3.5)
    pen.tube([(-55, 0), (-40, 0)], key + "c", 13, C["ink"], lw=3)
    c.restore()


def shot_room(c, t, phase="B"):
    pen = Pen(c, t, boil_rate=6, dark=True)
    draw_paper(pen, dark=True)
    tilt_begin(c, ROOM_TILT + 0.01 * math.sin(t * 0.6))
    c.translate(560, 980)
    c.scale(1.1, 1.1)
    c.translate(-560, -940)
    floor(pen)
    # pôster na parede
    pen.shape(rrect(250, 420, 190, 250, 8), "poster", fill=C["navy_l"], stroke=C["cream"], lw=5)
    star(pen, 345, 545, 52, C["yellow"], "pstar")
    dream_window(pen, t, 650, 420, 250, 320, "wB", slow=0.6)
    kx, ky, ks = KID_B
    if phase == "B":
        pose = kid_pose_B(t)
    else:
        pose = kid_pose_D(t)
    # sombras longas (luz baixa da lua)
    long_shadow(pen, (kx, 1150), lambda: draw_kid(pen, kx, ky, ks, pose, key="kidsh"), shear=0.7, sy=1.25)
    long_shadow(pen, (200, 1260), lambda: pen.fill(rrect(150, 840, 96, 420, 24), C["navy_d"], "hbs"), shear=0.7, sy=1.2)
    bed_back(pen, t)
    anchors = draw_kid(pen, kx, ky, ks, pose, key="kidB")
    bed_front(pen, t)
    # caneta (cai devagar no sonho)
    if phase == "B":
        if t >= tv("cup_lift") + 0.05:
            x, y, r = pen_fall(t)
            draw_pen_obj(pen, x, y, r)
    else:
        draw_pen_obj(pen, 410, 1300, 2.7)
    # fio do fone: concha direita -> celular
    cp = sag(anchors["cup_r"], anchors["phone_r"], amount=90)
    cord(pen, cp, "cordB")
    # notas graves e esticadas
    if phase == "B":
        for i, nt in enumerate(tv("m1_slow_notes")):
            a = prog(t, nt, nt + 0.6)
            if a <= 0:
                continue
            fade = 1 - prog(t, nt + 1.6, nt + 2.4)
            x, y = [(470, 400), (230, 790), (880, 900)][i]
            c.save()
            c.push_group()
            note(pen, x - 30 * (t - nt), y - 12 * (t - nt), 1.25 * ease_out(a), C["lilac"], sx=2.1, key=f"nB{i}",
                 ink=C["cream"])
            c.pop_group_to_source()
            c.paint_with_alpha(clamp(fade))
            c.restore()
    c.restore()
    if phase == "D":
        draw_D_notes(pen, t)
    return anchors, cp


def kid_pose_D(t):
    tc = tv("touch")
    p = dict(look=(0, 0.1), smile=0.0, cup_lift=1.0, brow_raise=10, eye_wide=0.6, blink=blink(t, 0.2, 2.8),
             hand_l=(-118, 100), hand_r=(112, 108), hold_r="phone", phone_screen="play", phone_rot=0.15)
    k = ease(prog(t, tc, tc + 0.3))
    if k > 0:
        p["hand_l"] = lerp2((-118, 100), (-150, -168), k)
        p["front_l"] = k > 0.35
        p["cup_lift"] = 1 - ease(prog(t, tc + 0.18, tc + 0.38))
    l2 = tv("L2")
    era = l2 + TL_word_time("L2", 1)
    if t >= l2:
        p.update(brow_angle=-0.32, brow_raise=0, eye_wide=0.0, look=(-0.3, 0.2))
    if t >= era - 0.1:
        e = ease(prog(t, era - 0.1, era + 0.2))
        p.update(brow_angle=lerp(-0.32, 0.22, e), brow_raise=16 * e, eye_wide=0.9 * e, look=lerp2((-0.3, 0.2), (-0.5, -0.7), e))
        p["hand_l"] = lerp2((-150, -168), (-118, 100), ease(prog(t, era + 0.9, era + 1.3)))
        p["front_l"] = t < era + 1.1
    p["mouth_open"] = talk(t)
    return p


VOICE_WORDS = {}


def TL_word_time(lid, idx):
    if lid not in VOICE_WORDS:
        with open(f"build/voice/{lid}.json") as f:
            VOICE_WORDS[lid] = json.load(f)["words"]
    w = VOICE_WORDS[lid]
    return w[min(idx, len(w) - 1)]["t"]


def draw_D_notes(pen, t):
    era = tv("L2") + TL_word_time("L2", 1)
    k = prog(t, era + 0.1, era + 1.0)
    if k > 0:
        w, _ = hand_text(pen, "mesma música?", 205, 300, 74, progress=k, key="mm")
        circle_mark(pen, 205 + w / 2, 276, w / 2 + 40, 56, prog(t, era + 1.0, era + 1.5), C["lilac"], "mmc", lw=6)
    k2 = prog(t, tv("L2") + 0.2, tv("L2") + 0.6)
    if k2 > 0:
        for i, (x, y, s) in enumerate([(880, 520, 80), (930, 610, 56)]):
            hand_text(pen, "?", x, y, s * back_out(k2), color=C["lilac"], key=f"qD{i}")


def shot_B(c, t):
    shot_room(c, t, "B")


def shot_D(c, t):
    return shot_room(c, t, "D")


# =================================================================== CENA C (embaixo da cama)
def shot_C(c, t):
    pen = Pen(c, t, boil_rate=6, dark=True)
    draw_paper(pen, dark=True, rules=False)
    t0 = tv("cut_under")
    tilt_begin(c, ROOM_TILT * 0.6)
    # vão escuro debaixo da cama
    pen.fill([(-100, 440), (1200, 440), (1200, 1150), (-100, 1150)], hexc("#090c22"), "gap", off=None, wob=0)
    floor(pen, 1150)
    # objetos esquecidos
    pen.shape(catmull([(640, 1110), (700, 1080), (760, 1100), (790, 1060), (820, 1080), (800, 1130), (660, 1140)],
                      closed=True, step=6), "sock", fill=C["pink"], stroke=C["ink"], lw=4.5)
    pen.stroke(seg(705, 1092, 712, 1132, 4), "sock1", color=C["cream"], lw=4)
    pen.stroke(seg(735, 1094, 740, 1134, 4), "sock2", color=C["cream"], lw=4)
    bun = catmull([(470, 1120), (480, 1080), (510, 1066), (548, 1074), (566, 1102), (556, 1136), (490, 1140)],
                  closed=True, step=5)
    pen.shape(bun, "bunny", fill=C["gray"], stroke=C["ink"], lw=4)
    bl = blink(t, 0.3, 1.2)
    for sx in (505, 532):
        pen.fill(ellipse(sx, 1100, 5, 7 * (1 - bl) + 1, n=16), C["ink"], f"bun{sx}", off=None)
    pen.shape(ellipse(930, 1115, 34, 28, n=30), "paperball", fill=C["cream"], stroke=C["ink"], lw=4)
    pen.stroke(catmull([(910, 1105), (930, 1120), (948, 1100)], step=4), "pb1", lw=3)
    # facho da lanterna do celular
    sweep = math.sin((t - t0) * 2.4) * 0.12
    ox, oy = 360, 960
    c.save()
    pen.fill([(ox, oy), (1150, 760 + sweep * 900), (1150, 1250 + sweep * 900)], alpha(C["yellow"], 0.28), "beam", off=None, wob=0.3)
    c.restore()
    # borda do cobertor pendurado
    edge = [(-100, 420)] + [(x, 440 + 26 * (i % 2)) for i, x in enumerate(range(-60, 1220, 80))] + [(1200, 420)]
    poly = np.vstack([np.array([(-100, 120), (1200, 120)]), catmull(edge[::-1], step=8)])
    pen.shape(poly, "blkC", fill=C["lilac"], stroke=C["ink"], lw=5.5)
    for i, x in enumerate(range(0, 1100, 160)):
        pen.stroke(seg(x, 160, x + 20, 430, 8), f"blkC{i}", color=C["lilac_d"], lw=5)
    # cabeça de lado espiando
    k = back_out(prog(t, t0, t0 + 0.28))
    hx = lerp(-200, 205, k)
    pose = dict(cup_lift=1.0, look=(0, 1.0), eye_wide=0.4, brow_angle=-0.15, mouth_open=talk(t), smile=-0.1,
                blink=blink(t, 0.9, 2.2))
    # braço + celular
    pen.tube([(-80, 1120), (hx + 70, 1010)], "armC", 66, C["yellow"], lw=5)
    c.save()
    c.translate(hx + 150, 985)
    c.rotate(math.pi / 2 + 0.15)
    pen.shape(rrect(-40, -76, 80, 140, 14), "phC", fill=C["phone"], lw=5)
    pen.fill(ellipse(0, -60, 10, 10), C["yellow"], "flash", off=None)
    c.restore()
    pen.shape(ellipse(hx + 100, 1010, 34, 30, n=40), "handC", fill=C["skin"], lw=5)
    an = draw_head_only(pen, hx, 820, 1.08, -math.pi / 2 + 0.1, pose, key="kidC")
    cord(pen, sag(an["cup_r"], (hx + 150, 1050), 60), "cordC")
    c.restore()


# =================================================================== CENA E (trem x sonho)
RAIL_Y = 840


def draw_train(pen, t, xoff, key="tr"):
    c = pen.c
    bob = 2.5 * math.sin(t * 14)
    c.save()
    c.translate(xoff, bob)
    c.translate(540, RAIL_Y)
    c.scale(0.92, 0.92)
    c.translate(-540, -RAIL_Y)
    # vagão
    pen.shape(rrect(180, 486, 720, 300, 40), key + "body", fill=C["blue"], lw=6, op=cairo.OPERATOR_MULTIPLY)
    pen.shape(rrect(170, 470, 740, 46, 22), key + "roof", fill=C["blue_d"], lw=5)
    pen.fill(rrect(186, 712, 708, 30, 6), C["yellow"], key + "stripe", off=None, op=cairo.OPERATOR_MULTIPLY)
    pen.stroke(seg(186, 712, 894, 712, 8), key + "sl1", lw=4)
    pen.stroke(seg(186, 742, 894, 742, 8), key + "sl2", lw=4)
    # janela-recorte com o interior
    wx, wy, ww, wh = 270, 540, 540, 160
    pen.fill(rrect(wx, wy, ww, wh, 22), C["cream"], key + "wint", off=None)
    c.save()
    pen._path(rrect(wx, wy, ww, wh, 22), True)
    c.clip()
    for sx in (300, 560):
        pen.shape(rrect(sx, 600, 120, 140, 18), key + f"seat{sx}", fill=C["yellow_l"], lw=4)
    draw_doodle(pen, 380, 606, 0.7, mood="sleep", phones=True, key=key + "pas", tilt=0.18)
    pp = tv("play_press")
    up = ease(prog(t, pp - 0.6, pp - 0.2)) * (1 - ease(prog(t, pp + 1.2, pp + 1.6)))
    draw_doodle(pen, 640, 600, 0.7, mood="awake", phones=False, look=(-1, 0), key=key + "tm", arm_up=0.8 * up,
                body_col=C["yellow"], mouth=0.0)
    # celular do colega
    if up > 0.05:
        px, py = 640 - 46 - 4, 600 + 104 - up * 119 + 40
        pen.shape(rrect(px - 20, py - 34, 40, 64, 8), key + "tph", fill=C["phone"], lw=3.5)
        tri = [(px - 7, py - 12), (px + 10, py - 2), (px - 7, py + 8)]
        pen.fill(tri, C["yellow"] if t < pp else C["green"], key + "tpl", off=None)
    c.restore()
    pen.stroke(rrect(wx, wy, ww, wh, 22), key + "wfr", closed=True, lw=6)
    # rodas
    for i, wxp in enumerate([270, 390, 690, 810]):
        rot = -t * 9
        pen.shape(ellipse(wxp, 800, 36, 36, n=40), key + f"wh{i}", fill=C["phone"], lw=5)
        pen.fill(ellipse(wxp, 800, 12, 12), C["gray"], key + f"hub{i}", off=None)
        pen.stroke(seg(wxp + 26 * math.cos(rot), 800 + 26 * math.sin(rot), wxp - 26 * math.cos(rot),
                       800 - 26 * math.sin(rot), 4), key + f"sp{i}", color=C["gray"], lw=4, wob=0)
    c.restore()


def rail(pen, t, y=RAIL_Y, x0=-30, x1=1110, scroll=0.0, sleepers=1.0, lw=10, key="rail"):
    if sleepers > 0:
        sp = 72
        off = scroll % sp
        x = x0 - off
        i = 0
        while x < x1:
            h = 16 * sleepers
            pen.shape(rrect(x - 20, y + 6, 40, h, 4), f"{key}sl{i}", fill=C["wood"], lw=3.5, wob=0.4)
            x += sp
            i += 1
    pen.tube(seg(x0, y, x1, y, 10), key, lw, C["phone"], lw=3)


def dream_half(pen, t, k_in=1.0):
    """Metade de baixo: quarto do sonho com o boneco que sonha."""
    c = pen.c
    tilt_begin(c, ROOM_TILT, 540, 1120)
    pen.fill([(-100, 1330), (1200, 1330), (1200, 2000), (-100, 2000)], C["navy_m"], "flE", off=None, wob=0)
    pen.stroke(seg(-100, 1330, 1200, 1330, 8), "flEl", color=C["cream"], lw=4)
    dream_window(pen, t, 660, 930, 200, 230, "wE", slow=0.5)
    m2s = tv("m2_slow")
    wow = prog(t, m2s, m2s + 0.4)
    look = (0.6, -0.9) if wow > 0 else (0.5, 0.2)
    bobv = 6 * math.sin(t * 1.2)
    long_shadow(pen, (320, 1330), lambda: draw_doodle(pen, 320, 1035 + bobv, 1.2, mood="awake", phones=False, key="dsh"),
                shear=0.8, sy=0.9)
    draw_doodle(pen, 320, 1035 + bobv, 1.2, mood="wow" if wow > 0 else "awake", phones=False, look=look, key="dreamer",
                tilt=-0.15 * wow)
    c.restore()


def shot_E(c, t):
    s2 = tv("s2")
    tr0, tr1 = tv("trans_rail")
    pen = Pen(c, t, boil_rate=10)
    draw_paper(pen)
    pend = Pen(c, t, boil_rate=6, dark=True)
    c.save()
    c.rectangle(0, RAIL_Y, W, H)
    c.clip()
    draw_paper(pend, dark=True)
    dream_half(pend, t)
    c.restore()
    k_tr = prog(t, tr0, tr1)
    scroll = 260 * max(0.0, t - (tr0 + 0.6))
    # paisagem: postes passando
    if k_tr > 0.6:
        for i in range(7):
            px = ((i * 250 - scroll) % 1750) - 250
            pen.stroke(seg(px, 490, px, 530, 6), f"trk{i}", lw=6)
            pen.shape(ellipse(px, 468, 48, 44, n=40), f"tree{i}", fill=C["green"], lw=5, op=cairo.OPERATOR_MULTIPLY)
    # trem entra
    tx = lerp(-1100, 0, ease_out(prog(t, tr0 + 0.7, tr0 + 1.6)))
    rail_k = ease(prog(t, tr0 + 0.15, tr0 + 0.85))
    if rail_k >= 1:
        rail(pen, t, scroll=scroll, sleepers=ease_out(prog(t, tr0 + 0.6, tr0 + 1.0)))
    draw_train(pen, t, tx)
    # notas normais saindo do fone do passageiro
    for i, nt in enumerate(tv("m2_notes")):
        a = prog(t, nt, nt + 0.12)
        if a > 0 and t < tv("descend", 0):
            note(pen, 350 + i * 60, 570 - 70 * prog(t, nt, nt + 0.6) - i * 14, 1.05 * back_out(a), C["yellow"], key=f"nE{i}")
    d0, d1 = tv("descend")
    kd = prog(t, d0, d1)
    if 0 < kd < 1:
        for i in range(3):
            y = lerp(500 - i * 14, 990, ease_in(kd))
            note(pen, 360 + i * 46 + kd * (i - 1) * 60, y, lerp(0.7, 1.0, kd), mix(C["yellow"], C["lilac"], kd),
                 sx=lerp(1, 2.2, kd), key=f"nD{i}", ink=C["ink"] if y < RAIL_Y else C["cream"])
    for i, nt in enumerate(tv("m2_slow_notes")):
        a = prog(t, nt, nt + 0.6)
        if a > 0:
            age = t - nt
            x, y = [(200, 1000), (430, 930), (640, 1000)][i]
            fade = 1 - prog(t, nt + 9.0, nt + 10.0)
            c.save()
            c.push_group()
            note(pend, x + 8 * age, y - 6 * age + 8 * math.sin(age * 0.8 + i), 1.05 * ease_out(a), C["lilac"], sx=2.2,
                 key=f"nS{i}", ink=C["cream"])
            c.pop_group_to_source()
            c.paint_with_alpha(clamp(fade))
            c.restore()
    # títulos e etiquetas
    kt = prog(t, tr0 + 0.8, tr0 + 1.8)
    hand_text(pen, "a cena dos fones", 205, 292, 84, progress=kt, key="tE")
    if kt > 0.3:
        w = text_w(c, "realidade", "note", 46)
        marker_swash(pen, 196, 343, w + 18, 46, alpha(C["blue"], 0.9), "rsw", progress=prog(t, tr0 + 1.2, tr0 + 1.6))
        hand_text(pen, "realidade", 205, 380, 46, kind="note", key="rl", progress=prog(t, tr0 + 1.2, tr0 + 1.6))
        w = text_w(c, "sonho", "note", 46)
        marker_swash(pend, 196, 878, w + 18, 46, alpha(C["lilac_d"], 0.95), "ssw", progress=prog(t, tr0 + 1.4, tr0 + 1.8))
        hand_text(pend, "sonho", 205, 915, 46, kind="note", key="sn", progress=prog(t, tr0 + 1.4, tr0 + 1.8))
    # relógios: lá dentro passa mais tempo
    l5 = tv("L5")
    kc = prog(t, l5 + 0.4, l5 + 0.8)
    if kc > 0:
        tt = max(0.0, t - (l5 + 0.4))
        c.save()
        c.translate(880, 300)
        c.scale(back_out(kc), back_out(kc))
        c.translate(-880, -300)
        clock(pen, 880, 300, 56, tt * TAU / 10, C["yellow"], "ck1")
        c.restore()
        c.save()
        c.translate(800, 1215)
        c.scale(back_out(kc), back_out(kc))
        c.translate(-800, -1215)
        clock(pend, 800, 1215, 64, tt * TAU / 1.1, C["lilac"], "ck2")
        c.restore()
        arrow(pend, catmull([(600, 1262), (660, 1270), (722, 1240)], step=5), prog(t, l5 + 1.4, l5 + 1.9), "ckar",
              col=C["cream"])
        hand_text(pend, "+ tempo", 590, 1282, 58, color=C["cream"], align="right", progress=prog(t, l5 + 1.6, l5 + 2.2), key="mt")
    # transição: fio do fone vira o trilho
    if k_tr < 1:
        ks = ease(prog(t, tr0, tr0 + 0.3))
        if ks < 1:
            sd = render_to_surface(shot_D_nocord, tr0)
            c.save()
            c.set_source_surface(sd, 0, 0)
            c.paint_with_alpha(1 - ks)
            c.restore()
        cp = CORD_D_CACHE.get("cord")
        if cp is None:
            sd, cp = render_D_with_cord(tr0)
        line = np.stack([np.linspace(cp[0][0] * 0 - 30, 1110, len(cp)), np.full(len(cp), RAIL_Y)], 1)
        line = line[::-1] if cp[0][0] > cp[-1][0] else line
        km = rail_k
        pts = cp * (1 - km) + line * km
        cord(pen, pts, "cordmorph", width=lerp(9, 10, km), shadow=False)
    if rail_k < 1 and k_tr >= 1:
        rail(pen, t, scroll=scroll)


CORD_D_CACHE = {}


def render_D_with_cord(t):
    s, c = new_surface()
    _, cp = shot_room(c, t, "D")
    CORD_D_CACHE["cord"] = cp
    return s, cp


def shot_D_nocord(c, t):
    shot_room(c, t, "D")


# =================================================================== CENA F (frequência)
AX_X0, AX_X1, AX_Y = 210, 870, 640
G1_Y, G2_Y = 575, 950
GA = 110


def phone_ui(pen, t, cx, cy, w, h, state):
    c = pen.c
    x0, y0 = cx - w / 2, cy - h / 2
    pen.shape(rrect(x0, y0, w, h, 46), "pbody", fill=C["phone"], lw=6)
    pen.fill(rrect(x0 + 18, y0 + 22, w - 36, h - 44, 30), C["blue_l"], "pscr", off=None, wob=0.3)
    # capa do álbum: o sinal de despertar
    pen.shape(rrect(cx - 90, y0 + 60, 180, 150, 18), "palb", fill=C["yellow"], lw=4)
    note(pen, cx - 34, y0 + 150, 0.9, C["lilac"], key="pan1")
    note(pen, cx + 22, y0 + 136, 0.9, C["lilac"], key="pan2")
    # barra de progresso
    by = y0 + 248
    pen.fill(rrect(x0 + 50, by - 6, w - 100, 12, 6), alpha(C["ink"], 0.18), "pbar", off=None, wob=0)
    pr = state.get("progress", 0.0)
    if pr > 0:
        pen.fill(rrect(x0 + 50, by - 6, (w - 100) * pr, 12, 6), C["blue_d"], "pbar2", off=None, wob=0)
    pen.dot(x0 + 50 + (w - 100) * pr, by, 11, C["blue_d"])
    # botão play/pause
    py = y0 + 340
    pr_ = state.get("press_play", 0.0)
    rr = 54 * (1 - 0.12 * pr_)
    pen.shape(ellipse(cx, py, rr, rr, n=50), "pplay", fill=C["yellow"], lw=5)
    c.save()
    c.set_source_rgba(*C["ink"])
    if state.get("playing"):
        c.rectangle(cx - 17, py - 22, 12, 44)
        c.rectangle(cx + 5, py - 22, 12, 44)
    else:
        c.move_to(cx - 14, py - 24)
        c.line_to(cx + 24, py)
        c.line_to(cx - 14, py + 24)
        c.close_path()
    c.fill()
    c.restore()
    # linha de ajustes (some durante a comparação)
    ra = state.get("row", 1.0)
    if ra > 0.01:
        c.save()
        c.push_group()
        ry = y0 + 452
        sp = state.get("speed", "1×")
        hot = state.get("press_speed", 0.0)
        chip_col = C["yellow"] if sp != "1×" else C["cream"]
        pen.shape(rrect(x0 + 36, ry - 30, 150, 74, 37), "pchip", fill=chip_col, lw=4.5)
        set_font(c, "big", 46)
        tw_ = c.text_extents(sp).x_advance
        c.set_source_rgba(*C["ink"])
        c.move_to(x0 + 36 + 75 - tw_ / 2, ry + 23)
        c.show_text(sp)
        if hot > 0:
            pen.stroke(ellipse(x0 + 111, ry + 7, 90 + 20 * hot, 50 + 14 * hot, n=40), "pchiph", color=alpha(C["yellow_d"], 1 - hot),
                       closed=True, lw=5)
        # chave 'corrigir tom' desligada
        swx = x0 + w - 98
        set_font(c, "cap", 29)
        lbl = "corrigir tom"
        c.set_source_rgba(*C["ink"])
        c.move_to(swx - c.text_extents(lbl).x_advance / 2, ry - 20)
        c.show_text(lbl)
        pen.shape(rrect(swx - 52, ry - 2, 104, 52, 26), "ptg", fill=hexc("#c9ccd8"), lw=4)
        pen.shape(ellipse(swx - 26, ry + 24, 20, 20, n=30), "ptgk", fill=C["white"], lw=4)
        set_font(c, "cap", 24)
        c.set_source_rgba(*alpha(C["ink"], 0.75))
        c.move_to(swx + 4, ry + 33)
        c.show_text("off")
        c.pop_group_to_source()
        c.paint_with_alpha(ra)
        c.restore()
    return {"play": (cx, py), "speed": (x0 + 111, y0 + 459)}


def wave_pts(x0, x1, y, amp, cycles, phase=0.0, n=None, prog_=1.0):
    n = n or int((x1 - x0) / 2.5)
    x = np.linspace(x0, x1, n)
    ph = (x - x0) / (x1 - x0) * cycles * TAU
    yy = y - amp * np.sin(ph - phase)
    pts = np.stack([x, yy], 1)
    return partial(pts, prog_) if prog_ < 1 else pts


def axes(pen, x0, x1, y, h, k, key, ylab=None):
    pen.stroke(seg(x0 - 10, y, x1 + 10, y, 8), key + "x", lw=5, progress=k)
    if k >= 0.98:
        pen.stroke(seg(x1 + 10, y, x1 - 10, y - 12, 3), key + "xa1", lw=5)
        pen.stroke(seg(x1 + 10, y, x1 - 10, y + 12, 3), key + "xa2", lw=5)
    pen.stroke(seg(x0, y + h, x0, y - h, 8), key + "y", lw=5, progress=k)


def shot_F(c, t):
    s3 = tv("s3")
    a0, a1 = tv("trans_axis")
    ka = prog(t, a0, a1)
    pen = Pen(c, t, boil_rate=10)
    draw_paper(pen)
    # ---- transição: trilho -> eixo do tempo
    if ka < 1:
        wipe = ease(prog(t, a0 + 0.15, a0 + 0.75))
        ytop = lerp(RAIL_Y, H, wipe)
        if ytop < H:
            pend = Pen(c, t, boil_rate=6, dark=True)
            c.save()
            c.rectangle(0, ytop, W, H)
            c.clip()
            draw_paper(pend, dark=True)
            c.translate(0, ytop - RAIL_Y)
            dream_half(pend, t)
            c.restore()
        tx = 1400 * ease_in(prog(t, a0, a0 + 0.55))
        if tx < 1300:
            draw_train(pen, t, tx)
    km = ease(prog(t, a0 + 0.3, a0 + 0.95))
    y = lerp(RAIL_Y, AX_Y, km)
    x0 = lerp(-30, AX_X0 - 10, km)
    x1 = lerp(1110, AX_X1 + 10, km)
    explain = tv("explain")
    l11 = tv("L11")
    phase3 = t >= l11
    if not phase3:
        rail(pen, t, y=y, x0=x0, x1=x1, sleepers=1 - km, lw=lerp(10, 5, km), key="axr")
        if km >= 1:
            pen.stroke(seg(AX_X1 + 10, AX_Y, AX_X1 - 12, AX_Y - 13, 3), "axa1", lw=5)
            pen.stroke(seg(AX_X1 + 10, AX_Y, AX_X1 - 12, AX_Y + 13, 3), "axa2", lw=5)
            for i in range(11):
                xx = AX_X0 + i * 66
                pen.stroke(seg(xx, AX_Y - 8, xx, AX_Y + 8, 3), f"tick{i}", lw=3.5, wob=0.3)
        ky = ease(prog(t, a0 + 0.7, a1))
        if ky > 0:
            pen.stroke(seg(AX_X0, AX_Y + 190, AX_X0, AX_Y - 190, 8), "yax", lw=5, progress=ky)
    # ---- fase 1: celular, 440 Hz -> 0,5x -> 220 Hz
    t440 = tv("t440a")
    t220 = tv("t220a")
    if t < explain + 0.6:
        playing = (t440[0] <= t < t440[1]) or (t220[0] <= t < t220[1])
        live = None
        if t440[0] <= t < t440[1] + 0.12:
            live = (12, C["yellow"], prog(t, *t440))
        elif t220[0] <= t < t220[1] + 0.12:
            live = (6, C["lilac"], prog(t, *t220))
        if live:
            cyc, col, pr = live
            env = clamp((t - (t440[0] if cyc == 12 else t220[0])) / 0.08) * (1 - prog(t, (t440[1] if cyc == 12 else t220[1]), (t440[1] if cyc == 12 else t220[1]) + 0.12))
            pts = wave_pts(AX_X0, AX_X1, AX_Y, 150 * env, cyc, phase=t * 9)
            pen.stroke(pts, "live", color=col, lw=12, wob=0.3)
            pen.stroke(pts, "livei", lw=3.5, wob=0.3)
        # rótulos de frequência (só eles aparecem durante a comparação)
        k1 = prog(t, t440[0], t440[0] + 0.3) * (1 - prog(t, t440[1] + 0.25, t440[1] + 0.45))
        freq_label(pen, "440 Hz", 225, 420, 112, alpha(C["yellow"], 0.95), k1, "fl440a")
        k2 = prog(t, t220[0], t220[0] + 0.3) * (1 - prog(t, explain - 0.15, explain + 0.1))
        freq_label(pen, "220 Hz", 225, 420, 112, alpha(C["lilac"], 0.95), k2, "fl220a")
        pin = ease_out(prog(t, tv("phone_in"), tv("phone_in") + 0.45)) * (1 - ease_in(prog(t, explain - 0.2, explain + 0.15)))
        if pin > 0:
            cy = lerp(1500 + 900, 1080, pin)
            ts = tv("tap_speed")
            st = dict(playing=playing, speed="0,5×" if t >= ts + 0.04 else "1×",
                      row=1 - max(prog(t, t440[0] - 0.05, t440[0] + 0.15) * (1 - prog(t, t440[1], t440[1] + 0.2)),
                                  prog(t, t220[0] - 0.05, t220[0] + 0.15) * (1 - prog(t, t220[1], t220[1] + 0.2))),
                      progress=prog(t, *t440) if t < t220[0] else prog(t, *t220),
                      press_play=max(press_curve(t, tv("tap_play1")), press_curve(t, tv("tap_play2"))),
                      press_speed=prog(t, ts, ts + 0.4) if t >= ts else 0)
            tgt = phone_ui(pen, t, 540, cy, 420, 580, st)
            # dedo tocando
            taps = [(tv("tap_play1"), "play"), (ts, "speed"), (tv("tap_play2"), "play")]
            tip = (-200, 1800)
            for i, (tt_, which) in enumerate(taps):
                prev_end = taps[i - 1][0] + 0.18 if i else tv("phone_in") + 0.3
                k_ = ease(prog(t, max(prev_end, tt_ - 0.4), tt_))
                if t >= prev_end:
                    src = tip
                    tip = lerp2(src, tgt[which], k_)
            hold_back = ease_in(prog(t, t220[0] + 0.2, t220[0] + 0.7))
            tip = lerp2(tip, (-250, 1900), hold_back)
            pr = max(press_curve(t, tv("tap_play1")), press_curve(t, ts), press_curve(t, tv("tap_play2")))
            if tip[0] > -180:
                pointer_hand(pen, (tip[0] - 8 * pr, tip[1] + 8 * pr), press=pr, key="ptrF")
    # ---- fase 2: explicação
    if explain <= t < l11 + 0.5:
        out = 1 - prog(t, l11, l11 + 0.45)
        c.save()
        c.push_group()
        explain_visuals(pen, t)
        c.pop_group_to_source()
        c.paint_with_alpha(out)
        c.restore()
    # ---- fase 3: dois gráficos na mesma escala
    if phase3:
        graphs(pen, t)
    # narrador no canto
    kin = ease_out(prog(t, explain + 0.15, explain + 0.6))
    if kin > 0:
        kx, ky = 250, lerp(1900, 1392, kin)
        playing2 = (tv("t440b", 0) <= t < tv("t440b", 1)) or (tv("t220b", 0) <= t < tv("t220b", 1))
        look = (0.8, -0.8)
        p = dict(look=look, mouth_open=talk(t), smile=0.35, blink=blink(t, 1.2), hand_r=(118, 150), hold_r="phone",
                 phone_screen="pause" if playing2 else "play", phone_rot=0.1, brow_raise=4, legs=True)
        if t >= tv("L12"):
            p.update(brow_raise=12, eye_wide=0.5)
        an = draw_kid(pen, kx, ky, 0.8, p, key="kidF")
        cord(pen, sag(an["cup_r"], an["phone_r"], 70), "cordF")


def press_curve(t, tt_):
    if t < tt_ - 0.02:
        return 0.0
    return clamp(1 - abs(t - tt_ - 0.04) / 0.1)


def explain_visuals(pen, t):
    c = pen.c
    l7, l8, l9, l10 = tv("L7"), tv("L8"), tv("L9"), tv("L10")
    # título manuscrito
    hand_text(pen, "frequência =", 205, 300, 96, progress=prog(t, l7 + 0.2, l7 + 0.9), key="fq1")
    hand_text(pen, "vibrações por segundo", 205, 392, 72, progress=prog(t, l7 + 0.9, l7 + 2.3), key="fq2")
    # colchete de 1 segundo
    kb = prog(t, l7 + 0.6, l7 + 1.2)
    if kb > 0:
        by = 470
        pen.stroke(np.array([(AX_X0, by + 18), (AX_X0, by), (AX_X1, by), (AX_X1, by + 18)]), "brk", lw=4.5, progress=kb)
        hand_text(pen, "1 segundo", (AX_X0 + AX_X1) / 2, by - 10, 46, kind="note", align="center",
                  progress=prog(t, l7 + 1.0, l7 + 1.5), key="1s")
    # onda densa (440) desenhada, depois esticada (0,5x)
    k_draw = prog(t, l7 + 0.8, l8 + 0.9)
    stretch = ease(prog(t, l9 + 1.5, l9 + 3.4))
    cycles = 22 / (1 + stretch)
    col = mix(C["yellow"], C["lilac"], stretch)
    if k_draw > 0:
        pts = wave_pts(AX_X0, AX_X1, AX_Y, 118, cycles, prog_=k_draw)
        pen.stroke(pts, "dense", color=col, lw=10, wob=0.25)
        pen.stroke(pts, "densei", lw=3.2, wob=0.25)
    # um ciclo destacado: dura o dobro
    if t >= l9 + 1.2:
        cw = (AX_X1 - AX_X0) / cycles
        kk = prog(t, l9 + 1.2, l9 + 1.5)
        yb = AX_Y + 150
        pen.stroke(np.array([(AX_X0, yb - 14), (AX_X0, yb), (AX_X0 + cw, yb), (AX_X0 + cw, yb - 14)]), "cyc", lw=4.5,
                   progress=kk, color=C["lilac_d"] if stretch > 0.5 else C["ink"])
        if stretch > 0.95:
            hand_text(pen, "×2", AX_X0 + cw + 18, yb + 16, 64, color=C["lilac_d"], progress=prog(t, l9 + 3.4, l9 + 3.7), key="x2")
    # contador
    cnt = int(round(440 * clamp(k_draw)))
    if t >= l10:
        cnt = int(round(lerp(440, 220, ease(prog(t, l10 + 0.4, l10 + 1.2)))))
    if k_draw > 0:
        is220 = t >= l10 + 0.4
        txt = f"{cnt}"
        set_font(c, "big", 120)
        w = c.text_extents(txt).x_advance
        x = 560 - w / 2
        y = 960
        col_sw = alpha(C["lilac"] if is220 else C["yellow"], 0.95)
        done = (k_draw >= 1 and not (l10 <= t < l10 + 1.2)) or (t >= l10 + 1.2)
        if done:
            marker_swash(pen, x - 16, y - 96, w + 32, 116, col_sw, "cntsw" + ("b" if is220 else "a"),
                         progress=prog(t, (l8 + 0.9) if not is220 else (l10 + 1.2), ((l8 + 1.2) if not is220 else (l10 + 1.5))))
        c.set_source_rgba(*C["ink"])
        c.move_to(x, y)
        c.show_text(txt)
        hand_text(pen, "por segundo", 560, 1030, 50, kind="note", align="center", progress=prog(t, l7 + 1.6, l7 + 2.2), key="ps")


def graphs(pen, t):
    c = pen.c
    l11 = tv("L11")
    ka = prog(t, l11 + 0.1, l11 + 0.9)
    for gy, key in ((G1_Y, "g1"), (G2_Y, "g2")):
        axes(pen, AX_X0, AX_X1, gy, 135, ka, key)
    a440, b440 = tv("t440b")
    a220, b220 = tv("t220b")
    k1 = prog(t, a440, b440)
    if k1 > 0:
        pts = wave_pts(AX_X0, AX_X1, G1_Y, GA, 4, prog_=k1)
        pen.stroke(pts, "w1", color=C["yellow"], lw=13, wob=0.3)
        pen.stroke(pts, "w1i", lw=4, wob=0.3)
        if k1 < 1:
            pen.dot(*pts[-1], 9, C["ink"])
    k2 = prog(t, a220, b220)
    if k2 > 0:
        pts = wave_pts(AX_X0, AX_X1, G2_Y, GA, 2, prog_=k2)
        pen.stroke(pts, "w2", color=C["lilac"], lw=13, wob=0.3)
        pen.stroke(pts, "w2i", lw=4, wob=0.3)
        if k2 < 1:
            pen.dot(*pts[-1], 9, C["ink"])
    freq_label(pen, "440 Hz", 560, G1_Y - 150, 76, alpha(C["yellow"], 0.95), prog(t, a440, a440 + 0.3), "fl440b")
    freq_label(pen, "220 Hz", 560, G2_Y - 150, 76, alpha(C["lilac"], 0.95), prog(t, a220, a220 + 0.3), "fl220b")
    # depois da comparação: rótulos dos eixos, ciclos e destaque
    gd = tv("graphs_done")
    kl = prog(t, gd + 0.1, gd + 0.6)
    if kl > 0:
        for gy, nm, cyc in ((G1_Y, "a", "4 ciclos"), (G2_Y, "b", "2 ciclos")):
            hand_text(pen, "pressão do ar", AX_X0 + 12, gy - 146, 38, kind="note", progress=kl, key="pa" + nm,
                      color=alpha(C["ink"], 0.75))
            hand_text(pen, "tempo", AX_X1 - 4, gy + 52, 36, kind="note", align="right", progress=kl, key="tp" + nm,
                      color=alpha(C["ink"], 0.75))
            hand_text(pen, cyc, AX_X1 - 4, gy + 108, 46, kind="note", align="right", progress=prog(t, gd + 0.4, gd + 0.9),
                      key="cy" + nm, color=C["lilac_d"] if nm == "b" else C["ink"])
        # mesma janela de tempo
        for xx in (AX_X0, AX_X1):
            for j in range(14):
                yy = G1_Y - 140 + j * 36
                pen.stroke(seg(xx, yy, xx, yy + 16, 4), f"dash{xx}{j}", color=alpha(C["blue_d"], 0.8 * kl), lw=3, wob=0.2)
    l12 = tv("L12")
    circle_mark(pen, (AX_X0 + AX_X1) / 2, G2_Y + 5, 375, 158, prog(t, l12 + 0.9, l12 + 1.8), alpha(C["lilac_d"], 0.9), "g2c", lw=7)
    kg = prog(t, l12 + 1.6, l12 + 2.2)
    if kg > 0:
        hand_text(pen, "mais grave", 560, G2_Y + 210, 60, color=C["lilac_d"], progress=kg, key="mg")
        arrow(pen, catmull([(540, G2_Y + 190), (500, G2_Y + 150), (470, G2_Y + 110)], step=5), prog(t, l12 + 2.0, l12 + 2.4),
              "mga", col=C["lilac_d"])


# =================================================================== CENA G (aquário / refração)
TANK = (200, 470, 660, 690)    # x, y, w, h
WS = 700
LAM_A = 46.0
LAM_W = LAM_A * 4.35           # ~1500 m/s / ~345 m/s
F_VIS = 1.15                   # câmera lenta: 440 por segundo ficaria invisível
EMIT = (800, 430)


def tank_path():
    x, y, w, h = TANK
    pts = np.vstack([seg(x, y, x, y + h, 6), seg(x, y + h, x + w, y + h, 6), seg(x + w, y + h, x + w, y, 6)])
    return pts


def band_positions(t, t0):
    """Frentes de compressão saindo da concha e atravessando ar -> água.
    A frequência (frentes por segundo) é a mesma nos dois meios."""
    x, y, w, h = TANK
    va, vw = LAM_A * F_VIS, LAM_W * F_VIS
    y0 = EMIT[1] + 50
    ta = (WS - y0) / va
    bottom = y + h - 12
    out = []
    n0 = int(math.floor((t - t0) * F_VIS)) + 1
    for n in range(n0 - 60, n0 + 1):
        tau = t - (t0 + n / F_VIS)
        if tau < 0:
            continue
        if tau < ta:
            yy = y0 + va * tau
            med = "a"
        else:
            yy = WS + vw * (tau - ta)
            med = "w"
        if yy < bottom:
            out.append((yy, med, n))
    return out


def shot_G(c, t, freeze=None):
    pen = Pen(c, t, boil_rate=10)
    draw_paper(pen)
    s4 = tv("s4")
    x, y, w, h = TANK
    # título e hipótese
    hand_text(pen, "Será que foi refração?", 205, 292, 86, progress=prog(t, s4 + 0.4, s4 + 1.4), key="tG")
    l13 = tv("L13")
    hyp_k = prog(t, l13 + 1.5, l13 + 2.6)
    if hyp_k > 0:
        hw, _ = hand_text(pen, "hipótese: sonho = água?", 225, 395, 44, kind="note", progress=hyp_k, key="hyp")
        circle_mark(pen, 225 + hw / 2, 380, hw / 2 + 34, 38, prog(t, l13 + 2.6, l13 + 3.1), alpha(C["blue_d"], 0.9), "hypc", lw=5)
        kx_ = prog(t, tv("cross_out"), tv("cross_out") + 0.5)
        if kx_ > 0:
            pen.stroke(catmull([(215, 400), (330, 370), (460, 392), (580, 362), (225 + hw + 10, 380)], step=6), "hx1",
                       color=C["red"], lw=7, progress=kx_)
            pen.stroke(seg(225 + hw + 40, 350, 225 + hw + 80, 410, 4), "hx2", color=C["red"], lw=7, progress=prog(t, tv("cross_out") + 0.4, tv("cross_out") + 0.6))
            pen.stroke(seg(225 + hw + 80, 350, 225 + hw + 40, 410, 4), "hx3", color=C["red"], lw=7, progress=prog(t, tv("cross_out") + 0.5, tv("cross_out") + 0.7))
    # enchendo com marca-texto azul
    f0, f1 = tv("fill")
    kf = prog(t, f0, f1)
    n_str = 13
    if kf > 0:
        c.save()
        c.rectangle(x + 4, WS, w - 8, h - (WS - y) - 4)
        c.clip()
        c.set_operator(cairo.OPERATOR_MULTIPLY)
        c.set_source_rgba(*alpha(C["blue"], 0.85))
        c.set_line_width(64)
        c.set_line_cap(cairo.LINE_CAP_ROUND)
        tip = None
        for i in range(n_str):
            a = clamp(kf * n_str - i)
            if a <= 0:
                break
            yy = y + h - 30 - i * ((y + h - WS) / (n_str - 1.6))
            xa, xb = (x - 10, x + w + 10) if i % 2 == 0 else (x + w + 10, x - 10)
            xe = lerp(xa, xb, a)
            sl = 46 if i % 2 == 0 else -46
            c.move_to(xa, yy + sl)
            c.line_to(xe, yy + sl - 2 * sl * a)
            c.stroke()
            tip = (xe, yy)
        if kf >= 1:
            c.set_source_rgba(*alpha(C["blue"], 0.35))
            c.paint()
        c.restore()
        if kf >= 1:
            surf = [(x + 4 + i * 40, WS + 6 * math.sin(i * 1.3 + t * 3)) for i in range(17)]
            pen.stroke(catmull(surf, step=6), "surf", color=C["blue_d"], lw=5)
    # frentes de compressão
    tb = tv("bands")
    kb = prog(t, tb, tb + 0.5)
    if kb > 0:
        c.save()
        c.rectangle(x + 6, y - 120, w - 12, h + 108)
        c.clip()
        c.push_group()
        bands = band_positions(t, tb - 30)
        for yy, med, n in bands:
            if med == "a":
                pen.fill(rrect(x + 10, yy - 7, w - 20, 14, 7), alpha(C["lilac_d"], 0.85), f"ba{n}", off=None, wob=0.3)
            else:
                pen.fill(rrect(x + 10, yy - 11, w - 20, 22, 11), alpha(C["navy"], 0.75), f"bw{n}", off=None, wob=0.3)
        c.pop_group_to_source()
        c.paint_with_alpha(kb)
        c.restore()
        # espaçamento: colchetes entre duas frentes
        l15 = tv("L15")
        ks = prog(t, l15 + TL_word_time("L15", 9), l15 + TL_word_time("L15", 9) + 0.5)
        if ks > 0:
            air = [b[0] for b in bands if b[1] == "a" and b[0] > y + 20]
            wat = [b[0] for b in bands if b[1] == "w"]
            if len(air) >= 2:
                a1, a2 = sorted(air)[-2:]
                bracket_v(pen, x + w - 70, a1, a2, ks, "sa", C["ink"])
            if len(wat) >= 2:
                w1, w2 = sorted(wat)[:2]
                bracket_v(pen, x + w - 70, w1, w2, ks, "sw", C["ink"])
        # detectores piscando no mesmo ritmo
        kc = prog(t, tv("counters"), tv("counters") + 0.3)
        if kc > 0:
            for dy, nm in ((640, "da"), (1010, "dw")):
                hit = 0.0
                for yy, med, n in bands:
                    d = abs(yy - dy)
                    hit = max(hit, clamp(1 - d / (24 if med == "a" else 90)))
                pen.shape(ellipse(x + w - 26, dy, 15 + 6 * hit, 15 + 6 * hit, n=30), nm, fill=mix(C["cream"], C["yellow"], hit),
                          lw=4)
                pen.stroke(seg(x + 8, dy, x + w - 46, dy, 10), nm + "l", color=alpha(C["ink"], 0.35 * kc), lw=2.5)
    # vidro do aquário (desenhado pela mão)
    d0, d1 = tv("draw_tank")
    kd = prog(t, d0, d1)
    if kd > 0:
        pen.stroke(tank_path(), "tank", lw=7, progress=kd)
        if kd >= 1:
            pen.stroke(seg(x - 18, y, x + 40, y, 4), "rim1", lw=6)
            pen.stroke(seg(x + w - 40, y, x + w + 18, y, 4), "rim2", lw=6)
            pen.stroke(seg(x + 22, y + 30, x + 22, y + h - 40, 8), "gl1", color=alpha(C["blue_d"], 0.6), lw=4)
            pen.shape(rrect(x - 10, y + h, w + 20, 26, 8), "base", fill=C["wood"], lw=5)
    # concha emissora pendurada pelo fio
    ke = prog(t, tb - 0.6, tb)
    if ke > 0:
        ex, ey = EMIT
        ey2 = lerp(ey - 400, ey, ease_out(ke))
        cord(pen, bez((1150, 330), (960, 330), (ex, ey2 - 120), (ex, ey2 - 40)), "cordG")
        pen.shape(rrect(ex - 56, ey2 - 44, 112, 76, 30), "emit", fill=C["phone"], lw=5)
        pen.fill(rrect(ex - 46, ey2 + 20, 92, 12, 6), C["pink"], "emitc", off=None)
    # rótulos
    l15 = tv("L15")
    kl = prog(t, l15 + TL_word_time("L15", 7), l15 + TL_word_time("L15", 7) + 0.5)
    if kb > 0:
        hand_text(pen, "ar", x + 26, 545, 60, progress=prog(t, tb, tb + 0.3), key="ar")
        hand_text(pen, "água", x + 26, 800, 60, progress=prog(t, tb + 0.2, tb + 0.5), key="agua")
        freq_label(pen, "440 Hz", 560, 560, 50, alpha(C["yellow"], 0.95), prog(t, tb + 0.2, tb + 0.6), "g440a")
        freq_label(pen, "440 Hz", 560, 830, 50, alpha(C["yellow"], 0.95), prog(t, tb + 0.4, tb + 0.8), "g440w")
    if kl > 0:
        hand_text(pen, "≈ 340 m/s", x + 26, 600, 40, kind="note", progress=kl, key="va")
        hand_text(pen, "≈ 1.500 m/s", x + 26, 855, 40, kind="note", progress=prog(t, l15 + TL_word_time("L15", 7) + 0.2,
                                                                                l15 + TL_word_time("L15", 7) + 0.7), key="vw")
    # narrador espiando no canto
    l14 = tv("L14")
    kk = ease_out(prog(t, l14 - 0.1, l14 + 0.35))
    if kk > 0:
        l17 = tv("L17")
        sad = ease(prog(t, l17 + 0.3, l17 + 0.8))
        p = dict(look=(0.85, -0.75), mouth_open=talk(t), smile=lerp(0.6, -0.4, sad), blink=blink(t, 0.4),
                 brow_raise=lerp(12, 0, sad), brow_angle=lerp(0.0, 0.3, sad), eye_wide=0.4 * (1 - sad),
                 hand_r=(140, 150), hold_r="marker", legs=True)
        if t > tv("L15"):
            p["look"] = (0.9, -0.5 + 0.25 * math.sin(t * 1.5))
        draw_kid(pen, 210, lerp(1900, 1395, kk), 0.72, p, key="kidG")
    # mão com caneta / marca-texto
    tip = None
    if d0 - 0.4 <= t <= d1:
        tip = point_at(tank_path(), kd) if kd > 0 else lerp2((1300, 1700), (x, y), ease_out(prog(t, d0 - 0.4, d0)))
        hold = "pen"
    elif d1 < t < f0:
        tip = lerp2((x + w, y), (x - 10, y + h - 30), ease(prog(t, d1, f0)))
        hold = "marker"
    elif f0 <= t <= f1 + 0.5:
        a = clamp(kf * n_str)
        i = min(int(a), n_str - 1)
        fr = a - i
        yy = y + h - 30 - i * ((y + h - WS) / (n_str - 1.6))
        xa, xb = (x - 10, x + w + 10) if i % 2 == 0 else (x + w + 10, x - 10)
        tip = (lerp(xa, xb, fr if kf < 1 else 1), yy)
        if t > f1:
            tip = lerp2(tip, (1350, 1700), ease_in(prog(t, f1, f1 + 0.5)))
        hold = "marker"
    if tip is not None and tip[0] < 1300:
        draw_big_hand(pen, tip, ang=0.32, s=1.4, hold=hold, key="handG", sleeve_from=(1350, 1950))


def bracket_v(pen, xx, ya, yb, k, key, col):
    pen.stroke(np.array([(xx - 14, ya), (xx, ya), (xx, yb), (xx - 14, yb)]), key, color=col, lw=4.5, progress=k)


# =================================================================== CENA H (fechamento em loop)
BOOK = (270, 900, 540, 480)   # x, y, w, h (aberto); página direita = 1/4 da tela


def room_H(pen, t, dark, tilt=0.0):
    c = pen.c
    draw_paper(pen, dark=dark)
    tilt_begin(c, tilt, 540, 1000)
    if dark:
        dream_window(pen, t, 640, 330, 240, 300, "wH", slow=0.5)
        pen.shape(rrect(240, 360, 170, 220, 8), "posterH", fill=C["navy_l"], stroke=C["cream"], lw=5)
        note(pen, 315, 500, 1.2, C["lilac"], key="pnH")
    else:
        pen.shape(rrect(640, 330, 240, 300, 10), "winH", fill=C["blue_l"], lw=6, op=cairo.OPERATOR_MULTIPLY)
        pen.shape(ellipse(820, 400, 34, 34, n=40), "sunH", fill=C["yellow"], lw=4, op=cairo.OPERATOR_MULTIPLY)
        pen.stroke(seg(760, 330, 760, 630, 6), "wbH1", lw=5)
        pen.stroke(seg(640, 480, 880, 480, 6), "wbH2", lw=5)
        pen.shape(rrect(240, 360, 170, 220, 8), "posterH", fill=C["yellow_l"], lw=5, op=cairo.OPERATOR_MULTIPLY)
        note(pen, 315, 500, 1.2, C["blue"], key="pnH")
    c.restore()


def kid_pose_H(t):
    s5 = tv("s5")
    c0, c1 = tv("close_diary")
    pt = tv("pause_tap")
    n3 = tv("m3_notes")
    lc = tv("look_cam")
    p = dict(look=(0.0, 0.5), smile=0.35, blink=blink(t, 0.5, 3.0), mouth_open=talk(t),
             hand_l=(-272, 179), hand_r=(272, 179), hold_r=None, phone_screen="pause", phone_rot=0.0, legs=True)
    # depois de fechar: abaixa o diário, pega o celular
    lower = ease(prog(t, c1 + 0.3, c1 + 0.8))
    p["hand_l"] = lerp2(p["hand_l"], (-150, 318), lower)
    p["hand_r"] = lerp2(p["hand_r"], (150, 318), lower)
    up = ease(prog(t, pt - 1.0, pt - 0.5))
    if up > 0:
        p["hand_r"] = lerp2(p["hand_r"], (96, 128), up)
        p["hold_r"] = "phone"
        p["look"] = lerp2((0.0, 0.5), (0.45, 0.9), up)
        tap = ease(prog(t, pt - 0.35, pt)) * (1 - ease(prog(t, pt + 0.15, pt + 0.5)))
        p["hand_l"] = lerp2(p["hand_l"], (60, 118), tap)
        p["front_l"] = tap > 0.3
        p["phone_screen"] = "pause" if t < pt else "play"
    if t > lower and t < pt - 1.0:
        p["look"] = (0.0, 0.0)
    # sonho: notas ainda mais graves, movimentos bem lentos
    if t >= n3[0]:
        a = ease(prog(t, n3[0] + 0.05, n3[0] + 1.0))
        p.update(cup_lift=a, eye_wide=a, brow_raise=14 * a, smile=0.0)
        p["look"] = lerp2((0.45, 0.9), (-0.8, -0.4), ease(prog(t, n3[1], n3[1] + 1.2)))
        p["look"] = lerp2(p["look"], (0.85, -0.4), ease(prog(t, n3[2], n3[2] + 1.2)))
        p["blink"] = 0.0
        p["phone_screen"] = "play"
    if t >= lc:
        e = ease(prog(t, lc, lc + 0.5))
        p["look"] = lerp2(p["look"], (0.0, 0.0), e)
        p["brow_angle"] = lerp(0.0, -0.18, e)
        p["brow_raise"] = lerp(14, 2, e)
        p["eye_wide"] = lerp(1, 0.2, e)
        p["cup_lift"] = 1.0
        l21 = tv("L21")
        if t >= l21:
            q = ease(prog(t, l21, l21 + 0.3))
            p["brow_angle"] = lerp(-0.18, 0.25, q)
            p["brow_raise"] = lerp(2, 16, q)
            p["eye_wide"] = lerp(0.2, 0.8, q)
        p["blink"] = blink(t, 0.1, 2.5)
    return p


def draw_book(pen, t, k_close):
    """Diário aberto (segurado de frente). k_close: 0 aberto, 1 fechado."""
    c = pen.c
    x, y, w, h = BOOK
    sp = x + w / 2
    pen.shape(rrect(x - 12, y - 12, w + 24, h + 24, 14), "bkcov", fill=C["navy"], lw=5)
    # página esquerda (verso com restos do gráfico)
    if k_close < 0.5:
        sx = 1 - 2 * k_close
        c.save()
        c.translate(sp, 0)
        c.scale(sx, 1)
        c.translate(-sp, 0)
        pen.fill(rrect(x, y, w / 2, h, 6), C["paper"], "bkl", off=None, wob=0.2)
        for i in range(7):
            pen.stroke(seg(x + 10, y + 80 + i * 58, sp - 10, y + 80 + i * 58, 20), f"bkll{i}", color=alpha(C["rule"], 0.8), lw=2)
        pen.stroke(wave_pts(x + 40, sp - 30, y + 200, 30, 2), "bklw", color=alpha(C["lilac"], 0.7), lw=6)
        pen.stroke(rrect(x, y, w / 2, h, 6), "bklo", lw=4, closed=True)
        c.restore()
    return (sp, y, w / 2, h)


def draw_cover(pen, k):
    c = pen.c
    x, y, w, h = BOOK
    sp = x + w / 2
    sx = 2 * k - 1
    c.save()
    c.translate(sp, 0)
    c.scale(max(sx, 0.001), 1)
    c.translate(-sp, 0)
    pen.shape(rrect(sp - 4, y - 12, w / 2 + 16, h + 24, 14), "cov", fill=C["navy"], lw=5.5)
    pen.shape(rrect(sp + 40, y + 70, w / 2 - 70, 120, 10), "covl", fill=C["cream"], lw=4)
    hand_text(pen, "diário", sp + 60, y + 118, 46, color=C["ink"], key="cv1")
    hand_text(pen, "de sonhos", sp + 60, y + 166, 42, color=C["ink"], key="cv2")
    moon = np.vstack([ellipse(sp + 190, y + 320, 44, 44, a0=-2.0, a1=2.0, n=40),
                      ellipse(sp + 210, y + 316, 32, 36, a0=1.8, a1=-1.8, n=40)])
    pen.shape(moon, "covm", fill=C["yellow"], lw=4)
    for i, (sx_, sy_) in enumerate([(sp + 80, y + 300), (sp + 110, y + 400), (sp + 230, y + 430)]):
        pen.stroke(seg(sx_ - 10, sy_, sx_ + 10, sy_, 3), f"cs{i}a", color=C["yellow"], lw=4)
        pen.stroke(seg(sx_, sy_ - 10, sx_, sy_ + 10, 3), f"cs{i}b", color=C["yellow"], lw=4)
    c.restore()


def shot_H_base(c, t):
    """Quarto do fechamento, com a transição para o sonho e o empurrão de câmera."""
    s5 = tv("s5")
    z0, z1 = tv("zoom_out")
    c0, c1 = tv("close_diary")
    ds0, ds1 = tv("dream_shift")
    lc = tv("look_cam")
    kz = ease(prog(t, z0, z1))
    kd = ease(prog(t, ds0, ds1))
    tilt = ROOM_TILT * kd
    push = 1 + 0.13 * ease(prog(t, lc, lc + 2.5))
    kx, ky, ks = 540, 960, 0.95
    head = (kx, ky - 172 * ks)
    c.save()
    c.translate(head[0], head[1])
    c.scale(push, push)
    c.translate(-head[0], -head[1])
    pen = Pen(c, t, boil_rate=10)
    room_H(pen, t, False)
    if kd > 0:
        pend = Pen(c, t, boil_rate=6, dark=True)
        c.save()
        r = 2300 * kd
        circ = ellipse(head[0], head[1], r, r, n=90)
        circ = pend.wobble(circ, "wipe", closed=True, amp=6)
        pend._path(circ, True)
        c.clip()
        room_H(pend, t, True, tilt)
        pose = kid_pose_H(t)
        long_shadow(pend, (kx, 1700), lambda: draw_kid(pend, kx, ky, ks, pose, key="kidHs"), shear=0.6, sy=1.15)
        c.restore()
    pk = pend if kd >= 1 else pen
    pose = kid_pose_H(t)
    an = draw_kid(pk, kx, ky, ks, pose, key="kidH")
    # diário
    kc = prog(t, c0, c1)
    low = ease_in(prog(t, c1 + 0.3, c1 + 0.8))
    if low < 1:
        c.save()
        c.translate(0, 1100 * low)
        page = draw_book(pen, t, kc)
        if kc < 1 and kz >= 1:
            g = render_to_surface(shot_G, t)
            px, py, pw, ph = page
            c.save()
            c.rectangle(px, py, pw, ph)
            c.clip()
            c.translate(px, py)
            c.scale(pw / W, ph / H)
            c.set_source_surface(g, 0, 0)
            c.paint()
            c.restore()
            pen.stroke(rrect(px, py, pw, ph, 6), "bkro", lw=4, closed=True)
        if kc > 0.5:
            draw_cover(pen, kc)
        # mãos segurando as bordas
        for hx in (BOOK[0] - 4, BOOK[0] + BOOK[2] + 4):
            pen.shape(ellipse(hx, 1130, 30, 34, n=40), f"bkh{hx}", fill=C["skin"], lw=5)
        c.restore()
    # fio: concha -> celular (ou bolso)
    if pose.get("hold_r") == "phone":
        cp = sag(an["cup_r"], an["phone_r"], 80)
    else:
        cp = sag(an["cup_r"], (kx + 150 * ks, ky + 330 * ks), 60)
    pull0 = tv("pull", 0)
    if t >= pull0 - 0.3:
        tight = ease(prog(t, pull0 - 0.3, pull0))
        straight = seg(an["cup_r"][0], an["cup_r"][1], an["cup_r"][0] + 40, H + 60, 8)
        straight = np.stack([np.interp(np.linspace(0, 1, len(cp)), np.linspace(0, 1, len(straight)), straight[:, 0]),
                             np.interp(np.linspace(0, 1, len(cp)), np.linspace(0, 1, len(straight)), straight[:, 1])], 1)
        cp = cp * (1 - tight) + straight * tight
    cord(pk, cp, "cordH")
    c.restore()
    # entrada: a página do aquário encolhe para dentro do diário
    if kz < 1:
        g = render_to_surface(shot_G, t)
        px, py, pw, ph = BOOK[0] + BOOK[2] / 2, BOOK[1], BOOK[2] / 2, BOOK[3]
        sc = lerp(1.0, pw / W, kz)
        ox, oy = lerp(0, px, kz), lerp(0, py, kz)
        c.save()
        c.translate(ox, oy)
        c.scale(sc, sc)
        c.set_source_surface(g, 0, 0)
        c.paint()
        c.restore()


def shot_H(c, t):
    p0, p1 = tv("pull")
    if t < p0:
        shot_H_base(c, t)
        return
    # o fio puxa a página e revela o primeiro quadro
    shot_A(c, 0.0)
    k = prog(t, p0, p1)
    if k >= 1:
        return
    page = render_to_surface(shot_H_base, min(t, p0 + 0.001))
    e = ease_in(k)
    dy = 2150 * e
    rot = 0.16 * e
    dx = -120 * e
    c.save()
    # sombra da página puxada
    c.translate(dx + 18, dy + 14)
    c.translate(540, 1920)
    c.rotate(rot)
    c.translate(-540, -1920)
    c.set_source_rgba(0, 0, 0, 0.28 * (1 - e))
    c.rectangle(0, 0, W, H)
    c.fill()
    c.restore()
    c.save()
    c.translate(dx, dy)
    c.translate(540, 1920)
    c.rotate(rot)
    c.translate(-540, -1920)
    c.set_source_surface(page, 0, 0)
    c.paint()
    c.restore()


# =================================================================== VIRADA DE PÁGINA
SPINE = 46


def page_flip(c, t, fa, fb, rng):
    k = ease(prog(t, *rng))
    fb(c, t)
    sa = render_to_surface(fa, t)
    sx = math.cos(k * math.pi / 2)
    # sombra projetada na página de baixo
    ex = SPINE + (W - SPINE) * sx
    grad = cairo.LinearGradient(ex, 0, ex + 160, 0)
    grad.add_color_stop_rgba(0, 0, 0, 0, 0.35 * math.sin(math.pi * k) + 0.05)
    grad.add_color_stop_rgba(1, 0, 0, 0, 0)
    c.save()
    c.set_source(grad)
    c.rectangle(ex, 0, 160, H)
    c.fill()
    c.restore()
    if sx > 0.002:
        c.save()
        c.translate(SPINE, 0)
        c.scale(sx, 1 - 0.03 * math.sin(math.pi * k))
        c.translate(-SPINE, 0)
        c.set_source_surface(sa, 0, 0)
        c.paint()
        c.set_source_rgba(0, 0, 0, 0.35 * k)
        c.rectangle(0, 0, W, H)
        c.fill()
        c.restore()


# =================================================================== LEGENDAS
HL = [(re.compile(r"440"), "yellow"), (re.compile(r"220"), "lilac")]


def draw_caption(c, t):
    cap = None
    for cp in TL["captions"]:
        if cp["t0"] <= t < cp["t1"]:
            cap = cp
    if cap is None:
        return
    text = cap["text"]
    kin = ease_out(prog(t, cap["t0"], cap["t0"] + 0.14))
    kout = prog(t, cap["t1"] - 0.06, cap["t1"])
    size = 58
    maxw = 760
    lines = wrap(c, text, "cap", size, maxw)
    while len(lines) > 2:
        size -= 4
        lines = wrap(c, text, "cap", size, maxw)
    set_font(c, "cap", size)
    lh = size * 1.22
    widths = [c.text_extents(l).x_advance for l in lines]
    bw = max(widths) + 70
    bh = lh * len(lines) + 40
    cx = 515
    bottom = 1540
    top = bottom - bh
    idx = TL["captions"].index(cap)
    rot = (-0.012 if idx % 2 else 0.01)
    pen = Pen(c, t, boil_rate=10)
    c.save()
    c.translate(cx, top + bh / 2)
    sc = 0.9 + 0.1 * kin
    c.scale(sc, sc)
    c.rotate(rot)
    c.translate(-cx, -(top + bh / 2))
    c.push_group()
    box = rrect(cx - bw / 2, top, bw, bh, 22)
    c.set_source_rgba(0, 0, 0, 0.22)
    pen._path(box + (7, 9), True)
    c.fill()
    pen.shape(box, f"capbox{idx}", fill=C["cream"], lw=4.5, off=None, wob=0.4)
    # fitas adesivas
    for sx in (-1, 1):
        tx_, ty_ = cx + sx * (bw / 2 - 26), top - 4
        c.save()
        c.translate(tx_, ty_)
        c.rotate(sx * 0.6)
        c.set_source_rgba(*alpha(C["yellow"], 0.7))
        c.rectangle(-34, -14, 68, 28)
        c.fill()
        c.restore()
    for i, line in enumerate(lines):
        y = top + 20 + lh * (i + 0.78)
        x = cx - widths[i] / 2
        set_font(c, "cap", size)
        for rx, colname in HL:
            for m in rx.finditer(line):
                x0 = x + c.text_extents(line[: m.start()]).x_advance
                ww = c.text_extents(line[m.start(): m.end()]).x_advance
                marker_swash(pen, x0 - 6, y - size * 0.78, ww + 12, size * 0.95, alpha(C[colname], 0.95),
                             f"caphl{idx}{i}{m.start()}")
        set_font(c, "cap", size)
        c.set_source_rgba(*C["ink"])
        c.move_to(x, y)
        c.show_text(line)
    c.pop_group_to_source()
    c.paint_with_alpha(kin * (1 - kout))
    c.restore()


# =================================================================== QUADRO
def compose(c, t):
    if t < tv("flip", 0):
        shot_A(c, t)
    elif t < tv("flip", 1):
        page_flip(c, t, shot_A, shot_B, tv("flip"))
    elif t < tv("cut_under"):
        shot_B(c, t)
    elif t < tv("cut_back"):
        shot_C(c, t)
    elif t < tv("s2"):
        shot_D(c, t)
    elif t < tv("s3"):
        shot_E(c, t)
    elif t < tv("flip2", 0):
        shot_F(c, t)
    elif t < tv("flip2", 1):
        page_flip(c, t, shot_F, shot_G, tv("flip2"))
    elif t < tv("s5"):
        shot_G(c, t)
    else:
        shot_H(c, t)


def frame(t):
    s, c = new_surface()
    compose(c, t)
    draw_caption(c, t)
    return s
