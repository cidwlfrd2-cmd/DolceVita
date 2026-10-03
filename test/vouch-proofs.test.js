const assert = require('node:assert/strict');
const test = require('node:test');
const sharp = require('sharp');
const { createProofCollage } = require('../src/vouch-proofs');

test('proof collage combines one or two images in a single dimension-aware PNG', async () => {
  const imageBuffers = await Promise.all([
    sharp({ create: { width: 80, height: 50, channels: 3, background: { r: 20, g: 100, b: 180 } } }).png().toBuffer(),
    sharp({ create: { width: 120, height: 60, channels: 3, background: { r: 40, g: 100, b: 180 } } }).png().toBuffer(),
  ]);
  const singleProof = await createProofCollage(imageBuffers.slice(0, 1));
  const singleMetadata = await sharp(singleProof).metadata();
  assert.equal(singleMetadata.format, 'png');
  assert.equal(singleMetadata.width, 112);
  assert.equal(singleMetadata.height, 82);

  const collage = await createProofCollage(imageBuffers);
  const metadata = await sharp(collage).metadata();
  assert.equal(metadata.format, 'png');
  assert.equal(metadata.width, 248);
  assert.equal(metadata.height, 92);

  const cornerPixel = await sharp(collage).extract({ left: 0, top: 0, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
  assert.deepEqual([...cornerPixel], [0, 0, 0]);
  const firstImagePixel = await sharp(collage).extract({ left: 20, top: 20, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
  assert.deepEqual([...firstImagePixel], [20, 100, 180]);
  const secondImagePixel = await sharp(collage).extract({ left: 116, top: 20, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
  assert.deepEqual([...secondImagePixel], [40, 100, 180]);
});

test('proof collage rejects counts outside one or two', async () => {
  await assert.rejects(createProofCollage([]), RangeError);
  await assert.rejects(createProofCollage(Array.from({ length: 3 }, () => Buffer.alloc(1))), RangeError);
});