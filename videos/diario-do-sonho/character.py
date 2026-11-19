"""O narrador (adolescente de moletom amarelo e fones grandes) e os bonecos-
rabisco que ele desenha no diário. Mesmo desenho em todos os planos: tudo
sai destas funções, só a pose muda."""
import math

import cairo
import numpy as np

from draw import (C, TAU, Pen, alpha, bez, catmull, densify, ellipse, rrect, seg, superellipse, transform, hexc)

POSE = dict(
    tilt=0.0, lean=0.0, look=(0.0, 0.0), blink=0.0, brow_raise=0.0, brow_angle=0.0,
    mouth_open=0.0, smile=0.35, mouth_o=0.0, cup_lift=0.0, eye_wide=0.0,
    hand_l=(-150.0, 318.0), hand_r=(150.0, 318.0), hold_l=None, hold_r=None,
    front_l=False, front_r=False, phone_screen=None, phone_rot=0.0, blush=1.0,
    torso=True, arms=True, torso_bottom=380.0, legs=False,
)

HEAD_C = (0.0, -172.0)
SHOULDER = {"l": (-140.0, 52.0), "r": (140.0, 52.0)}
L_UP, L_LO = 150.0, 145.0


def ik(sh, target, side):
    sx, sy = sh
    tx, ty = target
    dx, dy = tx - sx, ty - sy
    d = math.hypot(dx, dy)
    d = min(max(d, 30.0), L_UP + L_LO - 2)
    a = math.atan2(dy, dx)
    cosb = (L_UP ** 2 + d ** 2 - L_LO ** 2) / (2 * L_UP * d)
    b = math.acos(max(-1, min(1, cosb)))
    sols = [(sx + L_UP * math.cos(a + s * b), sy + L_UP * math.sin(a + s * b)) for s in (1, -1)]
    # cotovelo para fora do corpo / para baixo
    if side == "l":
        return min(sols, key=lambda e: e[0] - 0.4 * e[1])
    return max(sols, key=lambda e: e[0] + 0.4 * e[1])


def _hand(pen, x, y, ang, key, hold=None, screen=None, phone_rot=0.0, anchors=None, side="r"):
    c = pen.c
    c.save()
    c.translate(x, y)
    c.rotate(ang)
    # objeto atrás dos dedos
    if hold == "phone":
        c.save()
        c.rotate(-ang + phone_rot)
        pen.shape(rrect(-42, -86, 84, 150, 16), key + "ph", fill=C["phone"], lw=5)
        scr = screen or "idle"
        pen.fill(rrect(-33, -74, 66, 118, 9), C["blue_l"] if scr != "dark" else C["navy_l"], key + "phs", off=None, wob=0.4)
        if scr in ("play", "pause"):
            c.set_source_rgba(*C["ink"])
            if scr == "play":
                c.move_to(-10, -30)
                c.line_to(16, -15)
                c.line_to(-10, 0)
                c.close_path()
                c.fill()
            else:
                c.rectangle(-12, -30, 8, 30)
                c.rectangle(4, -30, 8, 30)
                c.fill()
        if anchors is not None:
            anchors["phone_" + side] = c.user_to_device(0, 64)
            anchors["phone_top_" + side] = c.user_to_device(0, -86)
        c.restore()
    elif hold in ("pen", "marker"):
        col = C["blue_d"] if hold == "marker" else hexc("#2d3a8c")
        wdt = 24 if hold == "marker" else 12
        pen.tube([(-10, 22), (40, -84)], key + "pn", wdt, col, lw=4)
        pen.tube([(40, -84), (48, -100)], key + "pn2", wdt * 0.8, C["ink"] if hold == "pen" else C["blue_l"], lw=3)
        tipc = C["ink"] if hold == "pen" else C["blue"]
        pen.shape([(-10 - wdt * 0.45, 20), (-10 + wdt * 0.45, 26), (-19, 41)], key + "tp", fill=tipc, lw=3.5)
        if anchors is not None:
            anchors["tip_" + side] = c.user_to_device(-19, 41)
    # mão
    pen.shape(ellipse(0, 0, 31, 28, n=40), key + "h", fill=C["skin"], lw=5)
    pen.shape(ellipse(-20, -12, 11, 16, rot=-0.6, n=24), key + "th", fill=C["skin"], lw=4.5)
    pen.stroke(bez((8, -20), (16, -10), (16, 6), (8, 16)), key + "fg", lw=3.5)
    c.restore()


