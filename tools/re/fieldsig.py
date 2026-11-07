#!/usr/bin/env python3
"""Read the playfield out of reference screenshots as text.

Classifies every 8x8 cell of the field crop by colour family so piece position
and shape can be compared without eyeballing contact sheets.

Usage: fieldsig.py /tmp/w_0.png /tmp/w_1.png ...
       fieldsig.py --prefix /tmp/w_ --n 18 [--crop 79,0,80,160]
"""
import argparse
import colorsys

CELL = 8


def load(a, i):
    from PIL import Image
    fx, fy, fw, fh = [int(v) for v in a.crop.split(",")]
    im = Image.open(f"{a.prefix}{i}.png" if a.prefix else a.files[i]).convert("RGB")
    return im.crop((fx, fy, fx + fw, fy + fh)), (fw, fh)


def classify(rgb):
    """Return a short name for a vivid piece colour, else None for background."""
    r, g, b = (v / 255 for v in rgb)
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    if s < 0.45 or v < 0.45:
        return None
    deg = h * 360
    if deg < 15 or deg >= 345:
        return "red"
    if deg < 45:
        return "orange"
    if deg < 70:
        return "yellow"
    if deg < 165:
        return "green"
    if deg < 200:
        return "cyan"
    if deg < 255:
        return "blue"
    if deg < 290:
        return "purple"
    if deg < 345:
        return "magenta"
    return None


def cells(im, size):
    fw, fh = size
    px = im.load()
    grid = {}
    for row in range(fh // CELL):
        for col in range(fw // CELL):
            samples = []
            for dy in (2, 4, 6):
                for dx in (2, 4, 6):
                    samples.append(classify(px[col * CELL + dx, row * CELL + dy]))
            votes = {c: samples.count(c) for c in set(samples) if c}
            if votes:
                best = max(votes, key=lambda c: (votes[c], c))
                if votes[best] >= 4:
                    grid[(row, col)] = best
    return grid


def render(grid, fh, fw):
    rows = fh // CELL
    cols = fw // CELL
    out = []
    for r in range(rows):
        line = "".join(grid.get((r, c), ".")[0] for c in range(cols))
        out.append(f"{r:2d} {line}")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="*")
    ap.add_argument("--prefix")
    ap.add_argument("--start", type=int, default=0)
    ap.add_argument("--n", type=int)
    ap.add_argument("--crop", default="79,0,80,160")
    a = ap.parse_args()
    n = a.n if a.n is not None else len(a.files)
    if a.prefix is None and not a.files:
        ap.error("give file names or --prefix/--n")
    for i in range(a.start, a.start + n):
        im, size = load(a, i)
        g = cells(im, size)
        counts = {}
        for colour in g.values():
            counts[colour] = counts.get(colour, 0) + 1
        name = (a.prefix + str(i) + ".png") if a.prefix else a.files[i - a.start]
        if not counts:
            print(f"--- {i}: (no vivid cells)")
            continue
        print(f"--- {name}  " + " ".join(f"{c}={n}" for c, n in
                                        sorted(counts.items(), key=lambda kv: -kv[1])))
        for line in render(g, size[1], size[0]):
            if any(ch != "." for ch in line[3:]):
                print(f"    {line}")


if __name__ == "__main__":
    main()
