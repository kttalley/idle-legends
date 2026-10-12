"""Build public/audio/sfx/ from CC0 sample packs, following tools/sfx/cues.json.

    python3 -I tools/sfx/build.py rpg80=<dir> woodmetal=<dir> kenney=<dir> swords=<dir> \\
        magic=<dir> retro=<dir>

The packs are not in the repo (tens of MB, and only a few dozen files are used). Their
download pages are listed under "packs" in cues.json; unzip each anywhere and pass
name=folder. Files are found anywhere under the folder by name, without extension.

Every source goes through one chain, chosen to make recorded foley sit with pixel art the
way a 16-bit console's sampled sound did, rather than sounding like a modern film:

  ffmpeg  mono → high-pass 60 Hz (rumble) → low-pass 5.5 kHz (the "too high, too saw-like"
          top end of v1) → resample to 16 kHz → 12-bit quantization (the grain)
  python  strip leading/trailing silence below -50 dB → cut to the cue's `max` seconds if
          set, with a 60 ms fade → 8 ms fade-out so the trim can't click → peak-normalize
          to -1 dBFS

Loudness between cues is then the `gain` in cues.json, applied at play time by
src/engine/audio/sfx.ts, which also low-passes and levels the whole effects bus. Output is
16-bit PCM WAV: it decodes everywhere with no codec delay (AAC adds ~50 ms of priming
silence, enough to make a hit feel late).

Writes public/audio/sfx/<pack>_<file>.wav for every source named in cues.json, plus
manifest.json (cue -> urls + gain), which is what the game loads.
"""
import json, os, re, subprocess, sys, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(REPO, 'public', 'audio', 'sfx')
SR = 16000
CHAIN = 'highpass=f=60,lowpass=f=5500,aresample=16000,acrusher=bits=12:mode=lin:mix=1:aa=1'
AUDIO = ('.wav', '.ogg', '.mp3', '.flac')


def index_pack(folder):
    found = {}
    for dp, _, fns in os.walk(folder):
        if '__MACOSX' in dp:
            continue
        for f in fns:
            if f.lower().endswith(AUDIO):
                found.setdefault(os.path.splitext(f)[0], os.path.join(dp, f))
    return found


def decode(path):
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-af', CHAIN,
         '-ar', str(SR), '-f', 's16le', '-'],
        check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype='<i2').astype(np.float64) / 32768


def process(a, max_s):
    peak = np.abs(a).max()
    if peak <= 0:
        raise ValueError('silent file')
    on = np.where(np.abs(a) > peak * 10 ** (-50 / 20))[0]
    a = a[on[0]:on[-1] + 1].copy()
    if max_s and len(a) > max_s * SR:
        a = a[:int(max_s * SR)]
        fade = min(len(a), int(0.06 * SR))
        a[-fade:] *= np.linspace(1, 0, fade)
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
    packs = dict(arg.split('=', 1) for arg in sys.argv[1:] if '=' in arg)
    spec = json.load(open(os.path.join(HERE, 'cues.json')))
    missing = set(spec['packs']) - set(packs)
    if missing:
        sys.exit(f'missing pack folders: {", ".join(sorted(missing))}\n\n{__doc__}')
    indexes = {name: index_pack(folder) for name, folder in packs.items()}

    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith('.wav'):
            os.remove(os.path.join(OUT, f))
    manifest, total, done = {}, 0, set()
    for cue, c in spec['cues'].items():
        urls = []
        for ref in c['files']:
            pack, name = ref.split(':', 1)
            src = indexes[pack].get(name)
            if not src:
                sys.exit(f'{cue}: {name} is not in pack {pack}')
            out_name = re.sub(r'[^A-Za-z0-9_]+', '_', f'{pack}_{name}') + '.wav'
            if out_name not in done:
                out = os.path.join(OUT, out_name)
                write(out, process(decode(src), c.get('max')))
                total += os.path.getsize(out)
                done.add(out_name)
            urls.append(out_name)
        manifest[cue] = {'files': urls, 'gain': c['gain']}
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
    print(f'{len(manifest)} cues, {len(done)} files, {total / 1024:.0f} KB -> {os.path.relpath(OUT, REPO)}')


main()