def _arm(pen, side, target, pose, key, anchors):
    sh = SHOULDER[side]
    el = ik(sh, target, side)
    tx, ty = target
    fx, fy = tx - el[0], ty - el[1]
    fl = math.hypot(fx, fy) or 1
    wrist = (tx - fx / fl * 26, ty - fy / fl * 26)
    pts = catmull([sh, el, wrist], step=6)
    pen.tube(pts, key + "sl", 66, C["yellow"], lw=5)
    cuff0 = (wrist[0] - fx / fl * 16, wrist[1] - fy / fl * 16)
    pen.tube([cuff0, wrist], key + "cf", 70, C["yellow_d"], lw=5)
    ang = math.atan2(fy, fx) - math.pi / 2
    hold = pose["hold_" + side]
    _hand(pen, tx, ty, ang, key + "hd", hold, pose.get("phone_screen"), pose.get("phone_rot", 0.0), anchors, side)


def _head(pen, pose, key, anchors):
    c = pen.c
    p = pose
    lift = p["cup_lift"]
    # orelha esquerda aparece quando o fone levanta
    if lift > 0.05:
        pen.shape(ellipse(-112, 6, 20, 30, n=40), key + "ear", fill=C["skin"], lw=4.5)
        pen.stroke(bez((-114, -8), (-124, 0), (-122, 16), (-112, 20)), key + "ear2", lw=3)
    # rosto
    face = superellipse(0, 0, 112, 124, p=2.45, n=140, squash_low=0.14)
    pen.shape(face, key + "face", fill=C["skin"], lw=5.5)
    # bochechas
    if p["blush"] > 0 and pen.silhouette is None:
        for sx in (-1, 1):
            pen.fill(ellipse(sx * 70, 44, 20, 11, n=24), alpha(C["pink"], 0.55 * p["blush"]), key + f"bl{sx}", off=None)
    # cabelo
    hair = [(116, -40), (126, -82), (120, -122), (104, -148), (122, -176), (74, -168), (70, -214), (34, -180),
            (6, -226), (-22, -186), (-62, -214), (-70, -170), (-110, -170), (-112, -136), (-128, -106), (-130, -72), (-118, -40),
            (-100, -62), (-78, -46), (-56, -74), (-30, -52), (-4, -80), (22, -56), (50, -78), (76, -52),
            (98, -72)]
    pen.shape(catmull(hair, closed=True, step=6), key + "hair", fill=C["hair"], lw=5)
    pen.stroke(bez((-40, -120), (-20, -140), (10, -140), (30, -128)), key + "hairl", color=alpha(C["cream"], 0.5), lw=4)
    if pen.silhouette is None:
        # sobrancelhas grossas
        for sx, nm in ((-1, "l"), (1, "r")):
            rot = -sx * p["brow_angle"]
            pts = np.array([(-30, 4), (0, -4), (30, 3)], float)
            pts = transform(pts, rot=rot * sx) + (sx * 47, -36 - p["brow_raise"])
            pen.stroke(catmull(pts, step=4), key + "br" + nm, lw=17, wob=0.5)
        # olhos simples
        lx, ly = p["look"]
        ew = 1 + 0.3 * p["eye_wide"]
        for sx in (-1, 1):
            ex, ey = sx * 45 + lx * 9, 6 + ly * 7
            if p["blink"] > 0.75:
                pen.stroke(bez((ex - 12, ey), (ex - 4, ey + 6), (ex + 4, ey + 6), (ex + 12, ey)), key + f"bk{sx}", lw=4.5)
            else:
                ry = 15 * ew * (1 - p["blink"])
                pen.fill(ellipse(ex, ey, 11 * ew, max(ry, 2), n=30), C["ink"], key + f"ey{sx}", off=None, wob=0.3)
                pen.dot(ex + 4, ey - ry * 0.45, 3.2, C["white"])
        # nariz
        pen.stroke(bez((-4, 26), (8, 34), (6, 44), (-6, 44)), key + "nose", lw=4)
        # boca
        mo, op, sm = p["mouth_o"], p["mouth_open"], p["smile"]
        if mo > 0.3:
            pen.shape(ellipse(0, 72, 12 + 4 * mo, 15 + 6 * mo, n=30), key + "mo", fill=hexc("#5b1f2a"), lw=4)
        elif op > 0.08:
            h = 8 + 30 * min(op, 1.1)
            wdt = 26 + 8 * min(op, 1)
            top = 66 - 6 * sm
            mouth = np.vstack([bez((-wdt, top), (-wdt * 0.4, top + 4 * sm), (wdt * 0.4, top + 4 * sm), (wdt, top), n=14),
                               bez((wdt, top), (wdt * 0.7, top + h), (-wdt * 0.7, top + h), (-wdt, top), n=14)])
            pen.fill(mouth, hexc("#5b1f2a"), key + "mf", off=None, wob=0.3)
            if h > 18:
                pen.fill(ellipse(0, top + h * 0.72, wdt * 0.5, h * 0.22, n=20), hexc("#ff8ea6"), key + "tg", off=None, wob=0.2)
            pen.stroke(mouth, key + "ms", lw=4.5, closed=True, wob=0.3)
        else:
            y0 = 68
            pen.stroke(bez((-24, y0 - 2 * sm), (-10, y0 + 12 * sm), (10, y0 + 12 * sm), (24, y0 - 2 * sm)), key + "mc", lw=5)
    # fones: arco + conchas
    band = bez((-114, -40), (-150, -235), (150, -235), (114, -40), n=50)
    pen.tube(band, key + "band", 20, C["phone"], lw=4.5)
    pen.stroke(band[8:-8] + (0, 4), key + "bandhl", color=alpha(C["pink"], 0.9), lw=4)
    for side, sx in (("l", -1), ("r", 1)):
        c.save()
        pivot = (sx * 114, -40)
        c.translate(*pivot)
        if side == "l":
            c.rotate(lift * 1.15)
        cx = sx * 12
        pen.shape(rrect(cx - 34, 2, 68, 112, 30), key + "cup" + side, fill=C["phone"], lw=5)
        pen.fill(rrect(cx - 34 + (24 if sx < 0 else 6), 14, 10, 88, 5), C["pink"], key + "cush" + side, off=None)
        pen.stroke(bez((cx - 8 * sx, 26), (cx - 2 * sx, 20), (cx + 8 * sx, 22), (cx + 14 * sx, 30)), key + "hl" + side,
                   color=alpha(C["white"], 0.6), lw=4)
        if anchors is not None:
            anchors["cup_" + side] = c.user_to_device(cx, 112)
            anchors["cupc_" + side] = c.user_to_device(cx, 58)
        c.restore()


