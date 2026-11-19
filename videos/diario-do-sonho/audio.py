"""Áudio do vídeo: sinal de despertar original, tons puros, trilha lo-fi
original, efeitos sonoros sintetizados e mixagem final.

Desaceleração = reamostragem de verdade (como tocar a gravação a 0,5x sem
correção de tom): o som dura o dobro e cai uma oitava.
"""
import json
import os
import subprocess
import wave

import numpy as np
from scipy.signal import resample_poly, butter, sosfilt

import timeline

SR = 48000
RNG = np.random.default_rng(7)


# ------------------------------------------------------------------ utilidades
def read_wav(path):
    with wave.open(path) as w:
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float64) / 32768
        assert w.getframerate() == SR
        if w.getnchannels() == 2:
            x = x.reshape(-1, 2).mean(1)
    return x


def write_wav(path, x):
    x = np.clip(x, -1, 1)
    data = (x * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(2 if x.ndim == 2 else 1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data.tobytes())


def env_adsr(n, a, d, s, r, gate):
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-6),
                 np.where(t < a + d, 1 - (1 - s) * (t - a) / max(d, 1e-6), s))
    rel = np.clip((t - gate) / max(r, 1e-6), 0, 1)
    return e * np.where(t > gate, (1 - rel) ** 2, 1)


def lp(x, fc, order=2):
    return sosfilt(butter(order, fc, "low", fs=SR, output="sos"), x)


def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, "high", fs=SR, output="sos"), x)


def bp(x, f1, f2, order=2):
    return sosfilt(butter(order, [f1, f2], "band", fs=SR, output="sos"), x)


def add(dst, src, t, g=1.0):
    i = int(round(t * SR))
    if i < 0:
        src, i = src[-i:], 0
    j = min(len(dst), i + len(src))
    if j > i:
        dst[i:j] += g * src[: j - i]


# ------------------------------------------------------- sinal de despertar
def motif_note(freq, gate=0.17, length=1.2):
    """Nota metálica/brassy: harmônicos que perdem brilho com o tempo.
    Desacelerada, vira uma 'buzina' grave."""
    n = int(length * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, 13):
        amp = 1.0 / k ** 1.05
        decay = 2.2 + 1.1 * k
        att = 0.006 + 0.004 * k
        e = np.minimum(t / att, 1) * np.exp(-decay * np.maximum(t - att, 0))
        for det in (-0.0025, 0.0025):
            out += 0.5 * amp * e * np.sin(2 * np.pi * freq * k * (1 + det) * t + k)
    gate_env = np.where(t < gate, 1.0, np.exp(-(t - gate) * 9))
    return out * gate_env


def make_motif():
    notes = [440.0, 659.255, 554.365]  # lá4, mi5, dó#5 — melodia original
    m = np.zeros(int(1.6 * SR))
    for on, f in zip(timeline.MOTIF_ONSETS, notes):
        add(m, motif_note(f), on)
    m = m / np.abs(m).max() * 0.55
    fade = np.linspace(1, 0, int(0.05 * SR))
    m[-len(fade):] *= fade
    return m


def slowed(x, speed):
    """Toca x mais devagar sem correção de tom (reamostragem)."""
    up = int(round(1 / speed))
    return resample_poly(x, up, 1)


# ---------------------------------------------------------------- tons puros
def pure_tone(freq, dur, amp=0.30):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = amp * np.sin(2 * np.pi * freq * t)
    f = int(0.015 * SR)
    ramp = 0.5 - 0.5 * np.cos(np.linspace(0, np.pi, f))
    x[:f] *= ramp
    x[-f:] *= ramp[::-1]
    return x


# ------------------------------------------------------- trilha lo-fi original
def ks_pluck(freq, dur, bright=0.5):
    n = int(dur * SR)
    p = max(2, int(SR / freq))
    buf = RNG.uniform(-1, 1, p)
    buf = lp(buf, 1500 + 4000 * bright, 1) if p > 16 else buf
    out = np.zeros(n)
    for i in range(n):
        out[i] = buf[i % p]
        buf[i % p] = 0.5 * (buf[i % p] + buf[(i + 1) % p]) * 0.996
    return out


