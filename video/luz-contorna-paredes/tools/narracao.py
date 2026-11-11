"""Gera a narração (Kokoro TTS, voz pm_alex, pt-BR) e o arquivo de sincronização.

Uso:
    python3 tools/narracao.py <pasta_dos_modelos>

A pasta de modelos precisa conter:
    kokoro-v1.0-dur.onnx  (kokoro-v1.0.onnx com a saída de durações exposta, ver tools/expor_duracoes.py)
    voices-v1.0.bin

Saídas:
    build/narracao.wav          narração posicionada na linha do tempo (24 kHz mono)
    build/chamado.wav           o "Ei! Aqui!" da pessoa escondida (voz pf_dora, seca)
    scene/data/timeline.json    tempos de cada palavra e de cada legenda

As legendas são separadas por "|" no texto. O tempo de cada palavra vem diretamente
das durações de fonemas previstas pelo modelo (1 quadro = 600 amostras = 25 ms).
"""
import json
import os
import sys

import numpy as np
import onnxruntime as ort
import soundfile as sf
from kokoro_onnx import Kokoro

SR = 24000
HOP = 600
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Cada cena: janela [início, fim] e segmentos com (texto exibido, pausa antes em s).
# O primeiro segmento de cada cena começa em "inicio_fala".
# Substituições só para a pronúncia (o texto exibido nas legendas não muda).
PRONUNCIA = {"raio X": "raio xis"}

CENAS = [
    {"cena": 1, "janela": [0.0, 10.0], "inicio_fala": 2.55, "segmentos": [
        ("Você ouve alguém | atrás da esquina, | mas não consegue | enxergar essa pessoa.", 0.0),
        ("E se a luz | contornasse as paredes | como o som?", 0.55),
    ]},
    {"cena": 2, "janela": [10.0, 23.0], "inicio_fala": 10.9, "segmentos": [
        ("A surpresa é que | a luz já faz isso.", 0.0),
        ("O fenômeno | se chama difração:", 0.7),
        ("ondas se espalham | ao atravessar aberturas | ou contornar obstáculos.", 0.35),
    ]},
    {"cena": 3, "janela": [23.0, 36.0], "inicio_fala": 23.7, "segmentos": [
        ("O efeito fica | mais evidente quando | o comprimento de onda | é comparável à abertura.", 0.0),
        ("Para a luz visível, | uma porta é gigantesca.", 0.75),
        ("Para muitos sons, | não.", 0.55),
    ]},
    {"cena": 4, "janela": [36.0, 49.0], "inicio_fala": 36.8, "segmentos": [
        ("Vamos aumentar | esse comprimento | e imaginar olhos | capazes de detectar | as novas ondas.", 0.0),
        ("Atenção:", 0.7),
        ("a partir daqui, | já não estamos falando | de luz visível comum.", 0.3),
    ]},
    {"cena": 5, "janela": [49.0, 63.0], "inicio_fala": 50.2, "segmentos": [
        ("Quando o comprimento | chega perto | do tamanho da abertura, | o espalhamento fica | muito mais amplo.", 0.0),
        ("Parte do sinal | alcança regiões | atrás das bordas | que antes ficavam | praticamente na sombra.", 0.6),
    ]},
    {"cena": 6, "janela": [63.0, 78.0], "inicio_fala": 63.9, "segmentos": [
        ("Só que isso | não vira | visão de raio X.", 0.0),
        ("Receber sinal | não garante | uma imagem nítida.", 0.75),
        ("A difração também | limita os detalhes | que um sistema | consegue distinguir.", 0.55),
    ]},
    {"cena": 7, "janela": [78.0, 90.0], "inicio_fala": 78.7, "segmentos": [
        ("Então o som | não tem um poder | que a luz perdeu.", 0.0),
        ("Ambos são ondas.", 0.6),
        ("A diferença é | a relação entre | o comprimento de onda | e o tamanho | dos obstáculos.", 0.7),
    ]},
]

VELOCIDADE = 1.06  # ritmo de vídeo de curiosidades, sem atropelar
VOZ = "pm_alex"


