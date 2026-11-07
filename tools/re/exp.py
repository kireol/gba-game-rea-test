#!/usr/bin/env python3
"""Frame-accurate experiment runner for the reference emulator.

Everything runs inside one process so the gap between steps is a handful of
frames instead of the seconds an interactive session would waste. Each step is
timestamped with the emulated frame counter, which is the only trustworthy
clock: the emulator keeps running between tool calls.

Step list (comma separated):
    load:<state.ss>          restore a savestate
    save:<state.ss>          write a savestate
    adv:<n>                  step n frames (plus whatever real time costs)
    hold:<KEYS>:<frames>     hold buttons for n frames, then release
    tap:<KEYS>:<hold>:<rel>  queued press
    shot:<path.png>          screenshot; logged with its frame stamp
    read:<addr>:<len>        hex dump, logged
    info                     print emulator info

Example:
    python3 tools/re/exp.py "load:/tmp/base.ss,tap:B:2:6,shot:/tmp/e_1.png,adv:60,shot:/tmp/e_2.png"
"""

import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])
from bridge import Bridge  # noqa: E402


def run(script):
    b = Bridge()
    log = []
    try:
        for step in script.split(","):
            step = step.strip()
            if not step:
                continue
            name, _, arg = step.partition(":")
            f = b.frame()
            if name == "load":
                b.load_state(arg)
            elif name == "save":
                b.save_state(arg)
            elif name == "reset":
                b.reset()
            elif name == "sleep":
                b.wait(float(arg))
            elif name == "adv":
                b.wait_frames(int(arg))
            elif name == "hold":
                keys, frames = arg.split(":")
                b.press(keys.split(","), int(frames), 2)
                b.wait_frames(int(frames) + 4)
            elif name == "tap":
                parts = arg.split(":")
                hold = int(parts[1]) if len(parts) > 1 else 2
                rel = int(parts[2]) if len(parts) > 2 else 6
                b.press(parts[0].split(","), hold, rel)
                b.wait_frames(hold + rel + 8)
            elif name == "shot":
                b.screenshot(arg)
                log.append((arg, f))
                print(f"shot {arg} frame={f}")
            elif name == "read":
                addr, _, ln = arg.partition(":")
                data = b.read(int(addr, 0), int(ln))
                print(f"read {arg} f={f}: " + " ".join(f"{x:02X}" for x in data))
            elif name == "info":
                print("info", b.info())
            else:
                print("unknown step:", step)
    finally:
        b.close()
    return log


if __name__ == "__main__":
    run(sys.argv[1])
