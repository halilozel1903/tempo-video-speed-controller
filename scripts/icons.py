"""Generate the extension's vector-style chevron icons without dependencies."""
from pathlib import Path
import math
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]

def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))

def pixel(x, y):
    radius = .22
    dx = max(radius - x, 0, x - (1 - radius))
    dy = max(radius - y, 0, y - (1 - radius))
    if dx * dx + dy * dy > radius * radius:
        return (0, 0, 0, 0)
    for start in (.23, .46):
        for a, b in (((start, .30), (start + .20, .50)), ((start + .20, .50), (start, .70))):
            vx, vy = b[0] - a[0], b[1] - a[1]
            t = max(0, min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / (vx * vx + vy * vy)))
            if math.hypot(x - a[0] - t * vx, y - a[1] - t * vy) < .042:
                return (28, 20, 43, 255)
    return (187, 165, 255, 255)

for size in (16, 32, 48, 128):
    data = bytearray()
    for y in range(size):
        data.append(0)
        for x in range(size):
            samples = [pixel((x + (sx + .5) / 4) / size, (y + (sy + .5) / 4) / size)
                       for sx in range(4) for sy in range(4)]
            data.extend(round(sum(sample[c] for sample in samples) / 16) for c in range(4))
    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(data))) + chunk(b'IEND', b'')
    path = ROOT / 'icons' / f'{size}.png'
    path.parent.mkdir(exist_ok=True)
    path.write_bytes(png)
