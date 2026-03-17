const { buildImageEffectCommand } = require('../utils/imageCommandFactory');

module.exports = buildImageEffectCommand({
  name: 'greyscale',
  description: 'Convert an image to greyscale.',
  effect: 'greyscale',
  color: 0x9ca3af,
});
