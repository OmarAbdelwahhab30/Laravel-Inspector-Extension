// One-off generator for placeholder toolbar/panel icons: a flat Laravel-red
// (#FF2D20) rounded-square PNG at each required size. Run with `node
// generate-icons.js` if you ever need to regenerate them (e.g. after
// swapping in a real logo, delete this file).
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZES = [16, 32, 48, 128];
const COLOR = [0xff, 0x2d, 0x20]; // Laravel red

function crc32(buf) {
    let c;
    const table = crc32.table || (crc32.table = (() => {
        const t = [];
        for (let n = 0; n < 256; n++) {
            c = n;
            for (let k = 0; k < 8; k++) {
                c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
            }
            t[n] = c;
        }
        return t;
    })());
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const typeBuf = Buffer.from(type, 'ascii');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(data.length, 0);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function makePng(size) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; // bit depth
    ihdr[9] = 6; // color type: RGBA
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    // Rounded-square silhouette: corner radius ~18% of size, solid Laravel red, fully opaque.
    const radius = Math.round(size * 0.18);
    const raw = Buffer.alloc(size * (1 + size * 4));
    let offset = 0;
    for (let y = 0; y < size; y++) {
        raw[offset++] = 0; // filter type: none
        for (let x = 0; x < size; x++) {
            const inCorner =
                (x < radius && y < radius && (radius - x) ** 2 + (radius - y) ** 2 > radius ** 2) ||
                (x >= size - radius && y < radius && (x - (size - radius - 1)) ** 2 + (radius - y) ** 2 > radius ** 2) ||
                (x < radius && y >= size - radius && (radius - x) ** 2 + (y - (size - radius - 1)) ** 2 > radius ** 2) ||
                (x >= size - radius && y >= size - radius && (x - (size - radius - 1)) ** 2 + (y - (size - radius - 1)) ** 2 > radius ** 2);

            const rx = x / size;
            const ry = y / size;

            const inL = (rx >= 0.3 && rx <= 0.45 && ry >= 0.15 && ry <= 0.85) ||
                (rx >= 0.3 && rx <= 0.8 && ry >= 0.7 && ry <= 0.85);

            const dx = rx - 0.75;
            const dy = ry - 0.3;
            const inCircle = (dx * dx + dy * dy) <= (0.15 * 0.15);

            if (inCorner) {
                raw[offset++] = 0;
                raw[offset++] = 0;
                raw[offset++] = 0;
                raw[offset++] = 0;
            } else if (inCircle) {
                raw[offset++] = COLOR[0];
                raw[offset++] = COLOR[1];
                raw[offset++] = COLOR[2];
                raw[offset++] = 0xff;
            } else if (inL) {
                raw[offset++] = 0xff;
                raw[offset++] = 0xff;
                raw[offset++] = 0xff;
                raw[offset++] = 0xff;
            } else {
                raw[offset++] = 0;
                raw[offset++] = 0;
                raw[offset++] = 0;
                raw[offset++] = 0xff;
            }
        }
    }

    const idat = zlib.deflateSync(raw);
    const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    return Buffer.concat([
        signature,
        chunk('IHDR', ihdr),
        chunk('IDAT', idat),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

for (const size of SIZES) {
    const outPath = path.join(__dirname, `icon${size}.png`);
    fs.writeFileSync(outPath, makePng(size));
    console.log(`Wrote ${outPath}`);
}
