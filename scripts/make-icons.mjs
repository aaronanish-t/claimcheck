// Draws the icon (white check mark on a green rounded square) as PNGs with no
// dependencies: 4x supersampling for anti-aliasing, then a minimal PNG encoder.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const GREEN = [31, 136, 61];

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function insideRoundedRect(x, y, size, r) {
  const cx = Math.min(Math.max(x, r), size - r);
  const cy = Math.min(Math.max(y, r), size - r);
  return Math.hypot(x - cx, y - cy) <= r;
}

function draw(size) {
  const ss = 4;
  const pixels = Buffer.alloc(size * size * 4);
  const r = size * 0.22;
  const stroke = size * 0.11;
  // Check mark from (0.27,0.53) to (0.44,0.70) to (0.75,0.33), in unit coordinates.
  const pts = [[0.27, 0.53], [0.44, 0.7], [0.75, 0.33]].map(([x, y]) => [x * size, y * size]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0, fg = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const px = x + (sx + 0.5) / ss, py = y + (sy + 0.5) / ss;
          if (!insideRoundedRect(px, py, size, r)) {
            continue;
          }
          bg++;
          const d = Math.min(
            distToSegment(px, py, ...pts[0], ...pts[1]),
            distToSegment(px, py, ...pts[1], ...pts[2])
          );
          if (d <= stroke / 2) {
            fg++;
          }
        }
      }
      const n = ss * ss;
      const a = bg / n, f = bg ? fg / bg : 0;
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) {
        pixels[i + c] = Math.round(GREEN[c] * (1 - f) + 255 * f);
      }
      pixels[i + 3] = Math.round(a * 255);
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) {
    c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [16, 32, 48, 128]) {
  writeFileSync(`icons/icon${size}.png`, png(size, draw(size)));
}
console.log("Wrote icons/icon{16,32,48,128}.png");
