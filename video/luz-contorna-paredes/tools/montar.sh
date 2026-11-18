#!/usr/bin/env bash
# Junta os trechos de vídeo renderizados, normaliza o áudio (-14 LUFS, pico -1,5 dBTP)
# e gera o arquivo final para redes sociais (H.264 + AAC, 1080x1920, 30 fps).
set -euo pipefail
cd "$(dirname "$0")/.."

SAIDA="saida/e-se-a-luz-contornasse-paredes.mp4"
mkdir -p saida

ls build/frames_*.mp4 | sort | sed "s#^build/#file '#; s#\$#'#" > build/trechos.txt
ffmpeg -v error -y -f concat -safe 0 -i build/trechos.txt -c copy build/video_sem_audio.mp4

# loudnorm em duas passagens
MED=$(ffmpeg -hide_banner -i build/mix.wav -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
val() { echo "$MED" | python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])"; }
AF="loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=$(val input_i):measured_TP=$(val input_tp):measured_LRA=$(val input_lra):measured_thresh=$(val input_thresh):offset=$(val target_offset):linear=true"

ffmpeg -v error -y -i build/video_sem_audio.mp4 -i build/mix.wav \
  -map 0:v:0 -map 1:a:0 \
  -c:v libx264 -preset slow -crf 20 -profile:v high -level 4.2 -pix_fmt yuv420p -r 30 \
  -af "$AF,aresample=48000" -c:a aac -b:a 192k \
  -movflags +faststart -shortest \
  -metadata title="E se a luz contornasse paredes como o som?" \
  -metadata comment="Princípios de difração reais; visão adaptada e alteração do comprimento de onda são recursos fictícios. Ref.: Ling, Sanny & Moebs (2016), University Physics Volume 3, OpenStax." \
  "$SAIDA"

ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate -of compact "$SAIDA"
