const assert = require('node:assert/strict');
const test = require('node:test');
const sharp = require('sharp');
const { createProofCollage } = require('../src/vouch-proofs');

test('proof collage combines one to five images into a single PNG', async () => {
  for (let count = 1; count <= 5; count += 1) {
    const imageBuffers = await Promise.all(Array.from({ length: count }, (_, index) => sharp({
      create: {
        width: 80 + index,
        height: 50 + index,
        channels: 3,
        background: { r: 20 * index, g: 100, b: 180 },
      },
    }).png().toBuffer()));
    const collage = await createProofCollage(imageBuffers);
    const metadata = await sharp(collage).metadata();

    assert.equal(metadata.format, 'png');
    assert.equal(metadata.width, 672);
    assert.equal(metadata.height, 16 + count * 436);
    const cornerPixel = await sharp(collage).extract({ left: 0, top: 0, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
    assert.deepEqual([...cornerPixel], [0, 0, 0]);
    for (let index = 0; index < count; index += 1) {
      const imagePixel = await sharp(collage)
        .extract({ left: 100, top: 226 + index * 436, width: 1, height: 1 })
        .removeAlpha()
        .raw()
        .toBuffer();
      assert.deepEqual([...imagePixel], [20 * index, 100, 180]);
    }
  }
});

test('proof collage rejects counts outside one to five', async () => {
  await assert.rejects(createProofCollage([]), RangeError);
  await assert.rejects(createProofCollage(Array.from({ length: 6 }, () => Buffer.alloc(1))), RangeError);
});