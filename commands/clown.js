const { buildImageEffectCommand } = require('../utils/imageCommandFactory');

module.exports = buildImageEffectCommand({
  name: 'clown',
  description: 'Turn an image into clown makeup style.',
  effect: 'clown',
  color: 0xef4444,
});
