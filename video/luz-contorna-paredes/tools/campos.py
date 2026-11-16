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


def campo(lam, S=S, xa0=-A / 2, xa1=A / 2):
    """abertura em z = 0 entre xa0 e xa1 (o resto da linha z = 0 é opaco)"""
    X, Z = grade()
    k = 2 * np.pi / lam
    exato = lam >= 0.05
    larg = xa1 - xa0
    n = int(np.ceil(larg / (lam / 8)))
    n = max(n, 64)
    xa = xa0 + (np.arange(n) + 0.5) * larg / n
    da = larg / n
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


def feixe_geometrico(S=S, xa0=-A / 2, xa1=A / 2):
    """óptica geométrica: iluminado se a reta da fonte até o ponto cruza z = 0 dentro da abertura"""
    X, Z = grade()
    xc = S[0] + (X - S[0]) * (0 - S[1]) / (Z - S[1])
    return ((xc >= xa0) & (xc <= xa1)).astype(np.float64)


def reduz(arr):
    return arr.reshape(NZ, SS, NX, SS).mean(axis=(1, 3))


def salvar(nome, razao, U=None):
    razao = reduz(razao)
    razao[0] = razao[1]  # primeira linha (rente à barreira): evita picos numéricos
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


# Casos: nome -> (lambda, fonte, abertura). Gume = borda única (quina de prédio, topo de morro):
# a linha z = 0 é opaca para x < 0 e aberta para x > 0.
GUME = (0.0, 30.0)
FENDA = (-A / 2, A / 2)
TODOS = {
    "500nm": (500e-9, S, FENDA),
    "1cm": (0.01, S, FENDA),
    "10cm": (0.10, S, FENDA),
    "1m": (1.0, S, FENDA),
    # esconde-esconde: a amiga agachada logo atrás do muro, perto da abertura
    "esconde_1m": (1.0, np.array([-1.6, -1.2]), FENDA),
    # carro chegando pela rua transversal, atrás da quina do prédio
    "gume_1m": (1.0, np.array([5.0, -10.0]), GUME),
    # rádio FM (~100 MHz, lambda ~ 3 m) passando pelo topo do morro; e a luz, para comparar
    "gume_3m": (3.0, np.array([1.0, -10.0]), GUME),
    "gume_luz": (500e-9, np.array([1.0, -10.0]), GUME),
}


def main():
    import sys
    os.makedirs(OUT, exist_ok=True)
    so = sys.argv[1:] or list(TODOS)
    caminho = os.path.join(OUT, "campos.json")
    resumo = json.load(open(caminho)) if os.path.exists(caminho) else {}
    resumo.update({"dominio": [X0, X1, Z0, Z1], "abertura": A, "log_min": LOG_MIN, "log_span": LOG_SPAN})
    resumo.setdefault("casos", {})
    sondas = {"eixo_z4": (0.0, 4.0), "protagonista": (-2.2, 2.2), "lateral_x4_z6": (-4.0, 6.0),
              "sombra_x-3_z2": (-3.0, 2.2), "sombra_x-4_z6": (-4.0, 6.0)}
    for nome in so:
        lam, fonte, (xa0, xa1) = TODOS[nome]
        if lam < 1e-3:
            razao, U = feixe_geometrico(fonte, xa0, xa1), None
        else:
            U, Il = campo(lam, fonte, xa0, xa1)
            razao = np.abs(U) ** 2 / Il
        r = salvar(nome, razao, U)
        info = {"lambda_m": lam, "fonte": [float(v) for v in fonte], "abertura": [xa0, xa1]}
        for sn, (sx, sz) in sondas.items():
            ix = int((sx - X0) / (X1 - X0) * NX)
            iz = int((sz - Z0) / (Z1 - Z0) * NZ)
            info[sn] = float(r[iz, ix])
        resumo["casos"][nome] = info
        print(nome, {k: (round(v, 4) if isinstance(v, float) else v) for k, v in info.items() if k.startswith(("prot", "sombra", "eixo"))})
    with open(caminho, "w") as f:
        json.dump(resumo, f, indent=1)


if __name__ == "__main__":
    main()
