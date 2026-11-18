"""Murmúrio de multidão ao fundo (ininteligível), para a cidade soar habitada.

Uso: python3 tools/murmurio.py <pasta_dos_modelos>
Saída: build/murmurio.wav (48 kHz, estéreo, ~40 s, em laço)

Frases curtas em três vozes (Kokoro), sobrepostas e filtradas abaixo de ~450 Hz:
sobra só o "burburinho", sem palavras reconhecíveis.
"""
import os
import sys

import numpy as np
import soundfile as sf
from scipy.signal import butter, resample_poly, sosfilt

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from narracao import TTS  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
FRASES = [
    "Bom dia! Tudo bem com você?", "Vamos tomar um café ali na esquina?", "Olha o ônibus chegando!",
    "Que dia bonito hoje.", "Até amanhã, então!", "Quanto custa esse aqui?", "Espera aí, já vou!",
    "Você viu o jogo ontem?", "Preciso passar na farmácia.", "Nossa, que fila enorme.",
    "Me liga mais tarde.", "Acho que vai chover.", "Hoje o trânsito está tranquilo.",
]


def main():
    tts = TTS(sys.argv[1])
    rng = np.random.default_rng(5)
    dur = 40.0
    n = int(dur * SR)
    camadas = np.zeros((n, 2))
    vozes = ["pf_dora", "pm_alex", "pm_santa"]
    for camada in range(8):
        t = rng.uniform(0, 1.5)
        pan = rng.uniform(-0.8, 0.8)
        while t < dur:
            frase = FRASES[rng.integers(len(FRASES))]
            voz = vozes[rng.integers(len(vozes))]
            a, _, _ = tts.falar(frase, voz=voz, velocidade=float(rng.uniform(0.95, 1.15)))
            a = resample_poly(a, 2, 1)
            i = int(t * SR)
            m = min(a.size, n - i)
            g = rng.uniform(0.5, 1.0)
            camadas[i:i + m, 0] += a[:m] * g * np.cos((pan + 1) * np.pi / 4)
            camadas[i:i + m, 1] += a[:m] * g * np.sin((pan + 1) * np.pi / 4)
            t += a.size / SR + rng.uniform(0.1, 1.2)
    sos = butter(6, 450, btype="low", fs=SR, output="sos")
    sos2 = butter(2, 120, btype="high", fs=SR, output="sos")
    for c in range(2):
        camadas[:, c] = sosfilt(sos2, sosfilt(sos, camadas[:, c]))
    # emenda suave para tocar em laço
    f = int(1.0 * SR)
    camadas[:f] *= np.linspace(0, 1, f)[:, None]
    camadas[-f:] *= np.linspace(1, 0, f)[:, None]
    camadas /= np.abs(camadas).max()
    sf.write(os.path.join(ROOT, "build", "murmurio.wav"), (camadas * 0.9).astype(np.float32), SR)
    print("ok", camadas.shape)


if __name__ == "__main__":
    main()
