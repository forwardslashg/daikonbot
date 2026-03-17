const { buildImageEffectCommand } = require('../utils/imageCommandFactory');

module.exports = buildImageEffectCommand({
  name: 'jail',
  description: 'Put an image behind jail bars.',
  effect: 'jail',
  color: 0x6b7280,
});
