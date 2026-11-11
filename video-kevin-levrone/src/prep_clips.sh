#!/bin/bash
# Extrae tramos del vídeo adicional como secuencias JPG (30 fps, recorte 4:3, 960x704)
set -e
SRC=work/clip.mp4
while read name ss dur; do
  mkdir -p assets/clips/$name
  ffmpeg -nostdin -v error -y -ss $ss -t $dur -i $SRC -vf "crop=480:352:80:4,fps=30,scale=960:704:flags=lanczos,unsharp=5:5:0.6" -q:v 4 assets/clips/$name/%04d.jpg
  echo "$name $(ls assets/clips/$name | wc -l)"
done <<'L'
carga 24 5
banca_top 32 5
cara_tumbado 92 5
discos 136 5
sentado 160 8
press1 216 8
press2 244 8
cara1 304 8
vendas 316 7
pies 352 7
barra 428 5
press3 440 8
hombro 772 10
cara2 800 8
cara3 852 8
torso 893 7
dobleb 912 12
espalda 940 8
L
