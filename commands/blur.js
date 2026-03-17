const { buildImageEffectCommand } = require('../utils/imageCommandFactory');

module.exports = buildImageEffectCommand({
  name: 'blur',
  description: 'Blur an image.',
  effect: 'blur',
  color: 0x60a5fa,
});
