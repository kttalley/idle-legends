"""Build public/audio/sfx/ from the CC0 retro pack, following tools/sfx/cues.json.

    python3 -I tools/sfx/build.py "<path to the unzipped 512-sound pack>"

The pack itself is not in the repo (27 MB, and only ~40 files are used). Download it from
the URL in cues.json, unzip it anywhere, and point this at the folder.

Each source file is: mixed to mono, resampled to 22050 Hz (the pack's 44.1 kHz carries
nothing a chiptune needs above 11 kHz, and it halves the size), stripped of leading and
trailing silence below -50 dB, faded out over its last 8 ms so the trim can't click, and
peak-normalized to -1 dBFS. Loudness differences between cues are then the job of the
`gain` in cues.json, which src/engine/audio/sfx.ts applies at play time. The output is
16-bit PCM WAV, which every WebView decodes with no codec delay: AAC adds ~50 ms of
priming silence, which is long enough to make a hit feel late.

Writes public/audio/sfx/<file>.wav for every file named in cues.json, plus manifest.json
(cue -> urls + gain), which is what the game loads.
"""
import json, os, sys, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(REPO, 'public', 'audio', 'sfx')
SR = 22050


def load(path):
    w = wave.open(path)
    n, sr, ch, sw = w.getnframes(), w.getframerate(), w.getnchannels(), w.getsampwidth()
    raw = w.readframes(n)
    w.close()
    if sw == 2:
        a = np.frombuffer(raw, dtype='<i2').astype(np.float64) / 32768
    elif sw == 1:
        a = (np.frombuffer(raw, dtype=np.uint8).astype(np.float64) - 128) / 128
    else:
        raise ValueError(f'{path}: unsupported sample width {sw}')
    return a.reshape(-1, ch).mean(1), sr


def resample(a, sr):
    if sr == SR:
        return a
    n = int(round(len(a) * SR / sr))
    return np.interp(np.linspace(0, len(a) - 1, n), np.arange(len(a)), a)


def process(a):
    peak = np.abs(a).max()
    if peak <= 0:
        raise ValueError('silent file')
    on = np.where(np.abs(a) > peak * 10 ** (-50 / 20))[0]
    a = a[on[0]:on[-1] + 1]
    fade = min(len(a), int(0.008 * SR))
    a[-fade:] *= np.linspace(1, 0, fade)
    return a * (10 ** (-1 / 20) / np.abs(a).max())


def write(path, a):
    pcm = np.clip(np.round(a * 32767), -32768, 32767).astype('<i2')
    w = wave.open(path, 'wb')
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes(pcm.tobytes())
    w.close()


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    pack = sys.argv[1]
    index = {}
    for dp, _, fns in os.walk(pack):
        for f in fns:
            if f.endswith('.wav'):
                index[f[:-4]] = os.path.join(dp, f)
    cues = json.load(open(os.path.join(HERE, 'cues.json')))['cues']
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith('.wav'):
            os.remove(os.path.join(OUT, f))
    manifest, total = {}, 0
    for cue, spec in cues.items():
        urls = []
        for name in spec['files']:
            if name not in index:
                sys.exit(f'{cue}: {name}.wav is not in the pack')
            a, sr = load(index[name])
            out = os.path.join(OUT, f'{name}.wav')
            write(out, process(resample(a, sr)))
            total += os.path.getsize(out)
            urls.append(f'{name}.wav')
        manifest[cue] = {'files': urls, 'gain': spec['gain']}
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
    n = len({u for m in manifest.values() for u in m['files']})
    print(f'{len(manifest)} cues, {n} files, {total / 1024:.0f} KB -> {os.path.relpath(OUT, REPO)}')


main()
