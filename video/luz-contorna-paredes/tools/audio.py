"""Trilha instrumental sintetizada, efeitos sonoros e mixagem com a narração.

Uso: python3 tools/audio.py
Entradas: build/narracao.wav, build/chamado.wav, build/eventos.json (de tools/render.mjs --eventos)
Saída:    build/mix.wav (48 kHz, estéreo)

Tudo é gerado por síntese (sem amostras externas). Semente fixa: o resultado é reproduzível.
"""
import json
import os

import numpy as np
import soundfile as sf
from scipy.signal import butter, fftconvolve, resample_poly, sosfilt

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B = os.path.join(ROOT, "build")
SR = 48000
DUR = 95.0
N = int(DUR * SR)
rng = np.random.default_rng(42)
t = np.arange(N) / SR


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], btype="band", fs=SR, output="sos"), x)


def lp(x, f, order=2):
    return sosfilt(butter(order, f, btype="low", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return sosfilt(butter(order, f, btype="high", fs=SR, output="sos"), x)


def env_ar(n, a, r):
    """ataque/relaxamento em amostras, sustentação no meio"""
    e = np.ones(n)
    a = max(1, int(a)); r = max(1, int(r))
    e[:a] = np.linspace(0, 1, a)
    e[-r:] = np.minimum(e[-r:], np.linspace(1, 0, r))
    return e


def smooth(a, b, x):
    u = np.clip((x - a) / (b - a), 0, 1)
    return u * u * (3 - 2 * u)


def place(buf, sig, t0, gain=1.0, pan=0.0):
    i = int(t0 * SR)
    if i >= buf.shape[0]:
        return
    n = min(sig.shape[0], buf.shape[0] - i)
    if sig.ndim == 1:
        l = np.cos((pan + 1) * np.pi / 4); r = np.sin((pan + 1) * np.pi / 4)
        buf[i:i + n, 0] += sig[:n] * gain * l * 1.414
        buf[i:i + n, 1] += sig[:n] * gain * r * 1.414
    else:
        buf[i:i + n] += sig[:n] * gain


def reverb_ir(seg=2.6, decay=2.2, seed=1):
    r = np.random.default_rng(seed)
    n = int(seg * SR)
    tt = np.arange(n) / SR
    ir = r.standard_normal((n, 2)) * np.exp(-tt * (6.9 / decay))[:, None]
    ir[:, 0] = lp(ir[:, 0], 6000); ir[:, 1] = lp(ir[:, 1], 6000)
    ir[: int(0.012 * SR)] = 0
    return ir / np.sqrt((ir ** 2).sum(0, keepdims=True))


def reverb(x, wet=0.25, decay=2.2, seed=1):
    ir = reverb_ir(decay=decay, seed=seed)
    y = np.stack([fftconvolve(x[:, c], ir[:, c])[: x.shape[0]] for c in range(2)], 1)
    return x * (1 - wet) + y * wet


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


# ---------------------------------------------------------------- música
def saw_voice(freq, n, detune=0.0, harm=24, phase=0.0):
    tt = np.arange(n) / SR
    f = freq * (1 + detune)
    y = np.zeros(n)
    for k in range(1, harm + 1):
        if f * k > 9000:
            break
        y += np.sin(2 * np.pi * f * k * tt + phase * k) / k
    return y


def pad_chord(notes, n, bright=1.0):
    out = np.zeros((n, 2))
    for i, m in enumerate(notes):
        f = midi(m)
        for c, det in enumerate((-0.0035, 0.0035)):
            v = saw_voice(f, n, det + 0.001 * i, phase=i * 0.7 + c)
            out[:, c] += v
    out /= len(notes) * 3.0
    cut = 700 + 2200 * bright
    out[:, 0] = lp(out[:, 0], cut); out[:, 1] = lp(out[:, 1], cut)
    return out


# progressão por trecho: (início, fim, notas MIDI, brilho)
PROG = [
    (0.0, 10.0, [50, 57, 62, 64, 69], 0.25),     # Dm(add9) — mistério suave
    (10.0, 16.5, [46, 53, 58, 62, 69], 0.35),    # Bbmaj7
    (16.5, 23.0, [41, 53, 57, 60, 65], 0.35),    # F
    (23.0, 29.5, [43, 55, 58, 62, 65, 69], 0.4),  # Gm9
    (29.5, 36.0, [45, 57, 62, 64, 69], 0.45),    # Asus4
    (36.0, 42.5, [50, 57, 60, 65, 69], 0.5),     # Dm7
    (42.5, 49.0, [46, 58, 62, 65, 70], 0.6),     # Bb
    (49.0, 56.0, [48, 55, 60, 64, 67, 72], 0.7),  # C
    (56.0, 63.0, [45, 57, 61, 64, 69, 73], 0.85),  # A (dominante, tensão)
    (63.0, 70.5, [46, 53, 58, 62, 67], 0.35),    # Bb(add6) — reviravolta, mais vazio
    (70.5, 78.0, [43, 50, 58, 62, 65], 0.4),     # Gm/D
    (78.0, 84.0, [45, 52, 57, 61, 64], 0.5),     # A
    (84.0, 95.0, [50, 57, 62, 66, 69, 74], 0.45),  # D maior — resolução
]


def musica():
    mus = np.zeros((N, 2))
    xf = int(1.2 * SR)
    for (a, b, notes, br) in PROG:
        i0 = max(0, int(a * SR) - xf // 2)
        i1 = min(N, int(b * SR) + xf // 2)
        n = i1 - i0
        seg = pad_chord(notes, n, br)
        seg *= env_ar(n, xf, xf)[:, None]
        mus[i0:i1] += seg
    # sub-grave na fundamental
    sub = np.zeros(N)
    for (a, b, notes, _) in PROG:
        i0, i1 = int(a * SR), min(N, int(b * SR))
        f = midi(notes[0] - 12)
        tt = np.arange(i1 - i0) / SR
        sub[i0:i1] += np.sin(2 * np.pi * f * tt) * env_ar(i1 - i0, 0.4 * SR, 0.4 * SR)
    mus += sub[:, None] * 0.18

    # pulso (dedilhado) a partir da hipótese: 8 colcheias a 100 bpm, densidade crescente
    bpm = 100
    step = 60 / bpm / 2
    pl = np.zeros((N, 2))
    k = 0
    tk = 36.0
    while tk < 78.0:
        chord = next(p for p in PROG if p[0] <= tk < p[1])[2]
        dens = 0.55 if tk < 49 else (0.95 if tk < 63 else 0.35)
        if (k % 2 == 0) or rng.random() < dens:
            m = chord[1 + (k * 3) % (len(chord) - 1)] + 12
            n = int(0.5 * SR)
            tt = np.arange(n) / SR
            f = midi(m)
            y = (np.sin(2 * np.pi * f * tt + 1.2 * np.sin(2 * np.pi * f * 2 * tt) * np.exp(-tt * 18)) * np.exp(-tt * 7.5))
            g = 0.055 * (0.6 + 0.4 * smooth(36, 60, tk)) * (0.7 if 63 <= tk < 78 else 1.0)
            place(pl, y, tk, g, pan=0.35 if k % 2 else -0.35)
        k += 1
        tk += step
    mus += pl

    # batida grave (tensão) na cena 5
    for tb in np.arange(49.0, 63.0, 60 / bpm):
        n = int(0.35 * SR)
        tt = np.arange(n) / SR
        f = 55 * np.exp(-tt * 9) + 42
        y = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 10)
        place(mus, y, tb, 0.16 * smooth(49, 54, tb))

    # nuvem alta cintilante (curiosidade) nas cenas 2–3
    sh = rng.standard_normal(N)
    sh = bp(sh, 5000, 9000) * (smooth(10, 14, t) * (1 - smooth(33, 37, t))) * 0.012
    mus[:, 0] += sh; mus[:, 1] += np.roll(sh, 300)

    # envelope global: tensão crescente, queda na reviravolta, resolução e fade nos créditos
    g = (0.55 + 0.25 * smooth(10, 23, t) + 0.2 * smooth(36, 60, t)) \
        * (1 - 0.35 * smooth(62.5, 64, t) * (1 - smooth(76, 79, t))) \
        * smooth(0.0, 1.6, t) * (1 - smooth(93.0, 95.0, t))
    mus *= g[:, None]
    mus = reverb(mus, wet=0.35, decay=3.0, seed=3)
    return mus


# ---------------------------------------------------------------- efeitos
def passo():
    n = int(0.16 * SR)
    tt = np.arange(n) / SR
    x = bp(rng.standard_normal(n), 180, 2600) * np.exp(-tt * 38)
    thump = np.sin(2 * np.pi * (90 * np.exp(-tt * 20) + 60) * tt) * np.exp(-tt * 30)
    return (x * 0.6 + thump * 0.5)


def whoosh(dur=0.9, lo=300, hi=3500, peak=0.55):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    x = rng.standard_normal(n)
    out = np.zeros(n)
    nb = 24
    for i in range(nb):
        a, b = i * n // nb, (i + 1) * n // nb
        u = (i + 0.5) / nb
        fc = lo * (hi / lo) ** (np.sin(np.pi * u) ** 1.5)
        seg = bp(x[max(0, a - 2000):b], fc * 0.6, min(fc * 1.6, SR / 2 - 100))[-(b - a):]
        out[a:b] = seg
    e = np.exp(-((tt / dur - peak) ** 2) / 0.045)
    return out * e


def tick(f=1800):
    n = int(0.05 * SR)
    tt = np.arange(n) / SR
    return np.sin(2 * np.pi * f * tt) * np.exp(-tt * 140) + bp(rng.standard_normal(n), 2000, 6000) * np.exp(-tt * 300) * 0.3


def blip(f0=880, f1=1320, dur=0.22):
    n = int(dur * SR)
    tt = np.arange(n) / SR
    f = f0 + (f1 - f0) * np.clip(tt / (dur * 0.5), 0, 1)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 14) * env_ar(n, 0.004 * SR, 0.02 * SR)


def chime(notes=(76, 83), gap=0.09):
    out = np.zeros(int(1.2 * SR))
    for i, m in enumerate(notes):
        n = int(1.0 * SR)
        tt = np.arange(n) / SR
        f = midi(m)
        y = (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * f * 2.01 * tt)) * np.exp(-tt * 4.5)
        a = int(i * gap * SR)
        out[a:a + n] += y[: len(out) - a]
    return out


def ambiente():
    """ruído de cidade ao fundo, mais baixo nas vistas esquemáticas"""
    x = rng.standard_normal((N, 2))
    x[:, 0] = lp(x[:, 0], 700, 3); x[:, 1] = lp(x[:, 1], 700, 3)
    x /= np.abs(x).max()
    esquema = smooth(10.3, 11.9, t) * (1 - smooth(23.0, 24.3, t)) + ((t >= 78.0) & (t < 84.6)) * 1.0
    g = 0.05 * (1 - 0.8 * esquema) * smooth(0, 1.0, t) * (1 - smooth(90, 93, t))
    out = x * g[:, None]
    # carros passando ao longe
    for tc in (2.0, 27.5, 46.0, 57.0, 66.0, 86.0):
        d = 3.5
        n = int(d * SR)
        tt = np.arange(n) / SR
        y = lp(rng.standard_normal(n), 900, 2) * np.exp(-((tt - d / 2) ** 2) / 0.5)
        place(out, y, tc - d / 2, 0.06, pan=float(np.sin(tc)))
    return out


def main():
    ev = json.load(open(os.path.join(B, "eventos.json")))
    narr, sr = sf.read(os.path.join(B, "narracao.wav"), dtype="float64")
    narr = resample_poly(narr, SR // 8000, sr // 8000)
    narr = np.pad(narr, (0, max(0, N - narr.size)))[:N]
    cham, sr2 = sf.read(os.path.join(B, "chamado.wav"), dtype="float64")
    cham = resample_poly(cham, SR // 8000, sr2 // 8000)

    fx = np.zeros((N, 2))
    # passos (último é o de parada)
    for i, tp in enumerate(ev["passos"] + [3.12]):
        place(fx, passo(), tp, 0.16 * (0.85 + 0.3 * rng.random()), pan=-0.15 if i % 2 else 0.15)
    # chamado vindo de trás do muro: levemente abafado, com ambiência
    c = lp(hp(cham, 160), 3800)
    c2 = np.zeros((c.size + SR, 2)); c2[: c.size] = c[:, None]
    c2 = reverb(c2, wet=0.45, decay=1.4, seed=7)
    place(fx, c2, ev["chamado"]["t0"], 0.42, pan=0.0)
    # transições
    for tt0 in ev["transicoes"]:
        place(fx, np.stack([whoosh(), whoosh()], 1), tt0 - 0.45, 0.11)
    for tt0 in ev["cortes"]:
        place(fx, whoosh(0.5, 400, 2500, 0.6), tt0 - 0.3, 0.045)
    # painel
    place(fx, blip(660, 990), ev["painelEntra"], 0.09)
    for tt0 in ev["trocas"]:
        place(fx, tick(2200), tt0, 0.12)
        place(fx, blip(740, 1480, 0.3), tt0 + 0.05, 0.08)
    place(fx, chime((79, 86)), ev["pilula"] + 0.15, 0.05)
    # cliques do controle fictício
    for k in range(7):
        place(fx, tick(3200), 37.7 + k * 0.11, 0.07)
    # aparecimento da tela ilustrativa e da fórmula
    place(fx, blip(520, 780, 0.25), 66.85, 0.07)
    place(fx, blip(880, 1170, 0.2), 70.45, 0.05)
    # créditos: acorde final suave já está na música; um "chime" discreto
    place(fx, chime((74, 81, 86), 0.12), 90.2, 0.05)
    fx = reverb(fx, wet=0.15, decay=1.2, seed=9)

    mus = musica()
    amb = ambiente()

    # ducking: a música abaixa quando há voz
    # envelope da fala: ataque rápido (~20 ms), relaxamento lento (~450 ms)
    fala = (lp(np.abs(narr), 20, 1) > 0.004).astype(float)
    env = np.zeros(N)
    at, rl = 1 - np.exp(-1 / (0.02 * SR)), 1 - np.exp(-1 / (0.45 * SR))
    acc = 0.0
    for i0 in range(0, N, 480):  # passos de 10 ms
        alvo = fala[i0:i0 + 480].max()
        k = at if alvo > acc else rl
        acc += (alvo - acc) * (1 - (1 - k) ** 480)
        env[i0:i0 + 480] = acc
    env = lp(env, 8, 1)
    duck = 1 - 0.72 * np.clip(env, 0, 1)
    mus *= duck[:, None]

    voz = np.stack([narr, narr], 1)
    mix = voz * 1.0 + mus * 0.46 + fx * 1.0 + amb * 1.0
    mix = np.stack([hp(mix[:, 0], 30), hp(mix[:, 1], 30)], 1)
    pk = np.abs(mix).max()
    mix *= 0.9 / pk
    sf.write(os.path.join(B, "mix.wav"), mix.astype(np.float32), SR)
    # também separados, com o mesmo ganho da mixagem (para revisão)
    k = 0.9 / pk
    for nome, x in (("stem_voz", voz), ("stem_musica", mus * 0.46), ("stem_fx", fx), ("stem_amb", amb)):
        sf.write(os.path.join(B, nome + ".wav"), (x * k).astype(np.float32), SR)
    print("ok", mix.shape, "pico", pk)


if __name__ == "__main__":
    main()
