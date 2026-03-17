const { buildImageEffectCommand } = require('../utils/imageCommandFactory');

module.exports = buildImageEffectCommand({
  name: 'wanted',
  description: 'Generate a wanted poster using an image.',
  effect: 'wanted',
  color: 0xb45309,
});
