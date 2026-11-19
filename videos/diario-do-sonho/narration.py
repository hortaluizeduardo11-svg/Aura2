"""Narração: roteiro, legendas e geração da voz (TTS neural pt-BR).

Cada fala é uma lista de blocos (legenda_exibida, texto_falado). O texto falado
escreve os números por extenso (com concordância: "quatrocentas e quarenta
vibrações") e a legenda mostra os algarismos destacados.
"""
import asyncio, json, os, ssl, subprocess, sys

VOICE = "pt-BR-AntonioNeural"
BASE_RATE, BASE_PITCH = 12, 16   # % de velocidade, Hz de tom: voz mais jovem e solta

LINES = {
    "L1":  {"chunks": [("Quem buzinou no meu quarto?", None)], "rate": 16, "pitch": 22},
    "L2":  {"chunks": [("Pera.", None), ("Era a mesma música?", None)], "rate": 6, "pitch": 18},
    "L3":  {"chunks": [("Em A Origem, a equipe toca uma música", None),
                        ("pra avisar que tá chegando a hora de acordar.", None)]},
    "L4":  {"chunks": [("Escuta o que acontece", None), ("quando a cena entra no sonho.", None)], "rate": 8},
    "L5":  {"chunks": [("Lá dentro, os personagens", None), ("sentem mais tempo passar.", None)], "rate": 8},
    "L6":  {"chunks": [("E o filme faz a gente", None), ("ouvir essa diferença.", None)]},
    "L7":  {"chunks": [("Frequência é quantas vibrações", None), ("acontecem por segundo.", None)]},
    "L8":  {"chunks": [("Antes, eram 440.", "Antes, eram quatrocentas e quarenta.")]},
    "L9":  {"chunks": [("Quando eu toco a gravação", None), ("na metade da velocidade,", None),
                        ("cada vibração dura o dobro.", None)]},
    "L10": {"chunks": [("Agora cabem 220 por segundo.", "Agora cabem duzentas e vinte por segundo.")]},
    "L11": {"chunks": [("Escuta de novo.", None)]},
    "L12": {"chunks": [("É por isso que a segunda nota", None), ("soa mais grave.", None)]},
    "L13": {"chunks": [("Eu achei que entrar no sonho", None), ("podia ser tipo o som entrar na água.", None)]},
    "L14": {"chunks": [("Bora testar essa ideia?", None)], "rate": 14, "pitch": 20},
    "L15": {"chunks": [("Quando o som passa do ar pra água,", None), ("a velocidade muda", None),
                        ("e as compressões ficam mais afastadas.", None)]},
    "L16": {"chunks": [("Mas continuam passando", None), ("440 por segundo.", "quatrocentas e quarenta por segundo.")]},
    "L17": {"chunks": [("Então a refração não explica", None), ("aquela nota grave.", None)]},
    "L18": {"chunks": [("No filme, o tempo do sonho muda.", None)]},
    "L19": {"chunks": [("A edição traduz isso pro nosso ouvido", None), ("desacelerando a música.", None)]},
    "L20": {"chunks": [("Se eu pausei aqui…", "Se eu pausei aqui...")], "rate": -2, "pitch": 12},
    "L21": {"chunks": [("quem apertou o play lá fora?", "quem apertou o plêi lá fora?")], "rate": 4, "pitch": 14},
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
