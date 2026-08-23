#!/usr/bin/env bash
# Squeeze a screen recording under App Store Connect's 50 MB attachment cap.
#
#   tools/compress-recording.sh ~/Downloads/whatever.mov [target_mb]
#
# Writes <name>-review.mp4 beside the source. Two-pass H.264 at a bitrate computed from the
# actual duration, so the result lands near the target instead of being guessed at — a
# fixed CRF on a 3-minute 1080p capture can still blow past 50 MB.
#
# Screen recordings compress extremely well (flat colour, few real scene changes), so the
# picture stays legible even at these rates. Audio is dropped: App Review does not need it
# and it is pure budget.
set -euo pipefail
SRC="${1:?usage: compress-recording.sh <file> [target_mb]}"
TARGET_MB="${2:-45}"
[ -f "$SRC" ] || { echo "no such file: $SRC" >&2; exit 1; }

DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$SRC")
DUR=${DUR%.*}
[ "$DUR" -gt 0 ] 2>/dev/null || { echo "could not read duration" >&2; exit 1; }

# bits available / seconds, with 6% headroom for container overhead
BITRATE=$(( (TARGET_MB * 8 * 1024 * 1024 * 94 / 100) / DUR ))
OUT="${SRC%.*}-review.mp4"

echo "source   : $(basename "$SRC")  $(du -h "$SRC" | cut -f1)  ${DUR}s"
echo "target   : ${TARGET_MB} MB  ->  $((BITRATE/1000)) kbps"

# -vf scale: cap the long edge at 1280. A phone capture is 1170x2532 or larger; Apple only
# needs to SEE the flow, and halving the dimension is the cheapest bitrate win available.
ffmpeg -v error -y -i "$SRC" -c:v libx264 -b:v "$BITRATE" -pass 1 -an \
  -vf "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'" \
  -preset medium -f mp4 /dev/null
ffmpeg -v error -y -i "$SRC" -c:v libx264 -b:v "$BITRATE" -pass 2 -an \
  -vf "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'" \
  -preset medium -movflags +faststart "$OUT"
rm -f ffmpeg2pass-0.log ffmpeg2pass-0.log.mbtree

echo "result   : $(basename "$OUT")  $(du -h "$OUT" | cut -f1)"
SIZE=$(stat -f%z "$OUT")
if [ "$SIZE" -gt $((50*1024*1024)) ]; then
  echo "STILL OVER 50 MB — rerun with a lower target, e.g. $0 \"$SRC\" 30" >&2
  exit 1
fi
echo "under the 50 MB cap, ready to attach"
