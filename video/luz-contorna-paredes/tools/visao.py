"""Simula como a pessoa escondida apareceria para um sistema limitado pela difração.

Parte de build/retrato.png (a pessoa vista da abertura, a 6 m) e convolui a imagem,
em luz linear, com o padrão de Airy de uma abertura circular de D = 1 m:
    I(theta) = [2 J1(x) / x]^2,  x = pi * D * sin(theta) / lambda
cujo primeiro anel escuro fica em theta = 1,22 lambda / D (OpenStax, seção 4.5).
Essa é a melhor resolução possível passando pela abertura de 1 m; a imagem real
seria ainda pior.

Saída: scene/data/visao_<lambda>.png (300 x 400) e scene/data/visao.json
"""
import json
import os

import numpy as np
from PIL import Image
from scipy.signal import fftconvolve
from scipy.special import j1

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
B = os.path.join(ROOT, "build")
OUT = os.path.join(ROOT, "scene", "data")
D = 1.0
CASOS = {"1cm": 0.01, "10cm": 0.10, "1m": 1.0}


def lin(x):
    x = x / 255.0
    return np.where(x <= 0.04045, x / 12.92, ((x + 0.055) / 1.055) ** 2.4)


def srgb(x):
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * x ** (1 / 2.4) - 0.055) * 255


def airy(raio_px, n):
    """núcleo de Airy com primeiro zero em raio_px, numa grade n x n"""
    c = (n - 1) / 2
    y, x = np.mgrid[0:n, 0:n]
    r = np.hypot(x - c, y - c)
    z = 3.8317 * r / raio_px
    k = np.ones_like(z)
    m = z > 1e-9
    k[m] = (2 * j1(z[m]) / z[m]) ** 2
    return k / k.sum()


def main():
    info = json.load(open(os.path.join(B, "retrato.json")))
    img = np.asarray(Image.open(os.path.join(B, "retrato.png")).convert("RGB"), dtype=np.float64)
    h, w, _ = img.shape
    rad_por_px = np.radians(info["fovVertGraus"]) / h
    L = lin(img)
    fundo = L[2, 2].copy()
    resumo = {"D_m": D, "rad_por_px": rad_por_px, "casos": {}}
    desvio_ref = None
    for nome, lam in CASOS.items():
        theta = 1.22 * lam / D
        r_px = theta / rad_por_px
        # núcleo limitado a ~4 anéis (o resto tem energia desprezível)
        n = int(min(4 * r_px, 2400)) | 1
        n = max(n, 9)
        pad = n // 2 + 2
        P = np.stack([np.pad(L[..., c], pad, constant_values=fundo[c]) for c in range(3)], -1)
        K = airy(max(r_px, 0.5), n)
        out = np.stack([fftconvolve(P[..., c], K, mode="same") for c in range(3)], -1)[pad:pad + h, pad:pad + w]
        # Para 1 m a imagem é quase uniforme; o contraste em relação ao fundo é ampliado
        # (e indicado na tela) até 30% do desvio máximo do caso de 10 cm.
        desvio = np.abs(out - fundo).max()
        realce = 1.0
        if nome == "10cm":
            desvio_ref = desvio
        if nome == "1m" and desvio_ref:
            realce = 0.3 * desvio_ref / desvio
        out = fundo + (out - fundo) * realce
        Image.fromarray(srgb(out).astype(np.uint8)).resize((300, 400), Image.LANCZOS).save(os.path.join(OUT, f"visao_{nome}.png"))
        resumo["casos"][nome] = {"lambda_m": lam, "theta_rad": theta, "borrao_na_pessoa_m": theta * info["distancia"], "raio_px": r_px, "realce_contraste": realce}
        print(nome, f"theta={theta:.4f} rad  borrão a 6 m ~ {theta * info['distancia']:.2f} m  raio={r_px:.1f}px  núcleo={n}")
    with open(os.path.join(OUT, "visao.json"), "w") as f:
        json.dump(resumo, f, indent=1)


if __name__ == "__main__":
    main()
