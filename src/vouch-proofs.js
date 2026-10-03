const sharp = require('sharp');

const TILE_WIDTH = 640;
const TILE_HEIGHT = 420;
const GUTTER = 16;

async function createProofCollage(imageBuffers) {
  if (!Array.isArray(imageBuffers) || imageBuffers.length < 1 || imageBuffers.length > 5) {
    throw new RangeError('A proof collage requires between one and five images.');
  }

  const columns = 1;
  const rows = imageBuffers.length;
  const composites = [];

  for (let index = 0; index < imageBuffers.length; index += 1) {
    const image = await sharp(imageBuffers[index], { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(TILE_WIDTH, TILE_HEIGHT, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 1 },
      })
      .png()
      .toBuffer();
    composites.push({
      input: image,
      left: GUTTER + (index % columns) * (TILE_WIDTH + GUTTER),
      top: GUTTER + Math.floor(index / columns) * (TILE_HEIGHT + GUTTER),
    });
  }

  return sharp({
    create: {
      width: GUTTER + columns * (TILE_WIDTH + GUTTER),
      height: GUTTER + rows * (TILE_HEIGHT + GUTTER),
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

module.exports = { createProofCollage };