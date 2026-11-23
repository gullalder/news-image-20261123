import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Resolve the asset beside the program, regardless of the caller's directory.
const image = readFileSync(new URL('entry.png', import.meta.url));
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
if (image.length > 1048576 || image.length < 45) {
  throw new Error('Entry must be a complete PNG within the 1 MiB limit');
}
if (!image.subarray(0, 8).equals(signature)) {
  throw new Error('Entry does not have a PNG signature');
}
if (image.toString('ascii', 12, 16) !== 'IHDR' ||
    image.readUInt32BE(16) !== 1024 || image.readUInt32BE(20) !== 1024) {
  throw new Error('Entry must measure exactly 1024 by 1024 pixels');
}

const destination = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
// Check chunk boundaries and CRCs before publishing any output.
let cursor = 8;
let ended = false;
let hasPixels = false;
while (cursor < image.length) {
  if (cursor + 12 > image.length) throw new Error('Truncated PNG chunk');
  const length = image.readUInt32BE(cursor);
  const end = cursor + 12 + length;
  if (end > image.length) throw new Error('Incomplete PNG payload');
  const kind = image.toString('ascii', cursor + 4, cursor + 8);
  let crc = 0xffffffff;
  for (let i = cursor + 4; i < end - 4; i++) {
    crc ^= image[i];
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  if (((crc ^ 0xffffffff) >>> 0) !== image.readUInt32BE(end - 4)) {
    throw new Error(`Invalid checksum in ${kind}`);
  }
  if (cursor === 8 && (kind !== 'IHDR' || length !== 13)) {
    throw new Error('Malformed PNG header');
  }
  if (kind === 'IDAT' && length > 0) hasPixels = true;
  cursor = end;
  if (kind === 'IEND') {
    if (length !== 0 || cursor !== image.length) throw new Error('Malformed PNG end');
    ended = true;
    break;
  }
}
if (!ended || !hasPixels) throw new Error('PNG image data or end marker missing');
mkdirSync(destination, { recursive: true });
writeFileSync(resolve(destination, 'entry.png'), image);
