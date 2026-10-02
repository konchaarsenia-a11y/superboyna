#!/usr/bin/env python3
"""Knock out the near-white canvas of assets/logo.png and write RGBA favicons.

Flood-fill from the edges so white in the sneaker/gloves stays opaque.
"""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
LOGO = ROOT / "web" / "assets" / "logo.png"
OUT_ICO = ROOT / "web" / "favicon.ico"
OUT_32 = ROOT / "web" / "assets" / "favicon-32.png"
OUT_APPLE = ROOT / "web" / "assets" / "apple-touch-icon.png"

WHITE_THRESH = 36  # per-channel distance from 255


def is_bg(px, x, y) -> bool:
    r, g, b, a = px[x, y]
    if a == 0:
        return True
    return (255 - r) <= WHITE_THRESH and (255 - g) <= WHITE_THRESH and (255 - b) <= WHITE_THRESH


def knockout(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    q = deque()

    def push(x, y):
        if 0 <= x < w and 0 <= y < h and not seen[y * w + x]:
            seen[y * w + x] = 1
            q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)

    while q:
        x, y = q.popleft()
        if not is_bg(px, x, y):
            continue
        r, g, b, _a = px[x, y]
        px[x, y] = (r, g, b, 0)
        push(x + 1, y)
        push(x - 1, y)
        push(x, y + 1)
        push(x, y - 1)

    # Soften anti-aliased fringe next to cleared pixels
    fringe = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            near_clear = False
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                    near_clear = True
                    break
            if not near_clear:
                continue
            dist = (255 - r) + (255 - g) + (255 - b)
            if dist <= WHITE_THRESH * 3:
                fade = max(0, 255 - int(dist * 2.2))
                fringe.append((x, y, r, g, b, fade))
    for x, y, r, g, b, a in fringe:
        px[x, y] = (r, g, b, a)
    return im


def fit_square(im: Image.Image, size: int) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    scaled = im.copy()
    scaled.thumbnail((size, size), Image.Resampling.LANCZOS)
    x = (size - scaled.width) // 2
    y = (size - scaled.height) // 2
    canvas.paste(scaled, (x, y), scaled)
    return canvas


def write_ico(path: Path, images: list[Image.Image]) -> None:
    """Write a PNG-compressed ICO (Vista+) so every size keeps RGBA."""
    import io
    import struct

    blobs = []
    for im in images:
        buf = io.BytesIO()
        im.save(buf, format="PNG")
        blobs.append((im.size[0], im.size[1], buf.getvalue()))

    offset = 6 + 16 * len(blobs)
    out = bytearray()
    out += struct.pack("<HHH", 0, 1, len(blobs))
    for w, h, data in blobs:
        out += struct.pack(
            "<BBBBHHII",
            w if w < 256 else 0,
            h if h < 256 else 0,
            0,
            0,
            1,
            32,
            len(data),
            offset,
        )
        offset += len(data)
    for _w, _h, data in blobs:
        out += data
    path.write_bytes(out)


def main() -> None:
    rgba = knockout(Image.open(LOGO))
    fit_square(rgba, 32).save(OUT_32, "PNG")
    fit_square(rgba, 180).save(OUT_APPLE, "PNG")
    write_ico(
        OUT_ICO,
        [fit_square(rgba, s) for s in (16, 32, 48)],
    )
    # sanity: corners of 32px must be transparent
    sample = Image.open(OUT_32)
    assert sample.mode == "RGBA", sample.mode
    for xy in ((0, 0), (31, 0), (0, 31), (31, 31)):
        a = sample.getpixel(xy)[3]
        assert a == 0, (xy, sample.getpixel(xy))
    print("wrote", OUT_ICO, OUT_32, OUT_APPLE)


if __name__ == "__main__":
    main()
