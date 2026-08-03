#!/usr/bin/env bash
#
# Import a photograph for the site.
#
#   ./scripts/import-photo.sh <source.jpg> <slug> [rotate]
#
# rotate: 90 | 180 | 270, omitted for none.
#
# WHY THIS EXISTS AS A SCRIPT
#
# Doing it by hand got it wrong once in a way that was invisible from the
# terminal. `sips` APPLIES a photo's EXIF orientation when it re-encodes, and
# then WRITES THE ORIENTATION TAG BACK OUT. So the pixels get rotated and the
# instruction to rotate survives — every viewer then rotates a second time. The
# file reports correct portrait dimensions the whole way through, so nothing
# looks wrong until you actually put eyes on the image.
#
# The fix is the last step: strip the APP1 segment entirely so the pixels stand
# alone with nothing left to reinterpret them. That also removes GPS and device
# identifiers, which is worth doing regardless — phone photos carry both, and
# republishing someone's camera serial because we forgot to re-encode is not a
# trade worth making.
#
# ALWAYS LOOK AT THE OUTPUT. Dimensions are not evidence of correct rotation.

set -euo pipefail

SRC="${1:?usage: import-photo.sh <source> <slug> [rotate]}"
SLUG="${2:?usage: import-photo.sh <source> <slug> [rotate]}"
ROTATE="${3:-}"

OUT="$(cd "$(dirname "$0")/.." && pwd)/public/photos"
mkdir -p "$OUT"
TMP="$(mktemp -t photoimport).jpg"
cp "$SRC" "$TMP"

[ -n "$ROTATE" ] && sips -r "$ROTATE" "$TMP" >/dev/null

# 1400 for the hero slot, 700 for phones. Quality 45 lands ~100KB at 700px,
# which is the size that actually matters on a trail with one bar of signal.
sips --resampleWidth 1400 -s format jpeg -s formatOptions 45 "$TMP" --out "$OUT/$SLUG-1400.jpg" >/dev/null
sips --resampleWidth 700  -s format jpeg -s formatOptions 45 "$TMP" --out "$OUT/$SLUG-700.jpg"  >/dev/null
rm -f "$TMP"

python3 - "$OUT/$SLUG-1400.jpg" "$OUT/$SLUG-700.jpg" <<'PY'
import sys

def strip_app1(data: bytes) -> bytes:
    """Drop every APP1 segment: EXIF orientation, GPS, device identifiers."""
    out, i = data[:2], 2
    while i < len(data) - 1:
        if data[i] != 0xFF:
            out += data[i:]; break
        marker = data[i + 1]
        if marker == 0xDA:                       # start of scan
            out += data[i:]; break
        if marker in (0xD8, 0xD9):
            out += data[i:i + 2]; i += 2; continue
        length = int.from_bytes(data[i + 2:i + 4], "big")
        if marker != 0xE1:
            out += data[i:i + 2 + length]
        i += 2 + length
    return out

for path in sys.argv[1:]:
    raw = open(path, "rb").read()
    clean = strip_app1(raw)
    open(path, "wb").write(clean)
    assert b"Exif" not in clean[:5000], f"{path}: EXIF survived"
    print(f"  {path.split('/')[-1]:36} {len(clean) // 1024:4}KB")
PY

echo "  ↳ now LOOK at the output. Correct dimensions do not mean correct rotation."
