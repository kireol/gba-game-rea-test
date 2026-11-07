#!/usr/bin/env python3
"""Client for the mGBA Lua bridge (127.0.0.1:8777) used during reverse engineering.

This is research tooling only: it talks to the reference emulator so that memory
can be snapshotted, diffed and poked in bulk. It is never part of the game.

Protocol: newline-delimited JSON-RPC, handlers listed in the bridge's HANDLERS
table. Every request is serviced from mGBA's frame callback, so throughput is
bounded by ~1 recv(4096) per emulated frame.

Usage examples:
    python3 tools/re/bridge.py info
    python3 tools/re/bridge.py dump 0x02000000 0x40000 /tmp/ewram.bin
    python3 tools/re/bridge.py diff /tmp/a.bin /tmp/b.bin --base 0x02000000
    python3 tools/re/bridge.py u32 0x02000000 0x100
    python3 tools/re/bridge.py press Down 4 6
    python3 tools/re/bridge.py adv 30
"""

import json
import socket
import struct
import sys
import time

HOST, PORT = "127.0.0.1", 8777


class Bridge:
    def __init__(self, host=HOST, port=PORT, timeout=60.0):
        self.sock = socket.create_connection((host, port), timeout=timeout)
        self.sock.settimeout(timeout)
        self.f = self.sock.makefile("rwb")
        self._id = 0

    def call(self, method, **params):
        self._id += 1
        req = {"id": self._id, "method": method, "params": params}
        self.f.write((json.dumps(req) + "\n").encode())
        self.f.flush()
        line = self.f.readline()
        if not line:
            raise RuntimeError("bridge closed the connection")
        rsp = json.loads(line)
        if "error" in rsp:
            raise RuntimeError(f"{method} failed: {rsp['error']}")
        return rsp.get("result")

    # ── memory ────────────────────────────────────────────────────────────
    def read(self, addr, length):
        assert 1 <= length <= 4096
        return bytes(self.call("read_range", address=addr, length=length))

    def read_u32(self, addr):
        return struct.unpack("<I", self.read(addr, 4))[0]

    def read_u16(self, addr):
        return struct.unpack("<H", self.read(addr, 2))[0]

    def dump(self, addr, length, chunk=4096):
        """Read `length` bytes as fast as the bridge allows (chunked)."""
        out = bytearray()
        while len(out) < length:
            n = min(chunk, length - len(out))
            out += self.read(addr + len(out), n)
        return bytes(out)

    def write_u32(self, addr, value):
        self.call("write32", address=addr, value=value)

    def write_u8(self, addr, value):
        self.call("write8", address=addr, value=value)

    # ── control ───────────────────────────────────────────────────────────
    def info(self):
        return self.call("get_info")

    def frame(self):
        return self.call("get_info")["frame"]

    def press(self, buttons, hold=3, release=4):
        return self.call("press_buttons", buttons=list(buttons),
                         frames=hold, release_frames=release)

    def advance(self, count=1):
        return self.call("advance_frames", count=count)

    def screenshot(self, path):
        return self.call("screenshot", path=path)

    def save_state(self, path):
        return self.call("save_state", path=path)

    def load_state(self, path):
        return self.call("load_state", path=path)

    def reset(self):
        return self.call("reset")

    def wait(self, seconds):
        """Let the emulator run in real time for a while."""
        end = time.time() + seconds
        while time.time() < end:
            self.frame()
            time.sleep(0.05)

    def wait_frames(self, frames, timeout=90.0):
        """Block until `frames` emulated frames have elapsed.

        mGBA only advances frames while its window is visible; when the window is
        occluded the frame counter stalls, so a poll that times out is the signal
        to bring the emulator window forward rather than a bug in the caller.
        """
        start = self.frame()
        deadline = time.time() + timeout
        while time.time() < deadline:
            elapsed = self.frame() - start
            if elapsed >= frames:
                return elapsed
            time.sleep(0.002)
        raise RuntimeError(
            f"only {self.frame() - start}/{frames} frames in {timeout}s — "
            "mGBA throttles to a standstill when its window is occluded")

    def close(self):
        try:
            self.f.close()
            self.sock.close()
        except OSError:
            pass


def _main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        return
    cmd, rest = args[0], args[1:]
    b = Bridge()
    try:
        if cmd == "info":
            print(json.dumps(b.info(), indent=2))
        elif cmd == "frame":
            print(hex(b.frame()))
        elif cmd == "dump":
            addr, length, path = int(rest[0], 0), int(rest[1], 0), rest[2]
            data = b.dump(addr, length)
            open(path, "wb").write(data)
            print(f"wrote {len(data)} bytes -> {path}")
        elif cmd == "bytes":
            addr, length = int(rest[0], 0), int(rest[1], 0)
            data = b.dump(addr, length)
            for off in range(0, len(data), 16):
                row = data[off:off + 16]
                print(f"{addr+off:08X}  " + " ".join(f"{x:02X}" for x in row))
        elif cmd == "u32":
            addr, count = int(rest[0], 0), int(rest[1]) if len(rest) > 1 else 1
            data = b.dump(addr, count * 4)
            for i in range(count):
                v = struct.unpack_from("<I", data, i * 4)[0]
                print(f"{addr+i*4:08X}: {v:08X} ({v})")
        elif cmd == "diff":
            a = open(rest[0], "rb").read()
            bpos = open(rest[1], "rb").read()
            base = int(next((rest[i + 1] for i, x in enumerate(rest) if x == "--base"), 0), 0)
            n = 0
            for i in range(min(len(a), len(bpos))):
                if a[i] != bpos[i]:
                    print(f"{base+i:08X}: {a[i]:02X} -> {bpos[i]:02X}")
                    n += 1
                    if n >= int(next((rest[i + 1] for i, x in enumerate(rest) if x == "--max"), 400)):
                        print("... (truncated)")
                        break
            print(f"total differing bytes: {n if n < 400 else '400+'}")
        elif cmd == "press":
            keys = rest[0].split(",")
            hold = int(rest[1]) if len(rest) > 1 else 3
            rel = int(rest[2]) if len(rest) > 2 else 4
            print(b.press(keys, hold, rel))
        elif cmd == "adv":
            print(b.advance(int(rest[0]) if rest else 1))
        elif cmd == "shot":
            print(b.screenshot(rest[0]))
        elif cmd == "savestatesave":
            print(b.save_state(rest[0]))
        elif cmd == "savestate:load":
            print(b.load_state(rest[0]))
        elif cmd == "reset":
            print(b.reset())
        elif cmd == "wait":
            f0 = b.frame()
            b.wait(float(rest[0]))
            print(f"frames {f0} -> {b.frame()}")
        else:
            print(f"unknown command {cmd}")
    finally:
        b.close()


if __name__ == "__main__":
    _main()
