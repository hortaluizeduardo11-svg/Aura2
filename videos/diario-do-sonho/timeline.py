"""Linha do tempo única do vídeo (áudio e imagem leem daqui).

Os tempos vêm das durações reais da narração: cada fala é posicionada depois
que a anterior termina de ser *falada* (fim da última palavra), mais um respiro.
"""
import json
import os

from narration import LINES

FPS = 30
W, H = 1080, 1920

# Sinal de despertar: três notas (lá4, mi5, dó#5) com ataques a cada 0,2 s.
MOTIF_ONSETS = [0.0, 0.2, 0.4]
TONE_440_LEN = 1.0           # gravação original
TONE_220_LEN = 2.0           # a mesma gravação a 0,5x dura o dobro


def load_voice(vdir):
    meta = {}
    for lid in LINES:
        with open(os.path.join(vdir, f"{lid}.json")) as f:
            meta[lid] = json.load(f)
    return meta


def build(vdir="build/voice"):
    V = load_voice(vdir)
    T = {}
    voice, motifs, tones, sfx = [], [], [], []
    bg = []        # (tempo, ganho, variante) – keyframes da trilha
    captions = []

    def say(lid, t):
        w = V[lid]["words"]
        T[lid] = t
        T[lid + "_end"] = t + w[-1]["t"] + w[-1]["d"]
        voice.append({"id": lid, "t": t})
        # legendas: cada bloco começa na sua primeira palavra
        chunks = LINES[lid]["chunks"]
        idx, starts = 0, []
        for disp, sp in chunks:
            n = len((sp or disp).replace("...", " ").replace("…", " ").split())
            starts.append(t + w[min(idx, len(w) - 1)]["t"] - 0.05)
            idx += n
        ends = starts[1:] + [T[lid + "_end"] + 0.35]
        for (disp, _), a, b in zip(chunks, starts, ends):
            captions.append({"t0": a, "t1": max(b, a + 0.7), "text": disp, "line": lid})
        return T[lid + "_end"]

    def motif(t, speed, tag):
        motifs.append({"t": t, "speed": speed, "tag": tag})
        T[tag] = t
        T[tag + "_notes"] = [t + o / speed for o in MOTIF_ONSETS]

    def tone(t, freq, dur, tag):
        tones.append({"t": t, "f": freq, "d": dur, "tag": tag})
        T[tag] = (t, t + dur)

    def fx(t, name, **kw):
        sfx.append(dict(t=t, name=name, **kw))

    def gain(t, g, var="normal"):
        bg.append((t, g, var))

    # ---------------- Cena 1: "Quem buzinou no meu quarto?" ----------------
    gain(0.0, 0.0)
    T["write_dia1"] = (0.30, 1.75)
    fx(0.30, "pen", dur=1.4, gain=0.5)
    motif(0.45, 1.0, "m1")
    T["flip"] = (2.05, 2.70)
    fx(2.02, "flip")
    T["shotB"] = 2.70
    fx(2.75, "dream_air", dur=7.4)
    motif(3.05, 0.5, "m1_slow")
    T["cup_lift"] = 3.10
    fx(3.10, "pop")
    T["cut_under"] = 5.25
    fx(5.18, "whoosh")
    gain(5.0, 0.0, "slow")
    gain(6.0, 0.55, "slow")
    e = say("L1", 5.35)
    T["cut_back"] = e + 0.40
    fx(T["cut_back"] - 0.05, "whoosh", gain=0.6)
    T["touch"] = T["cut_back"] + 0.30
    fx(T["touch"] + 0.28, "tap", gain=0.5)
    e = say("L2", T["touch"] + 0.25)
    # ---------------- Cena 2: a cena dos fones ----------------
    T["s2"] = e + 0.35
    T["trans_rail"] = (T["s2"], T["s2"] + 1.1)
    gain(T["s2"] - 0.2, 0.55, "slow")
    gain(T["s2"] + 0.5, 1.0, "normal")
    fx(T["s2"] + 0.2, "zip")
    e = say("L3", T["s2"] + 1.1)
    e = say("L4", e + 0.2)
    fx(T["s2"] + 0.9, "train", dur=e - (T["s2"] + 0.9))   # o trem silencia antes da comparação
    gain(e - 0.5, 1.0)
    gain(e + 0.15, 0.0)
    T["play_press"] = e + 0.3
    fx(T["play_press"], "tap")
    motif(T["play_press"] + 0.15, 1.0, "m2")
    T["descend"] = (T["m2"] + 0.75, T["m2"] + 1.35)
    motif(T["m2"] + 1.35, 0.5, "m2_slow")
    T["s2_talk"] = T["m2_slow"] + 2.15
    gain(T["s2_talk"] - 0.1, 0.0)
    gain(T["s2_talk"] + 0.5, 1.0)
    e = say("L5", T["s2_talk"])
    e = say("L6", e + 0.2)
    # ---------------- Cena 3: o público ouve a frequência mudar ----------------
    T["s3"] = e + 0.3
    T["trans_axis"] = (T["s3"], T["s3"] + 1.2)
    gain(T["s3"], 1.0)
    gain(T["s3"] + 0.8, 0.0)
    fx(T["s3"] + 0.1, "zip")
    T["phone_in"] = T["s3"] + 1.0
    T["tap_play1"] = T["s3"] + 1.7
    fx(T["tap_play1"], "tap")
    tone(T["tap_play1"] + 0.1, 440, TONE_440_LEN, "t440a")
    T["tap_speed"] = T["t440a"][1] + 0.35
    fx(T["tap_speed"], "tap")
    T["tap_play2"] = T["tap_speed"] + 0.45
    fx(T["tap_play2"], "tap")
    tone(T["tap_play2"] + 0.1, 220, TONE_220_LEN, "t220a")
    T["explain"] = T["t220a"][1] + 0.3
    gain(T["explain"], 0.0)
    gain(T["explain"] + 0.6, 1.0)
    e = say("L7", T["explain"] + 0.1)
    e = say("L8", e + 0.2)
    e = say("L9", e + 0.2)
    e = say("L10", e + 0.2)
    e = say("L11", e + 0.2)
    gain(e - 0.6, 1.0)
    gain(e + 0.05, 0.0)
    tone(e + 0.35, 440, TONE_440_LEN, "t440b")
    tone(T["t440b"][1] + 0.45, 220, TONE_220_LEN, "t220b")
    T["graphs_done"] = T["t220b"][1]
    e = say("L12", T["graphs_done"] + 0.35)
    gain(T["L12"] + 0.2, 0.0)
    gain(T["L12"] + 0.8, 1.0)
    # ---------------- Cena 4: "Será que foi refração?" ----------------
    T["s4"] = e + 0.3
    T["flip2"] = (T["s4"] - 0.05, T["s4"] + 0.55)
    fx(T["s4"] - 0.08, "flip")
    T["draw_tank"] = (T["s4"] + 0.6, T["s4"] + 2.0)
    fx(T["draw_tank"][0], "pen", dur=1.4)
    e = say("L13", T["s4"] + 0.35)
    T["fill"] = (T["draw_tank"][1] + 0.15, T["draw_tank"][1] + 1.75)
    fx(T["fill"][0], "marker", dur=1.5, gain=0.8)
    fx(T["fill"][0] + 0.3, "bubbles", dur=1.4)
    e = say("L14", e + 0.2)
    T["bands"] = e + 0.1
    fx(T["bands"], "pop", gain=0.6)
    e = say("L15", e + 1.3)
    e = say("L16", e + 0.2)
    T["counters"] = T["L16"]
    e = say("L17", e + 0.2)
    T["cross_out"] = T["L17"] + 1.1
    fx(T["cross_out"], "scribble", dur=0.6)
    # ---------------- Cena 5: fechamento em loop ----------------
    T["s5"] = e + 0.35
    T["zoom_out"] = (T["s5"], T["s5"] + 0.7)
    fx(T["s5"], "whoosh", gain=0.7)
    T["close_diary"] = (T["s5"] + 0.75, T["s5"] + 1.25)
    fx(T["close_diary"][1] - 0.06, "thump")
    e = say("L18", T["s5"] + 0.9)
    e = say("L19", e + 0.2)
    T["pause_tap"] = e + 0.35
    fx(T["pause_tap"], "tap")
    gain(T["pause_tap"] + 0.02, 1.0)
    gain(T["pause_tap"] + 0.10, 0.0)
    motif(T["pause_tap"] + 0.9, 0.25, "m3")
    T["dream_shift"] = (T["m3"], T["m3"] + 1.4)
    fx(T["m3"] + 0.05, "pop", gain=0.6)
    T["look_cam"] = T["m3_notes"][2] + 1.1
    e = say("L20", T["look_cam"] + 0.45)
    e = say("L21", e + 0.4)
    T["pull"] = (e + 0.55, e + 1.65)
    fx(T["pull"][0] - 0.05, "pull")
    T["end"] = T["pull"][1] + 0.1
    gain(T["end"], 0.0)

    nframes = int(round(T["end"] * FPS))
    return {"T": T, "voice": voice, "motifs": motifs, "tones": tones, "sfx": sfx,
            "bg": bg, "captions": captions, "duration": nframes / FPS, "nframes": nframes}


if __name__ == "__main__":
    tl = build()
    for k, v in tl["T"].items():
        print(f"{k:14s} {v}")
    print("duração: %.2f s" % tl["duration"])
