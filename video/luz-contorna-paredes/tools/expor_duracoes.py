"""Cria kokoro-v1.0-dur.onnx: o mesmo modelo Kokoro v1.0, com a duração prevista de
cada fonema (em quadros de 600 amostras) exposta como segunda saída.

Uso: python3 tools/expor_duracoes.py <pasta_dos_modelos>
Modelo original: https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
"""
import os
import sys

import onnx
from onnx import helper

pasta = sys.argv[1]
m = onnx.load(os.path.join(pasta, "kokoro-v1.0.onnx"))
cast = next(n for n in m.graph.node if n.name == "/encoder/Cast")  # Round -> Clip -> Cast(int64)
tipo = next(a.i for a in cast.attribute if a.name == "to")
m.graph.output.append(helper.make_tensor_value_info(cast.output[0], tipo, None))
onnx.save(m, os.path.join(pasta, "kokoro-v1.0-dur.onnx"))
print("ok")
