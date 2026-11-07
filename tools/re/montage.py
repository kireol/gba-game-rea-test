#!/usr/bin/env python3
"""Compose reference-emulator screenshots into one labelled contact sheet.

Screenshots come back at the reference display's native resolution, which is too
small to read reliably one at a time. This tiles them (optionally cropped to the
region that matters, e.g. the HUD) and upscales with nearest neighbour so pixel
detail survives, printing the panel order so the sheet can be read in one go.

    python3 tools/re/montage.py --shots /tmp/n_0.png,/tmp/n_1.png --crop 95,85,135,30 \
        --scale 4 --cols 4 --out /tmp/level.png
"""

import argparse

from PIL import Image, ImageDraw


def label(img, text, scale):
    """Stamp a short caption above a panel, drawn big enough to stay legible."""
    bar_h = 14 * scale
    out = Image.new("RGB", (img.width, img.height + bar_h), (8, 8, 8))
    out.paste(img, (0, bar_h))
    d = ImageDraw.Draw(out)
    # The built-in bitmap font is 6x11; scaling the tile keeps captions readable.
    txt = Image.new("L", (len(text) * 6 + 2, 13), 0)
    td = ImageDraw.Draw(txt)
    td.text((1, 1), text, fill=255)
    out.paste(txt.resize((txt.width * scale, txt.height * scale), Image.NEAREST), (2, 1))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shots", required=True, help="comma separated png paths, in order")
    ap.add_argument("--crop", help="x,y,w,h in native pixels applied to every panel")
    ap.add_argument("--scale", type=int, default=2)
    ap.add_argument("--cols", type=int, default=3)
    ap.add_argument("--out", required=True)
    ap.add_argument("--labels", help="comma separated caption per panel (default: basename)")
    a = ap.parse_args()

    paths = [p for p in a.shots.split(",") if p]
    labels = a.labels.split(",") if a.labels else [p.rsplit("/", 1)[-1] for p in paths]
    panels = []
    for p, cap in zip(paths, labels):
        img = Image.open(p).convert("RGB")
        if a.crop:
            x, y, w, h = (int(v) for v in a.crop.split(","))
            img = img.crop((x, y, x + w, y + h))
        s = a.scale
        img = img.resize((img.width * s, img.height * s), Image.NEAREST)
        panels.append(label(img, cap, min(s, 2)))

    w = max(p.width for p in panels)
    h = max(p.height for p in panels)
    rows = (len(panels) + a.cols - 1) // a.cols
    sheet = Image.new("RGB", (w * a.cols, h * rows), (10, 10, 10))
    for i, p in enumerate(panels):
        sheet.paste(p, ((i % a.cols) * w, (i // a.cols) * h))
    sheet.save(a.out)
    print(f"{a.out}: {len(panels)} panels, {a.cols} per row, L->R top->bottom:")
    for i, (p, cap) in enumerate(zip(paths, labels)):
        print(f"  [{i}] {cap}  {p}")


if __name__ == "__main__":
    main()
