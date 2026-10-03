const sharp = require('sharp');

const GUTTER = 16;

async function createProofCollage(imageBuffers) {
  if (!Array.isArray(imageBuffers) || imageBuffers.length < 1 || imageBuffers.length > 2) {
    throw new RangeError('A proof collage requires one or two images.');
  }

  const maxImageWidth = imageBuffers.length === 1 ? 1600 : 800;
  const maxImageHeight = imageBuffers.length === 1 ? 1200 : 900;
  const composites = [];
  const dimensions = [];

  for (let index = 0; index < imageBuffers.length; index += 1) {
    const image = await sharp(imageBuffers[index], { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({
        width: maxImageWidth,
        height: maxImageHeight,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    const { width, height } = await sharp(image).metadata();
    dimensions.push({ width, height });
    composites.push({
      input: image,
      left: GUTTER + dimensions.slice(0, -1).reduce((total, size) => total + size.width + GUTTER, 0),
      top: GUTTER,
    });
  }

  const width = GUTTER + dimensions.reduce((total, size) => total + size.width + GUTTER, 0);
  const height = GUTTER * 2 + Math.max(...dimensions.map((size) => size.height));
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

module.exports = { createProofCollage };