def make_bg():
    bpm = 80
    beat = 60 / bpm
    bar = 4 * beat
    nbars = 8
    n = int(nbars * bar * SR) + SR
    mix = np.zeros(n)
    # progressão original em lá maior: A(add9) - F#m7 - Dmaj7 - E6
    chords = [[57, 64, 69, 71, 73], [54, 61, 64, 68, 69], [50, 57, 62, 66, 69], [52, 59, 64, 66, 68]]
    mid = lambda m: 440 * 2 ** ((m - 69) / 12)
    plucks = {}
    for b in range(nbars):
        ch = chords[b % 4]
        t0 = b * bar
        # pad suave (senoides com leve desafinação)
        pad_n = int(bar * 1.15 * SR)
        tt = np.arange(pad_n) / SR
        pe = env_adsr(pad_n, 0.6, 0.5, 0.8, 0.5, bar)
        pad = np.zeros(pad_n)
        for m_ in ch[:4]:
            f = mid(m_)
            for det in (-0.003, 0.004):
                pad += np.sin(2 * np.pi * f * (1 + det) * tt) + 0.25 * np.sin(4 * np.pi * f * (1 + det) * tt)
        add(mix, 0.035 * pad * pe, t0)
        # baixo
        bass_n = int(bar * SR)
        tb = np.arange(bass_n) / SR
        bf = mid(ch[0] - 12)
        be = env_adsr(bass_n, 0.02, 0.4, 0.5, 0.2, bar * 0.9)
        add(mix, 0.16 * (np.sin(2 * np.pi * bf * tb) + 0.2 * np.sin(4 * np.pi * bf * tb)) * be, t0)
        # arpejo em colcheias
        pattern = [0, 2, 3, 4, 3, 2, 1, 2]
        for i, pi in enumerate(pattern):
            m_ = ch[pi] + 12
            key = m_
            if key not in plucks:
                plucks[key] = ks_pluck(mid(m_), 1.2, 0.35)
            sw = 0.03 if i % 2 else 0.0  # swing leve
            add(mix, 0.10 * (0.8 if i % 2 else 1.0) * plucks[key], t0 + i * beat / 2 + sw)
        # bateria discreta
        for k in (0, 2):
            kn = int(0.35 * SR)
            tk = np.arange(kn) / SR
            kick = np.sin(2 * np.pi * (48 + 70 * np.exp(-tk * 30)) * tk) * np.exp(-tk * 9)
            add(mix, 0.32 * kick, t0 + k * beat)
        for k in range(8):
            hn = int(0.06 * SR)
            hat = hp(RNG.normal(0, 1, hn), 6000) * np.exp(-np.arange(hn) / SR * 70)
            add(mix, (0.035 if k % 2 else 0.02) * hat, t0 + k * beat / 2 + (0.03 if k % 2 else 0))
        sn = int(0.25 * SR)
        snare = bp(RNG.normal(0, 1, sn), 900, 5000) * np.exp(-np.arange(sn) / SR * 18)
        add(mix, 0.05 * snare, t0 + beat)
        add(mix, 0.05 * snare, t0 + 3 * beat)
    # chiado de vinil
    crackle = np.zeros(n)
    idx = RNG.integers(0, n, int(nbars * bar * 6))
    crackle[idx] = RNG.uniform(-1, 1, len(idx))
    mix += 0.03 * lp(crackle, 3000)
    mix += 0.002 * lp(RNG.normal(0, 1, n), 2500)
    loop = mix[: int(nbars * bar * SR)]
    # emenda sem clique: o rabo da última barra soma no início
    tail = mix[int(nbars * bar * SR):]
    loop[: len(tail)] += tail
    return loop


def tile(x, n):
    reps = int(np.ceil(n / len(x))) + 1
    return np.tile(x, reps)[:n]


