const { buildImageEffectCommand } = require('../utils/imageCommandFactory');

module.exports = buildImageEffectCommand({
  name: 'invert',
  description: 'Invert the colors of an image.',
  effect: 'invert',
  color: 0x0f172a,
});
