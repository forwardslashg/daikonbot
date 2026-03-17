const { buildImageEffectCommand } = require('../utils/imageCommandFactory');

module.exports = buildImageEffectCommand({
  name: 'drip',
  description: 'Apply a drip effect to an image.',
  effect: 'drip',
  color: 0x2563eb,
});
