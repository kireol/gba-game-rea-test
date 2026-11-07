#!/usr/bin/env python3
"""Field-column contact sheet with an 8px grid overlay.

Crop is the playfield only, so every panel answers "which cell is the piece in".
Usage: fgrid.py --prefix /tmp/w_ --n 18 --out /tmp/field_a.png [--crop 76,0,92,160]
"""
import argparse

from PIL import Image, ImageDraw, ImageFont

CELL = 8


def label_font(px):
    for size in (11, 10, 9, 8):
        try:
            f = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", size)
        except OSError:
            continue
        if all(f.getbbox(c)[3] <= px for c in "0123456789ABCDEFGH,.-x: "):
            return f
    return ImageFont.load_default()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prefix", default="/tmp/w_")
    ap.add_argument("--start", type=int, default=0)
    ap.add_argument("--n", type=int, required=True)
    ap.add_argument("--crop", default="76,0,92,160")
    ap.add_argument("--scale", type=int, default=5)
    ap.add_argument("--cols", type=int, default=6)
    ap.add_argument("--labels")
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    fx, fy, fw, fh = [int(v) for v in a.crop.split(",")]
    s, cell = a.scale, CELL * a.scale
    labels = a.labels.split(",") if a.labels else []
    panels = []
    for i in range(a.start, a.start + a.n):
        path = f"{a.prefix}{i}.png"
        im = Image.open(path).convert("RGB").crop((fx, fy, fx + fw, fy + fh))
        im = im.resize((fw * s, fh * s), Image.NEAREST)
        d = ImageDraw.Draw(im)
        for r in range(fh // CELL + 1):
            y = r * cell
            d.line((0, y, fw * s, y), width=1,
                   fill=(255, 0, 255) if r % 5 == 0 else (90, 90, 90))
        for c in range(fw // CELL + 1):
            x = c * cell
            d.line((x, 0, x, fh * s), width=1,
                   fill=(255, 0, 255) if c % 5 == 0 else (90, 90, 90))
        panels.append((path, im))

    w, h = panels[0][1].width, panels[0][1].height
    rows = (len(panels) + a.cols - 1) // a.cols
    sheet = Image.new("RGB", (w * a.cols, (h + 20) * rows), (12, 12, 12))
    fnt = label_font(16)
    for i, (path, im) in enumerate(panels):
        cx, cy = (i % a.cols) * w, (i // a.cols) * (h + 20)
        sheet.paste(im, (cx, cy + 20))
        d = ImageDraw.Draw(sheet)
        cap = f"#{i}: {path.rsplit('/', 1)[-1]}"
        if len(labels) > i:
            cap += f"  [{labels[i]}]"
        d.text((cx + 2, cy + 3), cap, font=fnt, fill=(255, 255, 255))
    sheet.save(a.out)
    print(f"wrote {a.out}: {len(panels)} panels, cell={CELL}px native "
          f"({cell}px scaled), crop={a.crop}, crop_x0={fx}")


if __name__ == "__main__":
    main()
