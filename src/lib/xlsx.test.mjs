import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32 } from 'node:zlib';
import { buildXlsx } from './xlsx.ts';

/* The .xlsx writer produces a valid zip: signatures, 6 parts, CRCs that match, escaped text. */
test('xlsx: valid stored zip with the six parts and correct CRCs', () => {
  const bytes = buildXlsx('Hired', [['Candidate', 'Role', 'Days'], ['Anna <A&B>', 'Engineer', 12]]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(view.getUint32(0, true), 0x04034b50, 'starts with a local file header');
  const endAt = bytes.length - 22;
  assert.equal(view.getUint32(endAt, true), 0x06054b50, 'ends with the end-of-central-directory record');
  assert.equal(view.getUint16(endAt + 10, true), 6, 'six files');
  // Walk local headers and check each CRC.
  let at = 0; const names = [];
  while (view.getUint32(at, true) === 0x04034b50) {
    const crc = view.getUint32(at + 14, true); const size = view.getUint32(at + 18, true); const nlen = view.getUint16(at + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nlen)); names.push(name);
    const data = bytes.subarray(at + 30 + nlen, at + 30 + nlen + size);
    assert.equal(crc32(data) >>> 0, crc, `crc of ${name}`);
    if (name === 'xl/worksheets/sheet1.xml') {
      const xml = new TextDecoder().decode(data);
      assert.match(xml, /Anna &lt;A&amp;B&gt;/, 'text escaped');
      assert.match(xml, /<c r="C2"><v>12<\/v><\/c>/, 'numbers stay numbers');
    }
    at += 30 + nlen + size;
  }
  assert.deepEqual(names.sort(), ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml']);
});
