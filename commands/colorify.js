const { buildImageEffectCommand } = require('../utils/imageCommandFactory');

module.exports = buildImageEffectCommand({
  name: 'colorify',
  description: 'Colorize an image with a stylized effect.',
  effect: 'colorify',
  color: 0x14b8a6,
});