def draw_kid(pen: Pen, x, y, s=1.0, pose=None, key="kid", anchors=None):
    """Desenha o narrador. (x, y) = base do pescoço. Devolve âncoras em
    coordenadas de tela (fones, mãos, celular...)."""
    p = dict(POSE)
    if pose:
        p.update(pose)
    anchors = {} if anchors is None else anchors
    c = pen.c
    c.save()
    c.translate(x, y)
    c.scale(s, s)
    c.rotate(p["lean"])
    if p["legs"]:
        # calça jeans (sai pela borda de baixo do quadro)
        for sx in (-1, 1):
            leg = [(sx * 8, 330), (sx * 156, 330), (sx * 168, 1300), (sx * 22, 1300)]
            pen.shape(densify(np.array(leg), 10, closed=True), key + f"leg{sx}", fill=hexc("#5b7fc4"), lw=5.5)
            pen.stroke(seg(sx * 120, 420, sx * 126, 1300, 10), key + f"seam{sx}", color=alpha(C["ink"], 0.35), lw=3)
    if p["torso"]:
        # capuz atrás do pescoço
        pen.shape(ellipse(0, -6, 104, 46, n=60), key + "hoodb", fill=C["yellow_d"], lw=5)
        # pescoço
        pen.shape(rrect(-30, -80, 60, 92, 14), key + "neck", fill=C["skin"], lw=5)
        # tronco
        tb = p["torso_bottom"]
        torso = [(-60, -2), (-128, 16), (-158, 60), (-170, 170), (-176 - 0.02 * (tb - 380), tb), (176 + 0.02 * (tb - 380), tb),
                 (170, 170), (158, 60), (128, 16), (60, -2)]
        pen.shape(catmull(torso, closed=True, step=7), key + "torso", fill=C["yellow"], lw=5.5)
        if p["legs"]:
            pen.shape(rrect(-176, tb - 34, 352, 36, 12), key + "hem", fill=C["yellow_d"], lw=5)
        # gola do capuz
        collar = np.vstack([bez((-80, -8), (-60, 40), (60, 40), (80, -8), n=24),
                            bez((62, -4), (40, 20), (-40, 20), (-62, -4), n=20)])
        pen.shape(collar, key + "collar", fill=C["yellow_d"], lw=5)
        for sx in (-1, 1):
            pen.stroke(bez((sx * 24, 22), (sx * 30, 60), (sx * 26, 90), (sx * 32, 122)), key + f"str{sx}", lw=4.5)
            pen.shape(rrect(sx * 32 - 6, 118, 12, 20, 4), key + f"agl{sx}", fill=C["white"], lw=3.5)
        pocket = catmull([(-104, 236), (104, 236), (128, 352), (-128, 352)], closed=True, step=8)
        pen.stroke(pocket, key + "pocket", lw=4.5, closed=True)
        pen.stroke(seg(-60, 250, -84, 340), key + "pk1", lw=3.5)
        pen.stroke(seg(60, 250, 84, 340), key + "pk2", lw=3.5)
    if p["arms"]:
        for side in ("l", "r"):
            if not p["front_" + side]:
                _arm(pen, side, p["hand_" + side], p, key + side, anchors)
    # cabeça
    c.save()
    c.translate(0, -60)
    c.rotate(p["tilt"])
    c.translate(HEAD_C[0], HEAD_C[1] + 60)
    _head(pen, p, key, anchors)
    anchors["head"] = c.user_to_device(0, 0)
    c.restore()
    if p["arms"]:
        for side in ("l", "r"):
            if p["front_" + side]:
                _arm(pen, side, p["hand_" + side], p, key + side, anchors)
    c.restore()
    return anchors


