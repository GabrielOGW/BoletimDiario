/**
 * Gera os ícones PNG do PWA sem dependências externas:
 * codifica PNG (RGBA) na mão usando apenas zlib nativo do Node.
 *
 *   node scripts/generate-icons.mjs
 *
 * Desenha um clapperboard (barra listrada + corpo âmbar) no estilo do icon.svg.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

// ---- Cores ----
const BG = [0x10, 0x12, 0x16, 255];
const AMBER = [0xf5, 0xa5, 0x24, 255];
const LIGHT = [0xe9, 0xe9, 0xec, 255];
const TRANSPARENT = [0, 0, 0, 0];

// ---- CRC32 / PNG encoder ----
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++)
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[(stride + 1) * y] = 0; // filter: none
    rgba.copy(raw, (stride + 1) * y + 1, stride * y, stride * y + stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- Desenho ----
function insideRoundedSquare(x, y, size, radius) {
  const cx = Math.min(Math.max(x, radius), size - radius);
  const cy = Math.min(Math.max(y, radius), size - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

function drawIcon(size, { maskable = false, rounded = true } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const inset = (maskable ? 0.23 : 0.16) * size;
  const L = inset;
  const R = size - inset;
  const W = R - L;
  const T = inset;
  const B = size - inset;
  const H = B - T;

  const barTop = T + 0.1 * H;
  const barBot = T + 0.34 * H;
  const bodyTop = T + 0.4 * H;
  const bodyBot = T + 0.9 * H;
  const stripeW = W / 5;
  const radius = 0.2 * size;

  const set = (x, y, [r, g, b, a]) => {
    const i = (y * size + x) * 4;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = a;
  };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let color = BG;

      if (x >= L && x < R && y >= bodyTop && y < bodyBot) {
        color = AMBER;
      }
      if (x >= L && x < R && y >= barTop && y < barBot) {
        const idx = Math.floor((x - L + (barBot - y)) / stripeW);
        color = idx % 2 === 0 ? LIGHT : BG;
      }

      // cantos arredondados (apenas para ícones não-maskable)
      if (rounded && !maskable && !insideRoundedSquare(x, y, size, radius)) {
        color = TRANSPARENT;
      }

      set(x, y, color);
    }
  }
  return encodePNG(size, size, rgba);
}

// ---- Geração ----
mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  { file: 'icon-192.png', size: 192, opts: {} },
  { file: 'icon-512.png', size: 512, opts: {} },
  { file: 'maskable-512.png', size: 512, opts: { maskable: true } },
  { file: 'apple-touch-icon.png', size: 180, opts: { rounded: false } },
];

for (const { file, size, opts } of targets) {
  const png = drawIcon(size, opts);
  writeFileSync(join(OUT_DIR, file), png);
  console.log(`✓ ${file} (${size}x${size}, ${png.length} bytes)`);
}

console.log('Ícones gerados em public/icons/');
