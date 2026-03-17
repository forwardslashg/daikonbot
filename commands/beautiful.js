const { buildImageEffectCommand } = require('../utils/imageCommandFactory');

module.exports = buildImageEffectCommand({
  name: 'beautiful',
  description: 'Put an image into a beautiful meme template.',
  effect: 'beautiful',
  color: 0xa855f7,
});
