const { buildImageEffectCommand } = require('../utils/imageCommandFactory');

module.exports = buildImageEffectCommand({
  name: 'gif',
  description: 'Generate an animated pet GIF from an image.',
  effect: 'pet',
  color: 0x22c55e,
});
