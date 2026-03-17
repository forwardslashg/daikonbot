const { buildImageEffectCommand } = require('../utils/imageCommandFactory');

module.exports = buildImageEffectCommand({
  name: 'communism',
  description: 'Apply a red propaganda-style filter.',
  effect: 'communism',
  color: 0xdc2626,
});
