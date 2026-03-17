const IMAGE_URL_REGEX = /(https?:\/\/[^\s>]+\.(?:png|jpe?g|gif|webp)(?:\?[^\s>]*)?)/i;
const POPCAT_BASE_URL = 'https://api.popcat.xyz';

const _selectedImageByUser = new Map();
const IMAGE_SELECTION_TTL_MS = 6 * 60 * 60 * 1000;

function cleanupSelections() {
  const now = Date.now();
  for (const [userId, entry] of _selectedImageByUser.entries()) {
    if (!entry || now - entry.savedAt > IMAGE_SELECTION_TTL_MS) {
      _selectedImageByUser.delete(userId);
    }
  }
}

function isHttpUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isLikelyImageUrl(url) {
  const lower = String(url || '').toLowerCase();
  if (!isHttpUrl(lower)) return false;
  return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(lower) || lower.includes('cdn.discordapp.com') || lower.includes('media.discordapp.net');
}

function extractImageUrlFromMessage(message) {
  if (!message) return null;

  for (const attachment of message.attachments.values()) {
    if (attachment.contentType?.startsWith('image/')) return attachment.url;
    if (isLikelyImageUrl(attachment.url)) return attachment.url;
  }

  for (const embed of message.embeds ?? []) {
    if (embed.image?.url && isHttpUrl(embed.image.url)) return embed.image.url;
    if (embed.thumbnail?.url && isHttpUrl(embed.thumbnail.url)) return embed.thumbnail.url;
  }

  const content = message.content || '';
  const match = content.match(IMAGE_URL_REGEX);
  if (match?.[1] && isHttpUrl(match[1])) return match[1];

  return null;
}

function setSelectedImage(userId, imageUrl) {
  cleanupSelections();
  _selectedImageByUser.set(userId, { imageUrl, savedAt: Date.now() });
}

function getSelectedImage(userId) {
  cleanupSelections();
  return _selectedImageByUser.get(userId)?.imageUrl ?? null;
}

function pickAvatarFromUser(user) {
  if (!user) return null;
  return user.displayAvatarURL({ extension: 'png', size: 1024 });
}

function resolveImageFromInteraction(interaction, options = {}) {
  const imageOptionName = options.imageOptionName ?? 'image';
  const userOptionName = options.userOptionName ?? 'user';
  const fallbackToInvokerAvatar = options.fallbackToInvokerAvatar ?? true;

  const directImage = interaction.options.getString(imageOptionName);
  if (directImage && isHttpUrl(directImage)) {
    return { imageUrl: directImage, source: 'option' };
  }

  const targetUser = interaction.options.getUser(userOptionName);
  if (targetUser) {
    return { imageUrl: pickAvatarFromUser(targetUser), source: 'user-avatar' };
  }

  const selected = getSelectedImage(interaction.user.id);
  if (selected) {
    return { imageUrl: selected, source: 'saved-image' };
  }

  if (fallbackToInvokerAvatar) {
    return { imageUrl: pickAvatarFromUser(interaction.user), source: 'your-avatar' };
  }

  return { imageUrl: null, source: 'none' };
}

function buildPopcatEffectUrl(effect, imageUrl) {
  return `${POPCAT_BASE_URL}/${effect}?image=${encodeURIComponent(imageUrl)}`;
}

module.exports = {
  POPCAT_BASE_URL,
  isHttpUrl,
  isLikelyImageUrl,
  extractImageUrlFromMessage,
  setSelectedImage,
  getSelectedImage,
  resolveImageFromInteraction,
  buildPopcatEffectUrl,
};