# ----------------------------------------------------------------- efeitos
def sfx(name, dur=None):
    def noise(sec):
        return RNG.normal(0, 1, int(sec * SR))

    def t_(sec):
        return np.arange(int(sec * SR)) / SR

    if name == "pen":
        d = dur or 1.2
        x = bp(noise(d), 2500, 7000)
        t = t_(d)
        strokes = 0.5 + 0.5 * np.sin(2 * np.pi * 5.5 * t + 3 * np.sin(2 * np.pi * 1.3 * t))
        return 0.05 * x * strokes ** 2 * np.minimum(1, (d - t) * 6)
    if name == "scribble":
        d = dur or 0.6
        x = bp(noise(d), 1800, 6000)
        t = t_(d)
        return 0.08 * x * (0.5 + 0.5 * np.sin(2 * np.pi * 9 * t)) ** 2 * np.minimum(1, (d - t) * 8)
    if name == "marker":
        d = dur or 1.2
        t = t_(d)
        x = bp(noise(d), 900, 3500) + 0.25 * np.sin(2 * np.pi * (1200 + 200 * np.sin(2 * np.pi * 3 * t)) * t)
        strokes = (0.5 + 0.5 * np.sin(2 * np.pi * 3.2 * t)) ** 1.5
        return 0.045 * x * strokes * np.minimum(1, (d - t) * 6) * np.minimum(1, t * 20)
    if name == "flip":
        d = 0.55
        t = t_(d)
        x = noise(d)
        out = np.zeros_like(x)
        # varredura de passa-baixa: folha virando
        for a, b, fc in [(0, 0.2, 1200), (0.15, 0.4, 3500), (0.35, 0.55, 1800)]:
            seg = (t >= a) & (t < b)
            out[seg] += lp(x, fc)[seg]
        return 0.22 * out * np.sin(np.pi * t / d) ** 0.7
    if name == "whoosh":
        d = 0.32
        t = t_(d)
        x = bp(noise(d), 400, 3000)
        return 0.16 * x * np.sin(np.pi * t / d) ** 2
    if name == "zip":
        d = 0.5
        t = t_(d)
        f = 300 + 1600 * (t / d) ** 2
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.3 + 0.7 * bp(noise(d), 800, 4000)
        return 0.10 * x * np.sin(np.pi * t / d) ** 2
    if name == "pop":
        d = 0.18
        t = t_(d)
        f = 900 * np.exp(-t * 18) + 250
        return 0.22 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 22)
    if name == "tap":
        d = 0.08
        t = t_(d)
        return 0.25 * (np.sin(2 * np.pi * 2200 * t) * np.exp(-t * 90) + 0.6 * hp(noise(d), 3000) * np.exp(-t * 160))
    if name == "thump":
        d = 0.4
        t = t_(d)
        return 0.5 * (np.sin(2 * np.pi * (70 + 60 * np.exp(-t * 25)) * t) * np.exp(-t * 14)
                      + 0.3 * lp(noise(d), 900) * np.exp(-t * 30))
    if name == "bubbles":
        d = dur or 1.2
        out = np.zeros(int(d * SR))
        for k in range(16):
            st = RNG.uniform(0, d - 0.12)
            bn = int(0.08 * SR)
            tb = np.arange(bn) / SR
            f0 = RNG.uniform(500, 1300)
            b = np.sin(2 * np.pi * np.cumsum(f0 * (1 + 3 * tb)) / SR) * np.exp(-tb * 45)
            add(out, 0.09 * b, st)
        return out
    if name == "train":
        d = dur or 6
        out = np.zeros(int(d * SR))
        clack_n = int(0.09 * SR)
        tc = np.arange(clack_n) / SR
        clack = bp(RNG.normal(0, 1, clack_n), 300, 2500) * np.exp(-tc * 50)
        tt = 0.0
        while tt < d - 0.2:
            add(out, 0.12 * clack, tt)
            add(out, 0.09 * clack, tt + 0.16)
            tt += 0.9
        rumble = lp(RNG.normal(0, 1, len(out)), 160) * 0.10
        e = np.minimum(1, np.arange(len(out)) / SR / 1.0) * np.minimum(1, (d - np.arange(len(out)) / SR) / 1.0)
        return (out + rumble) * e
    if name == "dream_air":
        d = dur or 6
        t = t_(d)
        x = lp(noise(d), 500) * 0.05 * (0.6 + 0.4 * np.sin(2 * np.pi * 0.2 * t))
        return x * np.minimum(1, t / 1.0) * np.minimum(1, (d - t) / 1.0)
    if name == "pull":
        d = 0.9
        t = t_(d)
        rip = bp(noise(d), 1500, 7000) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 38 * t)))
        sw = bp(noise(d), 300, 2000)
        return (0.10 * rip * np.exp(-t * 3) + 0.14 * sw * np.sin(np.pi * t / d) ** 2)
    if name == "buzz":
        d = 0.9
        t = t_(d)
        gate = (np.sin(2 * np.pi * 7 * t) > 0).astype(float)
        x = np.sin(2 * np.pi * 150 * t) * 0.6 + 0.4 * np.sign(np.sin(2 * np.pi * 150 * t))
        return 0.07 * lp(x * gate, 900) * np.minimum(1, (d - t) * 8)
    if name == "stamp":
        d = 0.35
        t = t_(d)
        return 0.45 * (np.sin(2 * np.pi * (90 + 80 * np.exp(-t * 30)) * t) * np.exp(-t * 18)
                       + 0.5 * bp(noise(d), 400, 3000) * np.exp(-t * 40))
    if name == "splash":
        d = 0.9
        t = t_(d)
        return 0.22 * bp(noise(d), 300, 5000) * np.exp(-t * 5) * np.minimum(1, t * 40)
    if name == "fall":
        d = dur or 2.4
        t = t_(d)
        f = 900 - 650 * (t / d)
        x = bp(noise(d), 200, 2500) * 0.7 + 0.3 * np.sin(2 * np.pi * np.cumsum(f) / SR)
        return 0.14 * x * np.sin(np.pi * t / d) ** 1.5
    if name == "spin":
        d = dur or 4
        t = t_(d)
        x = bp(noise(d), 1500, 4500) * (0.6 + 0.4 * np.sin(2 * np.pi * 18 * t))
        return 0.025 * x * np.minimum(1, t * 4) * np.minimum(1, (d - t) * 2)
    raise ValueError(name)


