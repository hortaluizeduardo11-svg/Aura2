"""Narração: roteiro, legendas e geração da voz (TTS neural pt-BR).

Cada fala é uma lista de blocos (legenda_exibida, texto_falado). O texto falado
escreve os números por extenso (com concordância: "quatrocentas e quarenta
vibrações") e a legenda mostra os algarismos destacados.
"""
import asyncio, json, os, ssl, subprocess, sys

VOICE = "pt-BR-AntonioNeural"
BASE_RATE, BASE_PITCH = 15, 16   # % de velocidade, Hz de tom: voz mais jovem e solta

LINES = {
    # 1. Dormindo vendo o filme
    "N1":  {"chunks": [("Dia 1. Ontem eu dormi vendo A Origem…", "Dia um. Ontem eu dormi vendo A Origem..."),
                        ("de fone.", None)], "rate": 6},
    # 2. Nível 1: o despertador grave
    "N2":  {"chunks": [("Quem buzinou no meu quarto?", None)], "rate": 16, "pitch": 22},
    "N3":  {"chunks": [("Pera.", None), ("Era o meu despertador…", "Era o meu despertador..."),
                        ("mais lento e mais grave.", None)], "rate": 6, "pitch": 18},
    "N4":  {"chunks": [("Aí eu saquei: eu tava sonhando.", None), ("Igualzinho no filme.", None)], "rate": 10},
    # 3. Como o filme funciona
    "N5":  {"chunks": [("Em A Origem, a equipe toca uma música", None), ("no fone de quem tá dormindo.", None)]},
    "N6":  {"chunks": [("É o aviso de que o chute tá chegando:", None), ("a queda que acorda todo mundo.", None)]},
    "N7":  {"chunks": [("Só que cada sonho dentro do sonho", None), ("corre mais rápido que o de cima.", None)]},
    "N8":  {"chunks": [("Então a música de fora chega esticada.", None), ("E o filme faz a gente ouvir isso.", None)]},
    # 4. Suspeita: a água
    "N9":  {"chunks": [("Mas eu tinha outra suspeita.", None), ("No filme, a van cai no rio.", None)]},
    "N10": {"chunks": [("Será que o som ficou grave", None), ("porque entrou na água?", None)], "rate": 10, "pitch": 18},
    "N11": {"chunks": [("Na água, o som anda mais rápido", None), ("e as compressões se afastam.", None)]},
    "N12": {"chunks": [("Mas continuam passando", None), ("440 por segundo.", "quatrocentas e quarenta por segundo."),
                        ("Não foi a água.", None)]},
    # 5. A resposta: o tempo
    "N13": {"chunks": [("Foi o tempo. Olha só.", None)], "rate": 8},
    "N14": {"chunks": [("Frequência é quantas vibrações", None), ("acontecem por segundo.", None)]},
    "N15": {"chunks": [("Na metade da velocidade,", None), ("cada vibração dura o dobro.", None)]},
    "N16": {"chunks": [("Agora cabem 220 por segundo.", "Agora cabem duzentas e vinte por segundo.")]},
    "N17": {"chunks": [("Escuta de novo.", None)]},
    # 6. Mais fundo e o chute
    "N19": {"chunks": [("Aí eu quis descer mais um nível.", None)], "rate": 10},
    "N20": {"chunks": [("110! E no filme é pior:", "Cento e dez! E no filme é pior:"),
                        ("cada nível estica o tempo umas 20 vezes.", "cada nível estica o tempo umas vinte vezes.")]},
    "N21": {"chunks": [("Meu despertador ia virar 22\u00a0Hz:", "Meu despertador ia virar vinte e dois hertz."),
                        ("quase grave demais pra ouvir.", "Quase grave demais pra ouvir.")]},
    "N22": {"chunks": [("Foi aí que veio o chute.", None)], "rate": 4, "pitch": 14},
    # 7. Acordar (?)
    "N23": {"chunks": [("Acordei. Girei meu pião,", None), ("igual no filme…", "igual no filme...")], "rate": 8},
    "N24": {"chunks": [("Anotei tudo…", "Anotei tudo..."), ("e pausei o despertador.", None)], "rate": 8},
    "N25": {"chunks": [("Se eu pausei aqui…", "Se eu pausei aqui...")], "rate": -2, "pitch": 12},
    "N26": {"chunks": [("quem apertou o play lá fora?", "quem apertou o plêi lá fora?")], "rate": 4, "pitch": 14},
}


def spoken(line):
    return " ".join(sp if sp else disp for disp, sp in line["chunks"])


async def _tts(text, rate, pitch, mp3_path):
    import edge_tts
    import edge_tts.communicate as c
    ca = os.environ.get("TTS_CA_BUNDLE", "/root/.ccr/ca-bundle.crt")
    if os.path.exists(ca):  # proxy corporativo: confia no bundle de CA fornecido
        c._SSL_CTX = ssl.create_default_context(cafile=ca)
    com = edge_tts.Communicate(text, VOICE, rate=f"{rate:+d}%", pitch=f"{pitch:+d}Hz",
                               boundary="WordBoundary")
    words = []
    with open(mp3_path, "wb") as f:
        async for ch in com.stream():
            if ch["type"] == "audio":
                f.write(ch["data"])
            elif ch["type"] == "WordBoundary":
                words.append({"t": ch["offset"] / 1e7, "d": ch["duration"] / 1e7, "w": ch["text"]})
    return words


def generate(outdir, force=False):
    os.makedirs(outdir, exist_ok=True)
    meta = {}
    for lid, line in LINES.items():
        text = spoken(line)
        rate = line.get("rate", BASE_RATE)
        pitch = line.get("pitch", BASE_PITCH)
        mp3 = os.path.join(outdir, f"{lid}.mp3")
        wav = os.path.join(outdir, f"{lid}.wav")
        js = os.path.join(outdir, f"{lid}.json")
        key = {"text": text, "rate": rate, "pitch": pitch, "voice": VOICE}
        if not force and os.path.exists(js) and os.path.exists(wav):
            with open(js) as f:
                old = json.load(f)
            if old.get("key") == key:
                meta[lid] = old
                continue
        words = asyncio.run(_tts(text, rate, pitch, mp3))
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", mp3, "-ac", "1", "-ar", "48000", wav], check=True)
        dur = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                             "-of", "csv=p=0", wav]).decode())
        meta[lid] = {"key": key, "words": words, "duration": dur}
        with open(js, "w") as f:
            json.dump(meta[lid], f, ensure_ascii=False, indent=1)
        print(f"{lid}: {dur:.2f}s  {text}")
    return meta


if __name__ == "__main__":
    m = generate(sys.argv[1] if len(sys.argv) > 1 else "build/voice", force="--force" in sys.argv)
    print("total fala: %.1fs" % sum(v["duration"] for v in m.values()))
