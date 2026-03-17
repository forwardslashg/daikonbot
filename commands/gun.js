const { buildImageEffectCommand } = require('../utils/imageCommandFactory');

module.exports = buildImageEffectCommand({
  name: 'gun',
  description: 'Place a dramatic gun overlay near the subject.',
  effect: 'gun',
  color: 0x111827,
});