class TTS:
    def __init__(self, pasta):
        # Usamos o objeto Kokoro só pelo fonemizador, tokenizador e vozes.
        self.k = Kokoro(os.path.join(pasta, "kokoro-v1.0-dur.onnx"), os.path.join(pasta, "voices-v1.0.bin"))
        self.sess = ort.InferenceSession(os.path.join(pasta, "kokoro-v1.0-dur.onnx"))

    def falar(self, texto, voz=VOZ, velocidade=VELOCIDADE):
        fon = self.k.tokenizer.phonemize(texto, "pt-br")
        toks = self.k.tokenizer.tokenize(fon)
        estilo = self.k.get_voice_style(voz)[len(toks)]
        audio, dur = self.sess.run(None, {
            "tokens": np.array([[0, *toks, 0]], dtype=np.int64),
            "style": np.asarray(estilo, dtype=np.float32).reshape(1, 256),
            "speed": np.array([velocidade], dtype=np.float32),
        })
        dur = dur.reshape(-1)
        assert dur.sum() * HOP == audio.size, (dur.sum(), audio.size)
        # Mapa token -> caractere fonético (tokenize descarta caracteres desconhecidos)
        vocab = self.k.tokenizer.vocab
        chars = [c for c in fon if c in vocab]
        assert len(chars) == len(toks)
        # tempos de início de cada token (o índice 0 é o BOS)
        inicio = np.concatenate([[0], np.cumsum(dur)]) * HOP / SR
        # palavras fonéticas: sequências separadas por espaço
        palavras, atual = [], None
        for i, c in enumerate(chars):
            t0, t1 = inicio[i + 1], inicio[i + 2]
            if c == " ":
                if atual:
                    palavras.append(atual)
                atual = None
                continue
            if atual is None:
                atual = {"fon": "", "t0": t0, "t1": t1}
            atual["fon"] += c
            atual["t1"] = t1
        if atual:
            palavras.append(atual)
        # palavras só de pontuação se juntam à anterior
        limpas = []
        for p in palavras:
            if limpas and all(ch in ".,;:!?…" for ch in p["fon"]):
                limpas[-1]["fon"] += p["fon"]
                continue
            limpas.append(p)
        return audio.astype(np.float32), limpas, fon


def aparar(audio, limiar=0.008, margem=0.03):
    """Remove silêncio no início/fim. Retorna (audio, deslocamento_inicial_s)."""
    env = np.abs(audio)
    idx = np.where(env > limiar)[0]
    if idx.size == 0:
        return audio, 0.0
    a = max(0, idx[0] - int(margem * SR))
    b = min(audio.size, idx[-1] + int(margem * SR * 2))
    return audio[a:b], a / SR


def main():
    pasta = sys.argv[1]
    tts = TTS(pasta)
    total = 96.0
    trilha = np.zeros(int(total * SR), dtype=np.float32)
    saida = {"sr": SR, "voz": VOZ, "velocidade": VELOCIDADE, "cenas": []}
    relatorio = []
    for cena in CENAS:
        t = cena["inicio_fala"]
        segs_out = []
        for i, (exibido, pausa) in enumerate(cena["segmentos"]):
            if i > 0:
                t += pausa
            pedacos = [p.strip() for p in exibido.split("|")]
            texto = " ".join(pedacos)
            fala = texto
            for a, b in PRONUNCIA.items():
                fala = fala.replace(a, b)
            audio, pal, fon = tts.falar(fala)
            audio, desloc = aparar(audio)
            palavras_txt = texto.split()
            if len(pal) != len(palavras_txt):
                raise SystemExit(f"Contagem de palavras diferente em: {texto}\n{fon}\n{len(pal)} vs {len(palavras_txt)}")
            n = audio.size
            ini = int(round(t * SR))
            trilha[ini:ini + n] += audio
            palavras = []
            for w, p in zip(palavras_txt, pal):
                palavras.append({"w": w, "t0": round(t + p["t0"] - desloc, 3), "t1": round(t + p["t1"] - desloc, 3)})
            # legendas
            legendas, k = [], 0
            for ped in pedacos:
                nw = len(ped.split())
                ws = palavras[k:k + nw]
                legendas.append({"txt": ped, "t0": ws[0]["t0"], "t1": ws[-1]["t1"]})
                k += nw
            fim = t + n / SR
            segs_out.append({"texto": texto, "t0": round(t, 3), "t1": round(fim, 3), "palavras": palavras, "legendas": legendas})
            t = fim
        j0, j1 = cena["janela"]
        relatorio.append(f"Cena {cena['cena']}: fala {segs_out[0]['t0']:.2f}–{t:.2f}s  janela {j0}–{j1}  folga final {j1 - t:+.2f}s")
        saida["cenas"].append({"cena": cena["cena"], "janela": cena["janela"], "segmentos": segs_out})

    pico = np.abs(trilha).max()
    trilha *= 0.89 / pico
    os.makedirs(os.path.join(ROOT, "build"), exist_ok=True)
    sf.write(os.path.join(ROOT, "build", "narracao.wav"), trilha, SR)

    # chamado da pessoa escondida
    chamado, _, _ = tts.falar("Ei! Aqui!", voz="pf_dora", velocidade=1.0)
    chamado, _ = aparar(chamado)
    sf.write(os.path.join(ROOT, "build", "chamado.wav"), chamado / np.abs(chamado).max() * 0.9, SR)
    saida["chamado"] = {"t0": 1.05, "dur": round(chamado.size / SR, 3)}

    with open(os.path.join(ROOT, "scene", "data", "timeline.json"), "w", encoding="utf-8") as f:
        json.dump(saida, f, ensure_ascii=False, indent=1)
    print("\n".join(relatorio))
    print("chamado:", saida["chamado"])


if __name__ == "__main__":
    main()
