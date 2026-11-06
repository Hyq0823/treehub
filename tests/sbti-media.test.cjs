const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const ORIGINAL_TOTAL_BYTES = 1259419;

function webpSize(buffer) {
  assert.equal(buffer.subarray(0, 4).toString(), 'RIFF');
  assert.equal(buffer.subarray(8, 12).toString(), 'WEBP');
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const type = buffer.subarray(offset, offset + 4).toString();
    const length = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (type === 'VP8 ') {
      assert.equal(buffer.subarray(data + 3, data + 6).toString('hex'), '9d012a');
      return {
        width: buffer.readUInt16LE(data + 6) & 0x3fff,
        height: buffer.readUInt16LE(data + 8) & 0x3fff
      };
    }
    if (type === 'VP8X') {
      return {
        width: 1 + buffer.readUIntLE(data + 4, 3),
        height: 1 + buffer.readUIntLE(data + 7, 3)
      };
    }
    offset = data + length + (length % 2);
  }
  throw new Error('WebP image has no supported dimension chunk');
}

test('every SBTI result image is a compact decodable WebP with enough display detail', () => {
  const source = fs.readFileSync(path.join(root, 'data/tests/sbti.js'), 'utf8');
  const references = [...source.matchAll(/image:\s*'([^']+)'/g)].map(match => match[1]);
  assert.equal(references.length, 27);
  assert.equal(new Set(references).size, references.length);

  let totalBytes = 0;
  for (const reference of references) {
    assert.match(reference, /^\/packages\/reports\/images\/[A-Za-z0-9!-]+\.webp$/);
    const file = path.join(root, reference.slice(1));
    assert.ok(fs.existsSync(file), reference);
    const buffer = fs.readFileSync(file);
    assert.ok(buffer.length < 200000, `${reference} exceeds 200KB`);
    const size = webpSize(buffer);
    assert.ok(Math.max(size.width, size.height) >= 480, `${reference} is too small`);
    assert.ok(Math.max(size.width, size.height) <= 512, `${reference} is larger than needed`);
    totalBytes += buffer.length;
  }

  assert.ok(totalBytes < ORIGINAL_TOTAL_BYTES * 0.3, `SBTI media total is ${totalBytes} bytes`);
});

test('replaced SBTI PNG and JPEG files are not left in the report package', () => {
  const files = fs.readdirSync(path.join(root, 'packages/reports/images'));
  assert.equal(files.length, 27);
  assert.ok(files.every(file => file.endsWith('.webp')));
});