def draw_head_only(pen, x, y, s, rot, pose=None, key="kidh", anchors=None):
    p = dict(POSE)
    if pose:
        p.update(pose)
    anchors = {} if anchors is None else anchors
    c = pen.c
    c.save()
    c.translate(x, y)
    c.rotate(rot)
    c.scale(s, s)
    _head(pen, p, key, anchors)
    c.restore()
    return anchors


def sleeve(pen, a, b, w0, w1, key, folds=3):
    """Antebraço de moletom em close: afunila do cotovelo ao punho, com dobras."""
    a, b = np.array(a, float), np.array(b, float)
    d = b - a
    L = float(np.linalg.norm(d)) or 1.0
    u = d / L
    n = np.array([-u[1], u[0]])
    poly = densify(np.array([a + n * w0 / 2, b + n * w1 / 2, b - n * w1 / 2, a - n * w0 / 2]), 10, closed=True)
    pen.shape(poly, key, fill=C["yellow"], lw=5.5)
    for i in range(folds):
        f = 0.16 + 0.13 * i
        p = a + d * f * min(1.0, 900 / L)
        w = w0 + (w1 - w0) * f
        side = 1 if i % 2 else -1
        p0 = p + n * side * w / 2 * 0.98
        p1 = p + n * side * w * 0.12 + u * 26
        pen.stroke(bez(tuple(p0), tuple(p0 + u * 4 - n * side * 10), tuple(p1 - u * 10), tuple(p1)), key + f"fd{i}", lw=4.5)


def draw_big_hand(pen, tip, ang=0.25, s=2.0, hold="pen", key="bighand", sleeve_from=(1180, 2050)):
    """Mão em close (moletom amarelo) segurando caneta/marca-texto; a ponta
    fica exatamente em `tip`."""
    c = pen.c
    # posição da mão a partir da ponta (geometria do _hand)
    ca, sa = math.cos(ang), math.sin(ang)
    lx, ly = -19 * s, 41 * s
    hx = tip[0] - (lx * ca - ly * sa)
    hy = tip[1] - (lx * sa + ly * ca)
    # manga
    sf = np.array(sleeve_from, float)
    cuff_a = np.array((hx + 20 * s, hy + 30 * s))
    d = sf - cuff_a
    d = d / (np.linalg.norm(d) or 1)
    sleeve(pen, cuff_a + d * 20 * s, sf, 70 * s, 118 * s, key + "slv")
    pen.tube([tuple(cuff_a), tuple(cuff_a + d * 26 * s)], key + "cuf", 70 * s, C["yellow_d"], lw=5.5)
    c.save()
    c.translate(hx, hy)
    c.scale(s, s)
    _hand(pen, 0, 0, ang, key, hold=hold)
    c.restore()
    return (hx, hy)