# ------------------------------------------------------------------- mixagem
def bg_gain_curve(keys, n):
    """Interpola keyframes de ganho (por variante) ao longo de n amostras."""
    t = np.arange(n) / SR
    curves = {}
    for var in ("normal", "slow"):
        pts = [(k[0], k[1] if k[2] == var else 0.0) for k in keys]
        ts = np.array([p[0] for p in pts])
        gs = np.array([p[1] for p in pts])
        curves[var] = np.interp(t, ts, gs)
    # o último keyframe define a variante ativa; valores da outra variante = 0
    return curves


def build(vdir="build/voice2", outdir="build"):
    tl = timeline.build(vdir)
    n = int((tl["duration"] + 0.5) * SR)
    voice = np.zeros(n)
    music = np.zeros(n)       # sinal de despertar + tons (sem ducking!)
    fxbus = np.zeros(n)
    for v in tl["voice"]:
        add(voice, read_wav(os.path.join(vdir, v["id"] + ".wav")), v["t"])
    m = make_motif()
    for mo in tl["motifs"]:
        x = m if mo["speed"] == 1 else slowed(m, mo["speed"])
        add(music, x, mo["t"])
    for tn in tl["tones"]:
        add(music, pure_tone(tn["f"], tn["d"]), tn["t"])
    for s in tl["sfx"]:
        add(fxbus, sfx(s["name"], s.get("dur")), s["t"], s.get("gain", 1.0))

    loop = make_bg()
    bg_norm = tile(loop, n)
    bg_slow = tile(slowed(loop, 0.5), n)
    curves = bg_gain_curve(tl["bg"], n)
    # ducking leve sob a voz (envelope suavizado)
    venv = np.abs(voice)
    venv = lp(venv, 4, 1)
    duck = 1 - 0.45 * np.clip(venv / 0.05, 0, 1)
    BG_LEVEL = 0.32
    bg = BG_LEVEL * (bg_norm * curves["normal"] + 0.9 * bg_slow * curves["slow"]) * duck

    voice_g = 0.92 / max(np.abs(voice).max(), 1e-6) * 0.85
    mix = voice * voice_g + music + bg + fxbus
    # ganho estático para ~-14 LUFS aproximado (via RMS das partes faladas), sem compressão
    peak = np.abs(mix).max()
    if peak > 0.97:
        mix *= 0.97 / peak
    stereo = np.stack([mix, mix], axis=1)
    os.makedirs(outdir, exist_ok=True)
    write_wav(os.path.join(outdir, "mix.wav"), stereo)

    # envelope da boca por quadro (lip-sync)
    fps = timeline.FPS
    nf = tl["nframes"]
    hop = SR // fps
    mouth = []
    vv = voice * voice_g
    for i in range(nf):
        seg = vv[i * hop: i * hop + hop]
        r = float(np.sqrt((seg ** 2).mean())) if len(seg) else 0.0
        mouth.append(r)
    mouth = np.array(mouth)
    mouth = np.clip(mouth / (np.percentile(mouth[mouth > 0.01], 85) if (mouth > 0.01).any() else 1), 0, 1.2)
    tl["mouth"] = [round(float(x), 3) for x in mouth]
    # níveis das comparações (prova de que estão no mesmo volume)
    lv = {}
    for tn in tl["tones"]:
        a, b = int(tn["t"] * SR), int((tn["t"] + tn["d"]) * SR)
        lv[tn["tag"]] = round(20 * np.log10(np.sqrt((mix[a:b] ** 2).mean())), 2)
    tl["tone_levels_dbfs"] = lv
    with open(os.path.join(outdir, "timeline.json"), "w") as f:
        json.dump(tl, f, ensure_ascii=False)
    print("mix ok:", round(len(mix) / SR, 2), "s; níveis dos tons (dBFS RMS):", lv)
    return tl


if __name__ == "__main__":
    build()
