#!/usr/bin/env python3
"""Print reference-ROM header metadata (file size, digests, header fields).

Reads only the cartridge header region and file statistics. Deliberately does
not print the console-entry logo bitmap (0x04..0x9B) and does not decode any
graphics, audio, or font data.

Usage: rom_header.py <path-to-reference-rom>
"""
import argparse
import hashlib
import math
import zlib
from pathlib import Path

# Offsets are file offsets, which equal logical ROM offsets (0x08000000 maps to 0).
FIELDS = [
    (0x000, 4, "reset vector"),
    (0x004, 4, "undefined instruction vector"),
    (0x008, 4, "software interrupt / BIOS call vector"),
    (0x00C, 4, "prefetch abort vector"),
    (0x010, 4, "data abort vector"),
    (0x014, 4, "reserved vector"),
    (0x018, 4, "IRQ / interrupt vector"),
    (0x01C, 4, "FIQ vector"),
    (0x0A0, 12, "cartridge title"),
    (0x0AC, 4, "four-character game code"),
    (0x0B0, 2, "maker code"),
    (0x0B2, 1, "fixed value 0x96"),
    (0x0B3, 1, "fixed value 0x00"),
    (0x0B4, 1, "unit code"),
    (0x0B5, 1, "link area code"),
    (0x0B6, 2, "reserved"),
    (0x0B8, 1, "supplement number"),
    (0x0B9, 1, "main unit code"),
    (0x0BA, 1, "device region"),
    (0x0BB, 1, "reserved"),
    (0x0BD, 1, "header checksum"),
]


def header_checksum(data: bytes) -> int:
    return (-(sum(data[0xA0:0xBD]) + 0x19)) & 0xFF


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("rom", help="path to the reference ROM (kept out of git)")
    a = ap.parse_args()
    data = Path(a.rom).read_bytes()

    print(f"size_bytes  : {len(data)}  ({len(data) / (1024 * 1024):.2f} MiB)")
    print(f"sha256      : {hashlib.sha256(data).hexdigest()}")
    print(f"crc32       : {zlib.crc32(data) & 0xFFFFFFFF:08x}")
    print()
    for off, size, label in FIELDS:
        chunk = data[off : off + size]
        if off < 0x20:
            body = " ".join(
                f"{int.from_bytes(chunk[i:i + 4], 'little'):08x}" for i in range(0, size, 4)
            )
        else:
            trimmed = chunk.rstrip(b"\x00")
            body = (
                trimmed.decode("latin-1")
                if trimmed and all(32 <= b < 127 for b in trimmed)
                else chunk.hex()
            )
        print(f"0x{off:04X}  : {body:<28} {label}")

    stored = data[0xBD]
    computed = header_checksum(data)
    print()
    print(f"header checksum  stored=0x{stored:02X} computed=0x{computed:02X} "
          f"{'MATCH' if stored == computed else 'MISMATCH'}")

    hist = [0] * 256
    for byte in data:
        hist[byte] += 1
    entropy = -sum((c / len(data)) * math.log2(c / len(data)) for c in hist if c)
    print(f"byte entropy     : {entropy:.3f} bits/byte (mixed data / partially compressed)")


if __name__ == "__main__":
    main()