# ------------------------------------------------------------- bonecos-rabisco
def draw_doodle(pen, x, y, s=1.0, mood="sleep", phones=True, look=(0, 0), key="dd", arm_up=0.0,
                body_col=None, tilt=0.0, mouth=0.0):
    """Boneco-rabisco simples (o narrador redesenhando a cena do filme)."""
    c = pen.c
    ink = C["cream"] if pen.dark else C["ink"]
    c.save()
    c.translate(x, y)
    c.scale(s, s)
    # corpo (paletó genérico) e pernas
    body = catmull([(-36, 42), (36, 42), (44, 148), (-44, 148)], closed=True, step=6)
    body = np.vstack([seg(-36, 42, 36, 42, 6), seg(36, 42, 46, 150, 6), seg(46, 150, -46, 150, 6), seg(-46, 150, -36, 42, 6)])
    pen.shape(body, key + "b", fill=body_col or C["blue"], stroke=ink, lw=4.5)
    pen.stroke(seg(-24, 150, -28, 228), key + "lg1", color=ink, lw=5)
    pen.stroke(seg(24, 150, 28, 228), key + "lg2", color=ink, lw=5)
    pen.stroke(seg(-38, 228, -14, 228), key + "ft1", color=ink, lw=6)
    pen.stroke(seg(16, 228, 42, 228), key + "ft2", color=ink, lw=6)
    pen.stroke(catmull([(-38, 54), (-62, 100 - arm_up * 90), (-66, 146 - arm_up * 170)], step=5), key + "a1", color=ink, lw=5)
    pen.stroke(catmull([(38, 54), (60, 100), (58, 146)], step=5), key + "a2", color=ink, lw=5)
    pen.stroke(catmull([(-10, 44), (0, 70), (10, 44)], step=4), key + "tie", color=ink, lw=3.5)
    # cabeça
    c.save()
    c.translate(0, 0)
    c.rotate(tilt)
    pen.shape(ellipse(0, 0, 42, 44, n=50), key + "h", fill=C["skin"], stroke=ink, lw=4.5)
    pen.shape(catmull([(-40, -8), (-30, -36), (0, -48), (30, -38), (42, -6), (20, -24), (-14, -22)], closed=True, step=5),
              key + "hr", fill=hexc("#6b4a3a"), stroke=ink, lw=4)
    if mood == "sleep":
        for sx in (-1, 1):
            pen.stroke(bez((sx * 16 - 8, 6), (sx * 16 - 3, 11), (sx * 16 + 3, 11), (sx * 16 + 8, 6)), key + f"e{sx}", color=C["ink"], lw=3.5)
        pen.stroke(bez((-6, 26), (-2, 28), (2, 28), (6, 26)), key + "m", color=C["ink"], lw=3)
    else:
        for sx in (-1, 1):
            pen.dot(sx * 15 + look[0] * 4, 4 + look[1] * 4, 5.5 if mood == "wow" else 4.5, C["ink"])
        if mood == "wow" or mouth > 0.2:
            pen.shape(ellipse(0, 25, 7, 9, n=20), key + "mo", fill=hexc("#5b1f2a"), stroke=C["ink"], lw=3)
        else:
            pen.stroke(bez((-8, 24), (-3, 29), (3, 29), (8, 24)), key + "m", color=C["ink"], lw=3)
    if phones:
        pen.tube(bez((-40, 0), (-50, -66), (50, -66), (40, 0), n=24), key + "ph", 8, C["phone"], lw=3)
        for sx in (-1, 1):
            pen.shape(rrect(sx * 44 - 11, -12, 22, 34, 9), key + f"cp{sx}", fill=C["phone"], stroke=ink, lw=3.5)
    c.restore()
    c.restore()
