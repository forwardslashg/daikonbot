const { SlashCommandBuilder } = require('discord.js');
const { userInstallConfig } = require('../utils/commandConfig');
const { resolveImageFromInteraction } = require('../utils/imageTools');
const { GoogleGenAI } = require('@google/genai');
const {
  checkRateLimitForSelection,
  consumeRateLimitForSelection,
  isOwner,
} = require('../utils/aiEngine');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('editimage')
    .setDescription('Edit an image using gemini-2.5-flash-image (Costs 14 credits)')
    .addStringOption((opt) =>
      opt
        .setName('prompt')
        .setDescription('Instruction of what edits to make to the image')
        .setRequired(true),
    )
    .addStringOption((opt) =>
      opt
        .setName('image')
        .setDescription('Image URL (optional, defaults to last selected image/avatar)')
        .setRequired(false),
    )
    .addUserOption((opt) =>
      opt
        .setName('user')
        .setDescription('Use this user\'s avatar as the image')
        .setRequired(false),
    )
    .setIntegrationTypes(userInstallConfig.integrationTypes)
    .setContexts(userInstallConfig.contexts),

  async execute(interaction) {
    const userId = interaction.user.id;
    const prompt = interaction.options.getString('prompt');

    // 1. Check rate limits / credit cost (gemini-2.5-flash-image costs 14 credits)
    if (!isOwner(userId)) {
      const check = checkRateLimitForSelection(userId, 'gemini', 'gemini-2.5-flash-image');
      if (!check.allowed) {
        await interaction.reply({ content: check.message, ephemeral: true });
        return;
      }
    }

    await interaction.deferReply();

    // Resolve the input image
    const { imageUrl, source } = resolveImageFromInteraction(interaction, {
      imageOptionName: 'image',
      userOptionName: 'user',
      fallbackToInvokerAvatar: true,
    });

    if (!imageUrl) {
      await interaction.editReply('No image found. Pass an `image` URL or use the message command **Use this image** first.');
      return;
    }

    if (!process.env.GOOGLE_AI_KEY) {
      await interaction.editReply('GOOGLE_AI_KEY is not configured on the bot.');
      return;
    }

    try {
      // Fetch the image
      const imageRes = await fetch(imageUrl);
      if (!imageRes.ok) {
        await interaction.editReply(`Failed to download source image from the URL: ${imageRes.statusText}`);
        return;
      }

      const buffer = Buffer.from(await imageRes.arrayBuffer());
      const contentType = imageRes.headers.get('content-type') || 'image/png';

      // 2. Consume credit cost if checks pass and execution starts
      if (!isOwner(userId)) {
        consumeRateLimitForSelection(userId, 'gemini', 'gemini-2.5-flash-image');
      }

      const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_KEY });

      const res = await genAI.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: [
          {
            inlineData: {
              data: buffer.toString('base64'),
              mimeType: contentType,
            },
          },
          prompt,
        ],
      });

      let outputBuffer = null;
      let outputMimeType = 'image/png';
      const candidates = res.candidates;

      if (candidates?.[0]?.content?.parts) {
        for (const part of candidates[0].content.parts) {
          if (part.inlineData) {
            outputBuffer = Buffer.from(part.inlineData.data, 'base64');
            if (part.inlineData.mimeType) {
              outputMimeType = part.inlineData.mimeType;
            }
            break;
          }
        }
      }

      if (!outputBuffer) {
        let textResponse = '';
        if (candidates?.[0]?.content?.parts) {
          for (const part of candidates[0].content.parts) {
            if (part.text) {
              textResponse += part.text;
            }
          }
        }
        if (textResponse) {
          await interaction.editReply(`Model did not return an image. Response: ${textResponse}`);
        } else {
          await interaction.editReply('Model did not return an image. The request might have been blocked or failed.');
        }
        return;
      }

      const maxDiscordSize = 10 * 1024 * 1024; // 10MB
      if (outputBuffer.length <= maxDiscordSize) {
        // Upload directly to Discord
        let ext = 'png';
        if (outputMimeType.includes('jpeg') || outputMimeType.includes('jpg')) ext = 'jpg';
        else if (outputMimeType.includes('gif')) ext = 'gif';
        else if (outputMimeType.includes('webp')) ext = 'webp';

        await interaction.editReply({
          content: `Here is your edited image! (Source: **${source.replace('-', ' ')}**)`,
          files: [{ attachment: outputBuffer, name: `edited_image.${ext}` }],
        });
      } else {
        // Upload to Litterbox
        let ext = 'png';
        if (outputMimeType.includes('jpeg') || outputMimeType.includes('jpg')) ext = 'jpg';
        else if (outputMimeType.includes('gif')) ext = 'gif';
        else if (outputMimeType.includes('webp')) ext = 'webp';

        const formData = new FormData();
        formData.append('reqtype', 'fileupload');
        formData.append('time', '24h');
        const blob = new Blob([outputBuffer], { type: outputMimeType });
        formData.append('fileToUpload', blob, `edited_image.${ext}`);

        const uploadRes = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
          method: 'POST',
          body: formData,
        });

        if (!uploadRes.ok) {
          await interaction.editReply(`Image was edited successfully but failed to upload to Litterbox (${uploadRes.statusText}).`);
          return;
        }

        const fileUrl = await uploadRes.text();
        await interaction.editReply({
          content: `The edited image was too large to upload directly, so I uploaded it to Litterbox:\n${fileUrl}\n(Source: **${source.replace('-', ' ')}**)`
        });
      }

    } catch (err) {
      console.error('[EditImage] Error:', err);
      await interaction.editReply(`An error occurred while editing the image: ${err.message || err}`);
    }
  },
};
