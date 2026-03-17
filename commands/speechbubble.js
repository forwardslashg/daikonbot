const { buildImageEffectCommand } = require('../utils/imageCommandFactory');

module.exports = buildImageEffectCommand({
  name: 'speechbubble',
  description: 'Put an image into a comic-style speech card.',
  effect: 'ad',
  color: 0xf97316,
});
