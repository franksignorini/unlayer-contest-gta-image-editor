/**
 * Minimal PNG decoder — 8-bit, non-interlaced, colour type 2 (RGB) or 6 (RGBA).
 *
 * Exists so `region-check.mjs` can verify evidence boxes against the real
 * screenshots instead of me estimating coordinates by eye. Deliberately narrow:
 * it handles exactly the files in assets/sources and throws on anything
 * else rather than silently mis-decoding.
 */

import zlib from 'node:zlib';
import fs from 'node:fs';
import { Raster } from './raster.mjs';

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Decode a PNG file into a Raster (RGB float buffer). */
export function decodePNG(path) {
  const buf = fs.readFileSync(path);
  if (buf.readUInt32BE(0) !== 0x89504e47) {
    throw new Error(`not a PNG: ${path}`);
  }

  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  const idat = [];

  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      if (data[12] !== 0) throw new Error('interlaced PNG not supported');
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }

  if (depth !== 8 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(
      `unsupported PNG (depth=${depth} colorType=${colorType}): ${path}`
    );
  }

  const channels = colorType === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Raster(width, height);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);

  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    for (let i = 0; i < stride; i++) cur[i] = raw[p + i];
    p += stride;

    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev[i];
      const c = i >= channels ? prev[i - channels] : 0;
      switch (filter) {
        case 0:
          break;
        case 1:
          cur[i] = (cur[i] + a) & 0xff;
          break;
        case 2:
          cur[i] = (cur[i] + b) & 0xff;
          break;
        case 3:
          cur[i] = (cur[i] + ((a + b) >> 1)) & 0xff;
          break;
        case 4:
          cur[i] = (cur[i] + paeth(a, b, c)) & 0xff;
          break;
        default:
          throw new Error(`bad filter ${filter} on row ${y}`);
      }
    }

    for (let x = 0; x < width; x++) {
      const s = x * channels;
      const o = out.idx(x, y);
      out.data[o] = cur[s];
      out.data[o + 1] = cur[s + 1];
      out.data[o + 2] = cur[s + 2];
    }
    prev.set(cur);
  }

  return out;
}
