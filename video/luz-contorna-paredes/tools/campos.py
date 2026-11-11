"""Calcula os mapas de difração usados nas visualizações (vista de cima, 2D).

Geometria (metros), igual à da cena 3D:
    parede em z = 0 (barreira ideal opaca), abertura de 1 m entre x = -0,5 e x = +0,5
    fonte (pessoa escondida) em S = (0, -6), do lado do pátio (z < 0)
    região calculada do lado da rua: x em [-10, 10], z em [0, 12]

Método: princípio de Huygens–Fresnel (Rayleigh–Sommerfeld, 2D escalar). Cada ponto da
abertura vira uma fonte secundária; o campo em P é a soma dessas contribuições:
    U(P) = (i k / 2) * soma_j U_inc(a_j) * cos(theta_j) * H1(k R_j) * da
com U_inc = H0(k |a - S|) (onda cilíndrica da fonte). Para 500 nm a soma exigiria milhões
de pontos; nesse caso o resultado prático na escala de 5 cm por pixel é o feixe
geométrico (a borda de Fresnel tem ~ sqrt(lambda * z) ~ 1,5 mm).

Saída: scene/data/campo_<nome>.png, 400 x 240 px
    R = intensidade relativa à de uma onda sem parede, em escala log:
        v = (log10(I / I_livre) + 2,2) / 2,4, limitado a [0, 1]
    G, B = cos e sin da fase do campo (usados apenas quando lambda >= 0,5 m)
"""
import json
import os

import numpy as np
from PIL import Image
from scipy.special import hankel1

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "scene", "data")

X0, X1, Z0, Z1 = -10.0, 10.0, 0.0, 12.0
NX, NZ = 400, 240
SS = 2  # supersampling por eixo
A = 1.0  # largura da abertura
S = np.array([0.0, -6.0])
LOG_MIN, LOG_SPAN = -2.2, 2.4

CASOS = {
    "500nm": 500e-9,
    "1cm": 0.01,
    "10cm": 0.10,
    "1m": 1.0,
}


def grade():
    xs = X0 + (np.arange(NX * SS) + 0.5) * (X1 - X0) / (NX * SS)
    zs = Z0 + (np.arange(NZ * SS) + 0.5) * (Z1 - Z0) / (NZ * SS)
    return np.meshgrid(xs, zs)  # (NZ*SS, NX*SS)


def h0(kr, exato):
    if exato:
        return hankel1(0, kr)
    return np.sqrt(2 / (np.pi * kr)) * np.exp(1j * (kr - np.pi / 4))


def h1(kr, exato):
    if exato:
        return hankel1(1, kr)
    return np.sqrt(2 / (np.pi * kr)) * np.exp(1j * (kr - 3 * np.pi / 4))


def campo(lam):
    X, Z = grade()
    k = 2 * np.pi / lam
    exato = lam >= 0.05
    n = int(np.ceil(A / (lam / 8)))
    n = max(n, 64)
    xa = -A / 2 + (np.arange(n) + 0.5) * A / n
    da = A / n
    rs = np.hypot(xa - S[0], 0 - S[1])
    uinc = h0(k * rs, exato)
    U = np.zeros(X.shape, dtype=np.complex128)
    for j in range(n):
        dx = X - xa[j]
        R = np.hypot(dx, Z)
        R = np.maximum(R, 1e-4)
        cos_t = Z / R
        U += uinc[j] * cos_t * h1(k * R, exato)
    U *= 1j * k / 2 * da
    Rf = np.hypot(X - S[0], Z - S[1])
    Ilivre = np.abs(h0(k * Rf, exato)) ** 2
    return U, Ilivre


def feixe_geometrico():
    X, Z = grade()
    # retas que partem da fonte e passam pelas bordas da abertura
    meia = (A / 2) * (Z - S[1]) / (0 - S[1])
    dentro = (np.abs(X) <= meia).astype(np.float64)
    return dentro


def reduz(arr):
    return arr.reshape(NZ, SS, NX, SS).mean(axis=(1, 3))


def salvar(nome, razao, U=None):
    razao = reduz(razao)
    v = np.clip((np.log10(np.maximum(razao, 1e-9)) - LOG_MIN) / LOG_SPAN, 0, 1)
    img = np.zeros((NZ, NX, 3), dtype=np.uint8)
    img[..., 0] = np.round(v * 255)
    if U is not None:
        # fase no centro de cada pixel (sem média, para não cancelar)
        Uc = U[SS // 2::SS, SS // 2::SS]
        ph = np.angle(Uc)
        img[..., 1] = np.round((np.cos(ph) * 0.5 + 0.5) * 255)
        img[..., 2] = np.round((np.sin(ph) * 0.5 + 0.5) * 255)
    else:
        img[..., 1] = 128
        img[..., 2] = 128
    # linha 0 da imagem = z mais distante (para casar com a textura no plano)
    Image.fromarray(img[::-1]).save(os.path.join(OUT, f"campo_{nome}.png"))
    return razao


def main():
    os.makedirs(OUT, exist_ok=True)
    resumo = {"dominio": [X0, X1, Z0, Z1], "fonte": S.tolist(), "abertura": A,
              "log_min": LOG_MIN, "log_span": LOG_SPAN, "casos": {}}
    # pontos de referência: eixo, borda da sombra e a posição do protagonista
    sondas = {"eixo_z4": (0.0, 4.0), "protagonista": (-2.2, 2.2), "lateral_x4_z6": (-4.0, 6.0)}
    for nome, lam in CASOS.items():
        if lam < 1e-3:
            razao = feixe_geometrico()
            U = None
        else:
            U, Il = campo(lam)
            razao = np.abs(U) ** 2 / Il
        r = salvar(nome, razao, U)
        info = {"lambda_m": lam}
        for sn, (sx, sz) in sondas.items():
            ix = int((sx - X0) / (X1 - X0) * NX)
            iz = int((sz - Z0) / (Z1 - Z0) * NZ)
            info[sn] = float(r[iz, ix])
        resumo["casos"][nome] = info
        print(nome, {k: (round(v, 4) if isinstance(v, float) else v) for k, v in info.items()})
    with open(os.path.join(OUT, "campos.json"), "w") as f:
        json.dump(resumo, f, indent=1)


if __name__ == "__main__":
    main()
