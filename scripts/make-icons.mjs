// Генерирует PNG-иконки приложения без внешних библиотек (рисуем попиксельно).
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const inTri = (px, py, a, b, c) => {
  const s = (p1, p2, p3) => (px - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (py - p3[1]);
  const d1 = s(a, b, c), d2 = s(b, c, a), d3 = s(c, a, b);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};

function pixel(u, v) {
  // фон: тёмный с зелёным свечением в центре
  const dx = u - 0.5, dy = v - 0.55, d = Math.hypot(dx, dy);
  let r = 11 + 90 * Math.max(0, 0.55 - d), g = 13 + 120 * Math.max(0, 0.55 - d), b = 18 + 60 * Math.max(0, 0.55 - d);
  // светящееся кольцо
  const ring = Math.abs(d - 0.36);
  if (ring < 0.012) { r = 120; g = 230; b = 255; }
  else if (ring < 0.04) { const k = 1 - ring / 0.04; r += 60 * k; g += 140 * k; b += 160 * k; }
  // ведьма: шляпа + плащ
  const hat = inTri(u, v, [0.36, 0.42], [0.62, 0.42], [0.55, 0.16]);
  const brim = Math.abs(v - 0.43) < 0.02 && Math.abs(u - 0.49) < 0.17;
  const cloak = inTri(u, v, [0.33, 0.82], [0.67, 0.82], [0.5, 0.36]);
  if (hat || brim || cloak) { r = 12; g = 12; b = 14; }
  // звёздочка-дух
  const sx = u - 0.7, sy = v - 0.3;
  if ((Math.abs(sx) < 0.008 && Math.abs(sy) < 0.05) || (Math.abs(sy) < 0.008 && Math.abs(sx) < 0.05)) { r = g = b = 255; }
  return [Math.min(255, r) | 0, Math.min(255, g) | 0, Math.min(255, b) | 0];
}

for (const s of [180, 192, 512]) writeFileSync(`public/icon-${s}.png`, png(s, pixel));
console.log('icons ok');
