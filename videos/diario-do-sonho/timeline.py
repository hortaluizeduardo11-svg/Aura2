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


def build(vdir="build/voice2"):
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

    def word(lid, i):
        return T[lid] + V[lid]["words"][i]["t"]

    # ================= 1. Diário + quarto real: dormindo vendo o filme =================
    gain(0.0, 0.0)
    T["write_dia1"] = (0.25, 1.35)
    fx(0.25, "pen", dur=1.1, gain=0.5)
    e = say("N1", 0.2)
    T["flip"] = (1.75, 2.35)
    fx(1.72, "flip")
    T["R"] = T["flip"][1]
    gain(T["R"], 0.0)
    gain(T["R"] + 0.6, 0.6)
    T["sleep"] = (e - 0.8, e + 0.4)              # olhos fecham, "zzz"
    gain(e + 0.2, 0.6)
    gain(e + 0.6, 0.0)
    T["alarm"] = e + 0.9                         # o despertador toca no quarto real
    fx(T["alarm"] - 0.05, "buzz")
    motif(T["alarm"] + 0.1, 1.0, "m1")
    T["wipe"] = (T["m1"] + 1.05, T["m1"] + 2.05)  # o quarto afunda no sonho
    fx(T["wipe"][0], "dream_air", dur=6.0)
    # ================= 2. Nível 1 =================
    motif(T["wipe"][1] + 0.25, 0.5, "m1_slow")
    T["cup_lift"] = T["m1_slow"] + 0.05
    fx(T["cup_lift"], "pop")
    T["cut_under"] = T["m1_slow_notes"][2] + 1.35
    fx(T["cut_under"] - 0.07, "whoosh")
    gain(T["cut_under"], 0.0, "slow")
    gain(T["cut_under"] + 0.8, 0.5, "slow")
    e = say("N2", T["cut_under"] + 0.1)
    T["cut_back"] = e + 0.4
    fx(T["cut_back"] - 0.05, "whoosh", gain=0.6)
    T["touch"] = T["cut_back"] + 0.3
    fx(T["touch"] + 0.28, "tap", gain=0.5)
    e = say("N3", T["touch"] + 0.25)
    e = say("N4", e + 0.25)
    T["stamp1"] = word("N4", 4) + 0.1
    fx(T["stamp1"], "stamp")
    # ================= 3. Como o filme funciona (níveis empilhados) =================
    T["s2"] = e + 0.3
    T["trans_rail"] = (T["s2"], T["s2"] + 1.1)
    gain(T["s2"] - 0.2, 0.5, "slow")
    gain(T["s2"] + 0.5, 0.9, "normal")
    fx(T["s2"] + 0.2, "zip")
    e = say("N5", T["s2"] + 0.9)
    T["phones_on"] = T["N5"] + 1.6
    e = say("N6", e + 0.2)
    T["chute_note"] = word("N6", 5)
    e = say("N7", e + 0.2)
    T["clocks"] = T["N7"] + 0.2
    fx(T["N5"], "train", dur=e - T["N5"])
    gain(e - 0.5, 0.9)
    gain(e + 0.15, 0.0)
    T["play_press"] = e + 0.3
    fx(T["play_press"], "tap")
    motif(T["play_press"] + 0.15, 1.0, "m2")
    T["descend"] = (T["m2"] + 0.75, T["m2"] + 1.35)
    motif(T["m2"] + 1.35, 0.5, "m2_slow")
    T["deeper"] = (T["m2_slow"] + 1.0, T["m2_slow"] + 3.0)
    gain(T["m2_slow"] + 2.0, 0.0)
    gain(T["m2_slow"] + 2.6, 0.9)
    e = say("N8", T["m2_slow"] + 2.1)
    e = say("N9", e + 0.25)
    T["zoom_van"] = (T["N9"] + 1.2, T["N9"] + 2.2)
    T["van_fall"] = (word("N9", 5), word("N9", 5) + 1.8)
    fx(T["van_fall"][1] - 0.15, "splash")
    # ================= 4. Suspeita: foi a água? =================
    T["s3"] = e + 0.6
    T["flip2"] = (T["s3"] - 0.05, T["s3"] + 0.55)
    fx(T["s3"] - 0.08, "flip")
    T["draw_tank"] = (T["s3"] + 0.6, T["s3"] + 1.8)
    fx(T["draw_tank"][0], "pen", dur=1.2)
    e = say("N10", T["s3"] + 0.35)
    T["fill"] = (T["draw_tank"][1] + 0.1, T["draw_tank"][1] + 1.4)
    fx(T["fill"][0], "marker", dur=1.3, gain=0.8)
    fx(T["fill"][0] + 0.3, "bubbles", dur=1.1)
    T["bands"] = T["fill"][1] + 0.1
    fx(T["bands"], "pop", gain=0.6)
    e = say("N11", max(e + 0.25, T["bands"] + 0.3))
    e = say("N12", e + 0.2)
    T["counters"] = T["N12"]
    T["cross_out"] = word("N12", 8)
    fx(T["cross_out"], "scribble", dur=0.6)
    # ================= 5. A resposta: foi o tempo =================
    T["s4"] = e + 0.35
    T["flip3"] = (T["s4"] - 0.05, T["s4"] + 0.55)
    fx(T["s4"] - 0.08, "flip")
    e = say("N13", T["s4"] + 0.3)
    T["phone_in"] = T["s4"] + 0.5
    gain(T["s4"], 0.9)
    gain(T["s4"] + 0.6, 0.0)
    T["tap_play1"] = e + 0.3
    fx(T["tap_play1"], "tap")
    tone(T["tap_play1"] + 0.1, 440, TONE_440_LEN, "t440a")
    T["tap_speed"] = T["t440a"][1] + 0.35
    fx(T["tap_speed"], "tap")
    T["tap_play2"] = T["tap_speed"] + 0.45
    fx(T["tap_play2"], "tap")
    tone(T["tap_play2"] + 0.1, 220, TONE_220_LEN, "t220a")
    T["explain"] = T["t220a"][1] + 0.3
    gain(T["explain"], 0.0)
    gain(T["explain"] + 0.6, 0.9)
    e = say("N14", T["explain"] + 0.1)
    e = say("N15", e + 0.2)
    e = say("N16", e + 0.2)
    e = say("N17", e + 0.2)
    gain(e - 0.6, 0.9)
    gain(e + 0.05, 0.0)
    tone(e + 0.35, 440, TONE_440_LEN, "t440b")
    tone(T["t440b"][1] + 0.45, 220, TONE_220_LEN, "t220b")
    T["graphs_done"] = T["t220b"][1]
    e = T["graphs_done"] + 1.5           # o círculo "mais grave" se desenha em silêncio
    # ================= 6. Mais fundo: nível 2, 22 Hz e o chute =================
    T["s5"] = e + 0.3
    T["descend2"] = (T["s5"], T["s5"] + 1.0)
    fx(T["s5"], "zip")
    e = say("N19", T["s5"] + 0.15)
    T["stamp2"] = T["descend2"][1] + 0.1
    fx(T["stamp2"], "stamp")
    motif(e + 0.45, 0.25, "m3")                 # 110 Hz: só o valor aparece
    e = say("N20", T["m3_notes"][2] + 1.3)
    gain(T["N20"] + 0.2, 0.0, "slow")
    gain(T["N20"] + 1.0, 0.45, "slow")
    e = say("N21", e + 0.2)
    T["hz22"] = word("N21", 3)
    e = say("N22", e + 0.3)
    gain(e - 0.3, 0.45, "slow")
    gain(e + 0.2, 0.0, "slow")
    T["fall"] = (e + 0.1, e + 2.5)
    fx(T["fall"][0], "fall", dur=2.4)
    # ================= 7. Acordar? =================
    T["wake"] = T["fall"][1]
    fx(T["wake"], "thump")
    motif(T["wake"] + 0.35, 1.0, "m4")          # o despertador de volta ao normal
    e = say("N23", T["m4"] + 1.15)
    T["spin"] = word("N23", 1) - 0.05
    fx(T["spin"], "spin", dur=e + 6.5 - T["spin"])
    gain(T["N23"], 0.0)
    gain(T["N23"] + 0.6, 0.6)
    e = say("N24", e + 0.25)
    T["write2"] = (T["N24"], T["N24"] + 1.2)
    fx(T["N24"] + 0.05, "pen", dur=1.0, gain=0.5)
    T["pause_tap"] = word("N24", 3) + 0.35
    fx(T["pause_tap"], "tap")
    gain(T["pause_tap"] + 0.02, 0.6)
    gain(T["pause_tap"] + 0.10, 0.0)
    motif(e + 0.9, 0.5, "m5")                   # ... e as notas voltam graves
    T["dream_shift"] = (T["m5"], T["m5"] + 1.4)
    fx(T["m5"] + 0.05, "pop", gain=0.6)
    T["look_cam"] = T["m5_notes"][2] + 0.9
    e = say("N25", T["look_cam"] + 0.45)
    e = say("N26", e + 0.4)
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
