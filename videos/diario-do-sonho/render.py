"""Renderiza os quadros em paralelo (Cairo -> ffmpeg) e junta com o áudio.

Uso:  python3 render.py [saida.mp4] [--jobs N] [--from S --to S]
"""
import argparse
import multiprocessing as mp
import os
import subprocess
import time

FPS = 30


def _worker(args):
    idx, f0, f1, out = args
    import scenes
    scenes.load()
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "bgra", "-s", "1080x1920", "-r", str(FPS),
           "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "19", "-tune", "animation",
           "-pix_fmt", "yuv420p", "-r", str(FPS), out]
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE)
    for f in range(f0, f1):
        s = scenes.frame(f / FPS)
        s.flush()
        p.stdin.write(bytes(s.get_data()))
    p.stdin.close()
    p.wait()
    return idx, f1 - f0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out", nargs="?", default="out/diario-do-sonho.mp4")
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 4)
    ap.add_argument("--from", dest="t0", type=float, default=0.0)
    ap.add_argument("--to", dest="t1", type=float, default=None)
    ap.add_argument("--mux-only", action="store_true", help="só junta os segmentos já renderizados com o áudio")
    a = ap.parse_args()

    import json
    with open("build/timeline.json") as f:
        tl = json.load(f)
    n = tl["nframes"]
    f0 = int(a.t0 * FPS)
    f1 = n if a.t1 is None else min(n, int(a.t1 * FPS))
    os.makedirs("build/seg", exist_ok=True)
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    nchunks = max(a.jobs * 3, 1)
    step = max(1, (f1 - f0 + nchunks - 1) // nchunks)
    jobs = []
    for i, s in enumerate(range(f0, f1, step)):
        jobs.append((i, s, min(f1, s + step), f"build/seg/seg_{i:03d}.mp4"))
    t = time.time()
    done = 0
    if a.mux_only:
        jobs = jobs if all(os.path.exists(j[3]) for j in jobs) else []
        assert jobs, "segmentos ausentes: rode sem --mux-only"
    with mp.Pool(a.jobs if not a.mux_only else 1) as pool:
        if a.mux_only:
            jobs_to_run = []
        else:
            jobs_to_run = jobs
        for idx, k in pool.imap_unordered(_worker, jobs_to_run):
            done += k
            print(f"  {done}/{f1 - f0} quadros  ({time.time() - t:.0f}s)", flush=True)
    with open("build/seg/list.txt", "w") as f:
        for j in jobs:
            f.write(f"file '{os.path.basename(j[3])}'\n")
    dur = (f1 - f0) / FPS
    cmd = ["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", "build/seg/list.txt",
           "-ss", f"{f0 / FPS:.3f}", "-t", f"{dur:.3f}", "-i", "build/mix.wav",
           "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
           "-t", f"{dur:.3f}", "-movflags", "+faststart", a.out]
    subprocess.run(cmd, check=True)
    print("ok ->", a.out, f"({dur:.2f}s, {time.time() - t:.0f}s de render)")


if __name__ == "__main__":
    main()
