"""Motor de voz Azure Speech (API oficial da Microsoft), para uma narração mais humana.

Uso (a partir de tools/narracao.py):
    python3 tools/narracao.py <pasta_modelos> --motor azure [--regiao brazilsouth] [--voz pt-BR-AntonioNeural]

Chave: nunca fica no código. Ou o ambiente injeta a chave como segredo de rede para
<regiao>.tts.speech.microsoft.com (cabeçalho Ocp-Apim-Subscription-Key), ou ela vem da
variável AZURE_SPEECH_KEY.

Tempos das palavras: o SDK oficial informa o instante de cada palavra (word boundary),
o que mantém as legendas sincronizadas. Se o SDK não conseguir conectar, usa a API REST
e estima os tempos alinhando as pausas do áudio à pontuação do texto.
"""
import html
import io
import os
import re
import ssl
import urllib.parse
import urllib.request

import numpy as np
import soundfile as sf

SR = 24000


def _palavras(texto):
    return [(m.start(), m.end()) for m in re.finditer(r"\S+", texto)]


class TTSAzure:
    def __init__(self, regiao="brazilsouth", voz="pt-BR-AntonioNeural", voz_chamado="pt-BR-FranciscaNeural", taxa="+4%"):
        self.regiao = regiao
        self.voz = voz
        self.voz_chamado = voz_chamado
        self.taxa = taxa
        # Com o segredo de rede, o proxy troca este valor pela chave real.
        self.chave = os.environ.get("AZURE_SPEECH_KEY", "chave-injetada-pelo-proxy")
        self.host = f"{regiao}.tts.speech.microsoft.com"

    def _ssml(self, texto, voz, taxa):
        cab = (f"<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='pt-BR'>"
               f"<voice name='{voz}'><prosody rate='{taxa}'>")
        return cab, cab + html.escape(texto, quote=False) + "</prosody></voice></speak>"

    def falar(self, texto, voz=None, velocidade=None):
        voz = voz or self.voz
        taxa = self.taxa if velocidade is None else f"{(velocidade - 1) * 100:+.0f}%"
        try:
            return self._sdk(texto, voz, taxa)
        except Exception as e:  # noqa: BLE001
            print(f"[azure] SDK indisponível ({e}); usando a API REST")
            return self._rest(texto, voz, taxa)

    # ---------- SDK oficial: áudio + instante de cada palavra ----------
    def _sdk(self, texto, voz, taxa):
        import azure.cognitiveservices.speech as sdk

        cfg = sdk.SpeechConfig(subscription=self.chave, region=self.regiao)
        cfg.set_speech_synthesis_output_format(sdk.SpeechSynthesisOutputFormat.Raw24Khz16BitMonoPcm)
        px = os.environ.get("HTTPS_PROXY") or os.environ.get("https_proxy")
        if px:
            u = urllib.parse.urlparse(px)
            cfg.set_proxy(u.hostname, u.port)
        synth = sdk.SpeechSynthesizer(speech_config=cfg, audio_config=None)
        eventos = []

        def on_word(evt):
            if str(evt.boundary_type).endswith("Word"):
                eventos.append((evt.audio_offset / 1e7, evt.duration.total_seconds(), evt.text_offset, evt.word_length))

        synth.synthesis_word_boundary.connect(on_word)
        cab, ssml = self._ssml(texto, voz, taxa)
        res = synth.speak_ssml_async(ssml).get()
        if res.reason != sdk.ResultReason.SynthesizingAudioCompleted:
            det = res.cancellation_details
            raise RuntimeError(f"{res.reason}: {getattr(det, 'error_details', '')}")
        audio = np.frombuffer(res.audio_data, dtype=np.int16).astype(np.float32) / 32768.0
        # posições das palavras dentro do SSML (o texto começa depois do cabeçalho)
        base = len(cab)
        pal = []
        for a, b in _palavras(texto):
            ev = [e for e in eventos if base + a <= e[2] < base + b]
            if ev:
                pal.append({"t0": min(e[0] for e in ev), "t1": max(e[0] + e[1] for e in ev)})
            else:
                pal.append(None)
        _preencher(pal, audio.size / SR)
        return audio, pal, f"azure-sdk:{voz}"

    # ---------- API REST: áudio; tempos estimados ----------
    def _rest(self, texto, voz, taxa):
        _, ssml = self._ssml(texto, voz, taxa)
        req = urllib.request.Request(
            f"https://{self.host}/cognitiveservices/v1", data=ssml.encode("utf-8"), method="POST",
            headers={"Ocp-Apim-Subscription-Key": self.chave, "Content-Type": "application/ssml+xml",
                     "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm", "User-Agent": "video-narracao"})
        ctx = ssl.create_default_context(cafile=os.environ.get("SSL_CERT_FILE") or None)
        try:
            with urllib.request.urlopen(req, context=ctx, timeout=60) as r:
                dados = r.read()
        except Exception as e:  # noqa: BLE001
            raise SystemExit(
                f"Sem acesso ao Azure Speech em {self.host} ({e}).\n"
                "Adicione a chave nas configurações do ambiente (segredo de rede para esse host, "
                "cabeçalho Ocp-Apim-Subscription-Key) ou defina AZURE_SPEECH_KEY.")
        audio, sr = sf.read(io.BytesIO(dados), dtype="float32")
        assert sr == SR
        return audio, _alinhar_por_pausas(texto, audio), f"azure-rest:{voz}"


