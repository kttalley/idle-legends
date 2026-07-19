#!/usr/bin/env python3
"""Dev-only scaffold: dump ANY FFTA unit's animation poses — monsters included — via the
decomp's fully static U4/U8 chain (per-frame metasprite offsets, byte-true palettes).
Imports the sibling decomp repo READ-ONLY; writes only to gitignored local-assets/.
Nothing produced here may be committed or shipped (PLAN.md "Placeholder art policy").

Usage:
  python3 tools/scaffold/dump_ffta_unit.py --list [filter]      # jobs: id, gid, name, race
  python3 tools/scaffold/dump_ffta_unit.py <gid> [out_prefix] [--bank N] [--poses a,b,c]
Emits per pose: <out_prefix>_p<pose>.png (frames in a row, scale 1, RGBA transparent).
"""
import os
import struct
import sys
import zlib

DECOMP = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "ff-tactics-decomp"))
OBJ_PAL_TABLE = 0x08419D60


def write_png_rgba(path, w, h, rows):
    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xFFFFFFFF)
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for (r, g, b, a) in rows[y]:
            raw += bytes((r, g, b, a))
    out = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    out += chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(out)


def main():
    for sub in ("tools", "verify", "reimpl"):
        sys.path.insert(0, os.path.join(DECOMP, sub))
    import gbagfx as g            # noqa: E402
    import ffta_text as ftx       # noqa: E402
    import roster_static as rst   # noqa: E402

    with open(os.path.join(DECOMP, "Final Fantasy - Tactics Advanced # GBA.GBA"), "rb") as f:
        rom = f.read()

    if "--list" in sys.argv:
        filt = next((a.lower() for a in sys.argv[2:] if not a.startswith("--")), "")
        names = ftx.name_table(rom)
        for j in ftx.job_table(rom, names):
            if j["sprite"] == 0xFFFF or not j.get("name") or j["name"] == "-":
                continue
            if filt and filt not in j["name"].lower():
                continue
            print("job %3d  gid %3d  pal %02x  %-16s %s" % (
                j["id"], j["sprite"], j.get("pal", 0), j.get("race", "?"), j["name"]))
        return 0

    gid = int(sys.argv[1])
    prefix = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith("--") \
        else "local-assets/ffta-scaffold/raw/gid%d" % gid
    os.makedirs(os.path.dirname(prefix), exist_ok=True)

    r = rst.resolve(rom, gid)
    if not r:
        print("gid %d: no static sheet binding" % gid)
        return 1
    print("gid %d: %d poses, pose0 %d frames, tilecount %d" % (
        gid, r["poses"], r["frame_count"], r["tilecount"]))

    # Byte-true colors: the first job wearing this gid gives pal_set (dict-LZ archive) +
    # battle slot (hi nibble of pal). --bank N falls back to the legacy OBJ preview table.
    pal = None
    if "--bank" in sys.argv:
        bank = int(sys.argv[sys.argv.index("--bank") + 1]) & 0xF
        off = OBJ_PAL_TABLE - g.ROM_BASE + bank * 0x20
        pal = [((c & 31) << 3, ((c >> 5) & 31) << 3, ((c >> 10) & 31) << 3)
               for c in struct.unpack_from("<16H", rom, off)]
    else:
        import palarc  # noqa: E402
        job = next((j for j in ftx.job_table(rom) if j["sprite"] == gid and j["name"] and j["name"] != "-"), None)
        if job is not None:
            slot = (job["pal"] >> 4) & 0xF
            if "--slot" in sys.argv:
                slot = int(sys.argv[sys.argv.index("--slot") + 1])
            pal = palarc.slot_colors(palarc.decode_set(rom, job["pal_set_a"]), slot)
            print("  palette: set %d slot %d (job %d %s)" % (job["pal_set_a"], slot, job["id"], job["name"]))
    if pal is None:
        off = OBJ_PAL_TABLE - g.ROM_BASE
        pal = [((c & 31) << 3, ((c >> 5) & 31) << 3, ((c >> 10) & 31) << 3)
               for c in struct.unpack_from("<16H", rom, off)]

    wanted = None
    if "--poses" in sys.argv:
        wanted = [int(x) for x in sys.argv[sys.argv.index("--poses") + 1].split(",")]

    combine = "--combine" in sys.argv
    combined = []
    cfw = cfh = 0
    FS_LO, FS_HI = rst.FS_LO, rst.FS_HI
    for pose in range(r["poses"]):
        if wanted is not None and pose not in wanted:
            continue
        fs = rst.u32(rom, r["pose_table"] + pose * 0xC)
        if not (FS_LO <= fs < FS_HI):
            continue
        cnt = rst.u32(rom, fs)
        if not (1 <= cnt <= 64):
            continue
        frames = []
        fw = fh = 0
        for k in range(cnt):
            sheet_off = rst.u32(rom, fs + 4 + k * 0x14)
            ms_off = rst.u32(rom, fs + 4 + k * 0x14 + 4)
            if ms_off == 0xFFFFFFFF or ms_off >= 0x10000 or sheet_off >= 0x200000:
                continue
            try:
                w, h, img = rst.render_unit(rom, rst.METASPRITE_BASE + ms_off, pal,
                                            rst.REGION_BASE + sheet_off, r["tilecount"])
            except Exception:
                continue
            frames.append(img)
            fw, fh = max(fw, w), max(fh, h)
        if not frames:
            continue
        if combine:
            print("  pose %2d: frames %d..%d" % (pose, len(combined), len(combined) + len(frames) - 1))
            combined.extend(frames)
            cfw, cfh = max(cfw, fw), max(cfh, fh)
            continue
        rows = [[(0, 0, 0, 0)] * (fw * len(frames)) for _ in range(fh)]
        for i, img in enumerate(frames):
            for y in range(min(len(img), fh)):
                for x in range(min(len(img[y]), fw)):
                    c = img[y][x]
                    if c is not None:
                        rows[y][i * fw + x] = (c[0], c[1], c[2], 255)
        out = "%s_p%d.png" % (prefix, pose)
        write_png_rgba(out, fw * len(frames), fh, rows)
        print("  pose %2d: %2d frames %dx%d -> %s" % (pose, len(frames), fw, fh, out))

    if combine and combined:
        rows = [[(0, 0, 0, 0)] * (cfw * len(combined)) for _ in range(cfh)]
        for i, img in enumerate(combined):
            for y in range(min(len(img), cfh)):
                for x in range(min(len(img[y]), cfw)):
                    c = img[y][x]
                    if c is not None:
                        rows[y][i * cfw + x] = (c[0], c[1], c[2], 255)
        out = "%s_sheet.png" % prefix
        write_png_rgba(out, cfw * len(combined), cfh, rows)
        print("  combined: %d frames %dx%d -> %s" % (len(combined), cfw, cfh, out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
