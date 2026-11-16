"""Gera a narração e o arquivo de sincronização.

Uso:
    python3 tools/narracao.py <pasta_dos_modelos>                     # Kokoro (offline)
    python3 tools/narracao.py <pasta_dos_modelos> --motor azure       # Azure Speech (voz neural, mais humana)
        [--regiao brazilsouth] [--voz pt-BR-AntonioNeural]

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

# Ordem do vídeo. Cenas numeradas usam o roteiro visual de referência
# (timeline_roteiro.json, tempos 0–95 s); as vinhetas do cotidiano (letras) têm o próprio
# trecho do roteiro a partir de "base" (100, 120, ...), ligadas às demais por cortes.
# "|" separa os trechos de legenda (2–6 palavras).
CENAS = [
    {"cena": 1, "segmentos": [
        ("Sua amiga te chama | atrás da esquina. | Você ouve, | mas não consegue vê-la.", 0.0),
        ("E se a luz | contornasse as paredes | como o som?", 0.0),
    ]},
    {"cena": 2, "segmentos": [
        ("A surpresa é que | a luz já faz isso.", 0.0),
        ("O fenômeno | se chama difração:", 0.0),
        ("ondas se espalham | ao atravessar aberturas | ou contornar obstáculos.", 0.0),
    ]},
    {"cena": 3, "segmentos": [
        ("O efeito fica | mais evidente quando | o comprimento de onda | é comparável à abertura.", 0.0),
        ("Para a luz visível, | uma porta é gigantesca.", 0.0),
        ("Para muitos sons, | não.", 0.0),
    ]},
    {"cena": 4, "segmentos": [
        ("Vamos aumentar | esse comprimento | e imaginar olhos | capazes de detectar | as novas ondas.", 0.0),
        ("Atenção:", 0.0),
        ("a partir daqui, | já não estamos falando | de luz visível comum.", 0.0),
    ]},
    {"cena": 5, "segmentos": [
        ("Quando o comprimento | chega perto | do tamanho da abertura, | o espalhamento fica | muito mais amplo.", 0.0),
        ("Parte do sinal | alcança regiões | atrás das bordas | que antes ficavam | praticamente na sombra.", 0.0),
    ]},
    {"cena": "radio", "base": 100.0, "segmentos": [
        ("Isso já acontece de verdade: | ondas de rádio, | com metros de comprimento, | contornam prédios e morros. "
         "| Por isso o rádio do carro | pega mesmo sem você | ver a antena.", 0.0),
    ]},
    {"cena": "esconde", "base": 120.0, "segmentos": [
        ("Agora imagine o dia a dia | com essa visão. | No esconde-esconde, | você saberia que tem alguém "
         "| atrás do muro, | mas não quem.", 0.0),
    ]},
    {"cena": "esquina", "base": 140.0, "segmentos": [
        ("E numa esquina, | um carro chegando | apareceria como um brilho borrado | antes mesmo de virar.", 0.0),
    ]},
    {"cena": 6, "segmentos": [
        ("Só que isso | não vira | visão de raio X.", 0.0),
        ("Receber sinal | não garante | uma imagem nítida.", 0.0),
        ("A difração também | limita os detalhes | que um sistema | consegue distinguir.", 0.0),
    ]},
    {"cena": "celular", "base": 160.0, "segmentos": [
        ("Por isso, com essa visão, | as letras do celular | e o rosto da sua amiga | virariam manchas.", 0.0),
    ]},
    {"cena": 7, "segmentos": [
        ("Então o som | não tem um poder | que a luz perdeu.", 0.0),
        ("Ambos são ondas.", 0.0),
        ("A diferença é | a relação entre | o comprimento de onda | e o tamanho | dos obstáculos.", 0.0),
    ]},
]
INICIO_FALA = 2.55
# janelas das cenas no roteiro de referência (s)
JANELAS = {1: (0.0, 10.0), 2: (10.0, 23.0), 3: (23.0, 36.0), 4: (36.0, 49.0), 5: (49.0, 63.0),
           6: (63.0, 75.4), 7: (78.0, 95.0)}

VELOCIDADE = 1.06  # ritmo de vídeo de curiosidades, sem atropelar
VOZ = "pm_alex"


class TTS:
    def __init__(self, pasta):
        # Usamos o objeto Kokoro só pelo fonemizador, tokenizador e vozes.
        self.k = Kokoro(os.path.join(pasta, "kokoro-v1.0-dur.onnx"), os.path.join(pasta, "voices-v1.0.bin"))
        self.sess = ort.InferenceSession(os.path.join(pasta, "kokoro-v1.0-dur.onnx"))
        self.voz_chamado = "pf_dora"
        self.voz = VOZ

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


# Intervalo entre cenas: curto, proporcional à transição visual que acontece ali.
GAP_FATOR, GAP_MIN, GAP_MAX = 0.4, 0.55, 1.5
CAUDA_FINAL = 1.5  # legenda final na tela antes dos créditos
CREDITOS = 5.0


def calcular_warp(saida, ref, fim_conteudo):
    """Mapa do tempo do vídeo (t) para o tempo do roteiro visual (s), por cena.
    Cenas numeradas: curva suave e monótona ancorada no início de cada trecho de legenda
    (mesmo índice do roteiro de referência). Vinhetas: s = base + (t - início da cena).
    Entre cenas que não são vizinhas no roteiro, há um corte."""
    from scipy.interpolate import PchipInterpolator
    refc = {c["cena"]: c for c in ref["cenas"]}
    cenas = saida["cenas"]
    # limites de cada cena no vídeo: no meio do intervalo entre as falas
    lim = [0.0]
    for i in range(1, len(cenas)):
        a = cenas[i - 1]["segmentos"][-1]["t1"]
        b = cenas[i]["segmentos"][0]["t0"]
        lim.append(a + 0.45 * (b - a))
    lim.append(fim_conteudo + CREDITOS)
    segs = []
    for i, c in enumerate(cenas):
        v0, v1 = lim[i], lim[i + 1]
        if isinstance(c["cena"], int):
            s0, s1 = JANELAS[c["cena"]]
            nov = [l for sg in c["segmentos"] for l in sg["legendas"]]
            old = [l for sg in refc[c["cena"]]["segmentos"] for l in sg["legendas"]]
            assert len(nov) == len(old), f"cena {c['cena']}: {len(nov)} trechos x {len(old)} no roteiro"
            kt = [v0] + [l["t0"] for l in nov] + [nov[-1]["t1"]]
            ks = [s0] + [l["t0"] for l in old] + [old[-1]["t1"]]
            if c["cena"] == 7:  # legenda final e créditos
                kt += [fim_conteudo, v1]
                ks += [90.0, s1]
            else:
                kt += [v1]
                ks += [s1]
            f = PchipInterpolator(kt, ks)
        else:
            base = c["base"]
            f = (lambda base, v0: (lambda t: base + (t - v0)))(base, v0)
            s0, s1 = base, base + (v1 - v0)
        segs.append({"cena": c["cena"], "v0": round(v0, 4), "v1": round(v1, 4), "s0": round(s0, 4), "s1": round(s1, 4), "f": f})
    dt = 1 / 120
    tt = np.arange(0, lim[-1] + dt / 2, dt)
    ss = np.empty_like(tt)
    for sg in segs:
        m = (tt >= sg["v0"] - 1e-9) & (tt < sg["v1"] - 1e-9)
        ss[m] = sg["f"](tt[m])
    ss[-1] = segs[-1]["f"](tt[-1])
    deriv = []
    for sg in segs:
        m = (tt >= sg["v0"]) & (tt < sg["v1"] - dt)
        if m.sum() > 2:
            deriv.extend(np.gradient(ss[m], dt))
    for sg in segs:
        del sg["f"]
    return {"dt": dt, "duracao": round(float(lim[-1]), 3), "segs": segs,
            "s": [round(float(x), 4) for x in ss]}, np.array(deriv)


def arg(nome, padrao=None):
    return sys.argv[sys.argv.index(nome) + 1] if nome in sys.argv else padrao


def main():
    pasta = sys.argv[1]
    motor = arg("--motor", "kokoro")
    if motor == "azure":
        from tts_azure import TTSAzure
        tts = TTSAzure(regiao=arg("--regiao", "brazilsouth"), voz=arg("--voz", "pt-BR-AntonioNeural"))
    else:
        tts = TTS(pasta)
    ref = json.load(open(os.path.join(ROOT, "scene", "data", "timeline_roteiro.json"), encoding="utf-8"))
    ref_fim = {c["cena"]: c["segmentos"][-1]["legendas"][-1]["t1"] for c in ref["cenas"]}
    ref_ini = {c["cena"]: c["segmentos"][0]["legendas"][0]["t0"] for c in ref["cenas"]}

    def intervalo(anterior, atual):
        # entre cenas vizinhas no roteiro: proporcional à transição de referência; com vinhetas: fixo
        if isinstance(anterior, int) and isinstance(atual, int) and atual == anterior + 1:
            return min(GAP_MAX, max(GAP_MIN, GAP_FATOR * (ref_ini[atual] - ref_fim[anterior])))
        return 0.9
    trilha = np.zeros(int(120 * SR), dtype=np.float32)
    saida = {"sr": SR, "motor": motor, "voz": getattr(tts, "voz", VOZ), "cenas": []}
    relatorio = []
    t = INICIO_FALA
    for idx, cena in enumerate(CENAS):
        if idx > 0:
            t += intervalo(CENAS[idx - 1]["cena"], cena["cena"])
        # a cena inteira numa só tomada: sem pausas inseridas, só as da pontuação
        pedacos = [p.strip() for ex, _ in cena["segmentos"] for p in ex.split("|")]
        texto = " ".join(pedacos)
        fala = texto
        for a_, b_ in PRONUNCIA.items():
            fala = fala.replace(a_, b_)
        audio, pal, fon = tts.falar(fala)
        audio, desloc = aparar(audio)
        palavras_txt = texto.split()
        if len(pal) != len(palavras_txt):
            raise SystemExit(f"Contagem de palavras diferente em: {texto}\n{fon}\n{len(pal)} vs {len(palavras_txt)}")
        ini = int(round(t * SR))
        trilha[ini:ini + audio.size] += audio
        palavras = [{"w": w, "t0": round(t + p["t0"] - desloc, 3), "t1": round(t + p["t1"] - desloc, 3)} for w, p in zip(palavras_txt, pal)]
        legendas, k = [], 0
        for ped in pedacos:
            nw = len(ped.split())
            ws = palavras[k:k + nw]
            legendas.append({"txt": ped, "t0": ws[0]["t0"], "t1": ws[-1]["t1"]})
            k += nw
        fim = t + audio.size / SR
        item = {"cena": cena["cena"], "segmentos": [{"texto": texto, "t0": round(t, 3), "t1": round(fim, 3), "palavras": palavras, "legendas": legendas}]}
        if "base" in cena:
            item["base"] = cena["base"]
        saida["cenas"].append(item)
        relatorio.append(f"Cena {cena['cena']}: fala {t:.2f}–{fim:.2f}s ({fim - t:.1f}s)")
        t = fim

    fim_conteudo = round(saida["cenas"][-1]["segmentos"][-1]["legendas"][-1]["t1"] + CAUDA_FINAL, 3)
    pico = np.abs(trilha).max()
    trilha = trilha[: int((fim_conteudo + CREDITOS) * SR)] * (0.89 / pico)
    os.makedirs(os.path.join(ROOT, "build"), exist_ok=True)
    sf.write(os.path.join(ROOT, "build", "narracao.wav"), trilha, SR)

    # chamado da pessoa escondida
    chamado, _, _ = tts.falar("Ei! Aqui!", voz=tts.voz_chamado, velocidade=1.0)
    chamado, _ = aparar(chamado)
    sf.write(os.path.join(ROOT, "build", "chamado.wav"), chamado / np.abs(chamado).max() * 0.9, SR)
    saida["chamado"] = {"t0": 1.05, "dur": round(chamado.size / SR, 3)}

    # janelas das cenas no tempo do vídeo: entre o fim da fala anterior e o início da seguinte
    warp, deriv = calcular_warp(saida, ref, fim_conteudo)
    with open(os.path.join(ROOT, "scene", "data", "timeline.json"), "w", encoding="utf-8") as f:
        json.dump(saida, f, ensure_ascii=False, indent=1)
    with open(os.path.join(ROOT, "scene", "data", "warp.json"), "w") as f:
        json.dump(warp, f, separators=(",", ":"))
    print("\n".join(relatorio))
    print(f"conteúdo: {fim_conteudo:.2f}s  + créditos = {warp['duracao']:.2f}s")
    print(f"velocidade do roteiro (ds/dt): mín {deriv.min():.2f}  máx {deriv.max():.2f}  "
          f"mediana {np.median(deriv):.2f}  >2.5 em {np.mean(deriv > 2.5) * 100:.1f}% do tempo")
    for sg in warp["segs"]:
        print(f"  {str(sg['cena']):>8}: vídeo {sg['v0']:6.2f}–{sg['v1']:6.2f}  roteiro {sg['s0']:6.2f}–{sg['s1']:6.2f}")
    print("chamado:", saida["chamado"])


if __name__ == "__main__":
    main()