def _preencher(pal, dur):
    """completa palavras sem evento interpolando entre as vizinhas"""
    n = len(pal)
    for i in range(n):
        if pal[i] is None:
            prev = next((pal[j]["t1"] for j in range(i - 1, -1, -1) if pal[j]), 0.0)
            nxt = next((pal[j]["t0"] for j in range(i + 1, n) if pal[j]), dur)
            pal[i] = {"t0": prev, "t1": max(prev, nxt)}


def _alinhar_por_pausas(texto, audio):
    """Estima o tempo de cada palavra: as pausas do áudio são casadas com a pontuação
    (na ordem) e, dentro de cada frase, o tempo é dividido pelo número de vogais."""
    hop = int(0.01 * SR)
    env = np.sqrt(np.convolve(audio ** 2, np.ones(hop) / hop, "same")[::hop])
    voz = env > max(0.01, 0.08 * np.percentile(env, 95))
    # pausas internas > 120 ms
    pausas, i = [], 0
    while i < len(voz):
        if not voz[i]:
            j = i
            while j < len(voz) and not voz[j]:
                j += 1
            if i > 0 and j < len(voz) and (j - i) >= 12:
                pausas.append((i * 0.01, j * 0.01))
            i = j
        else:
            i += 1
    inicio = np.argmax(voz) * 0.01
    fim = (len(voz) - np.argmax(voz[::-1])) * 0.01
    spans = _palavras(texto)
    palavras = [texto[a:b] for a, b in spans]
    frases, atual = [], []
    for k, w in enumerate(palavras):
        atual.append(k)
        if re.search(r"[,.;:!?]$", w):
            frases.append(atual)
            atual = []
    if atual:
        frases.append(atual)
    # as pausas mais longas viram as divisões entre frases; se não houver pausas
    # suficientes, a fala inteira é tratada como um só bloco
    nd = len(frases) - 1
    if 0 < nd <= len(pausas):
        divs = sorted(sorted(pausas, key=lambda p: p[1] - p[0], reverse=True)[:nd])
        blocos = [(inicio if g == 0 else divs[g - 1][1], fim if g == nd else divs[g][0]) for g in range(nd + 1)]
    else:
        frases, blocos = [list(range(len(palavras)))], [(inicio, fim)]
    pal = [None] * len(palavras)
    for idx, (t0, t1) in zip(frases, blocos):
        pesos = np.array([max(1, len(re.findall(r"[aeiouáéíóúâêôãõà]", palavras[k].lower()))) for k in idx], float)
        cum = np.concatenate([[0], np.cumsum(pesos)]) / pesos.sum()
        for m, k in enumerate(idx):
            pal[k] = {"t0": t0 + cum[m] * (t1 - t0), "t1": t0 + cum[m + 1] * (t1 - t0)}
    return pal
