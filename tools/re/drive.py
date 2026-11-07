#!/usr/bin/env python3
"""Drive the reference emulator through a comma-separated step list.

Research tooling for menu/behaviour mapping. Steps:
    <KEYS>:<hold>:<release>   queue a press, e.g. "A:3:8" or "Down,Left:5:5"
    wait:<seconds>            let the emulator run in real time
    shot:<path.png>           screenshot
    frame                     print the frame counter
    read:<addr>:<len>         hex dump
    adv:<n>                   step n frames

Example:
    python3 tools/re/drive.py "B:3:10,wait:0.6,shot:/tmp/m.png,frame"
"""

import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from bridge import Bridge  # noqa: E402


def main(steps):
    b = Bridge()
    try:
        for step in steps.split(","):
            step = step.strip()
            if not step:
                continue
            if step == "frame":
                print("frame", b.frame())
                continue
            name, _, arg = step.partition(":")
            if name == "wait":
                end_wait = float(arg)
                b.wait(end_wait)
            elif name == "shot":
                print(b.screenshot(arg))
            elif name == "adv":
                print("frame", b.advance(int(arg)))
            elif name == "read":
                addr, _, ln = arg.partition(":")
                data = b.read(int(addr, 0), int(ln))
                print(" ".join(f"{x:02X}" for x in data))
            else:
                parts = arg.split(":") if arg else []
                hold = int(parts[0]) if parts else 3
                rel = int(parts[1]) if len(parts) > 1 else 8
                print(b.press(name.split(","), hold, rel))
    finally:
        b.close()


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "")
