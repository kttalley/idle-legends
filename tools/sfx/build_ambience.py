"""Build public/audio/ambience/ from CC0 nature recordings, following tools/sfx/ambience.json.

    python3 -I tools/sfx/build_ambience.py park=<dir> crickets=<dir> swamp=<dir> loops=<dir>

Each bed is cut from its recording, mixed to mono, high-passed at 150 Hz (traffic and
handling rumble live down there, and a bed this quiet needs none of it) and gently
low-passed at 8 kHz, then encoded as 22.05 kHz AAC (.m4a, ~48 kbps): a 30 s bed is about
180 KB. AAC's priming silence doesn't matter here because ambience.ts never butts one pass
against the next — it crossfades overlapping passes — so a few ms at either edge vanish
under the fade.

Window choice, for beds with no fixed `start`: the recording is measured in 250 ms RMS
steps and every `seconds`-long window scored by how much its loudness varies plus how far
its loudest moment rises above its median. The lowest score is the steadiest stretch —
the one least likely to hold a voice, a bark or a car.
"""
import json, os, subprocess, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(REPO, 'public', 'audio', 'ambience')
AUDIO = ('.wav', '.ogg', '.mp3', '.flac')


def find(folder, name):
    for dp, _, fns in os.walk(folder):
        for f in fns:
            if f.lower().endswith(AUDIO) and os.path.splitext(f)[0] == name:
                return os.path.join(dp, f)
    return None


def steadiest(path, seconds):
    sr = 8000
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-af', 'highpass=f=150',
                          '-ar', str(sr), '-f', 's16le', '-'], check=True, capture_output=True).stdout
    a = np.frombuffer(raw, dtype='<i2').astype(np.float64) / 32768
    hop = sr // 4
    db = np.array([20 * np.log10(np.sqrt(np.mean(a[i:i + hop] ** 2)) + 1e-9)
                   for i in range(0, len(a) - hop, hop)])
    span = int(seconds * 4)
    best, best_at = None, 0
    for start in range(0, len(db) - span, 4):
        w = db[start:start + span]
        med = np.median(w)
        if med < -55:
            continue
        score = np.std(w) + 0.5 * max(0.0, w.max() - med - 6)
        if best is None or score < best:
            best, best_at = score, start / 4
    return best_at, best


def main():
    packs = dict(arg.split('=', 1) for arg in sys.argv[1:] if '=' in arg)
    spec = json.load(open(os.path.join(HERE, 'ambience.json')))
    missing = set(spec['packs']) - set(packs)
    if missing:
        sys.exit(f'missing pack folders: {", ".join(sorted(missing))}\n\n{__doc__}')
    os.makedirs(OUT, exist_ok=True)
    manifest, total = {}, 0
    for bed, b in spec['beds'].items():
        pack, name = b['file'].split(':', 1)
        src = find(packs[pack], name)
        if not src:
            sys.exit(f'{bed}: {name} is not in pack {pack}')
        start = b.get('start')
        note = ''
        if start is None:
            start, score = steadiest(src, b['seconds'])
            note = f' (steadiest window, score {score:.2f})'
        out = os.path.join(OUT, f'{bed}.m4a')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{start}', '-t', f"{b['seconds']}",
                        '-i', src, '-ac', '1', '-af', 'highpass=f=150,lowpass=f=8000,loudnorm=I=-23:TP=-2',
                        '-ar', '22050', '-c:a', 'aac', '-b:a', '48k', out], check=True)
        total += os.path.getsize(out)
        manifest[bed] = f'{bed}.m4a'
        print(f'{bed:9s} {name} @ {start:.1f}s for {b["seconds"]}s{note}')
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
    print(f'{len(manifest)} beds, {total / 1024:.0f} KB -> {os.path.relpath(OUT, REPO)}')


main()
