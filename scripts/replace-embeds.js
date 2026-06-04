const fs = require('fs');

const commandFiles = ['commands/vibe.js', 'commands/vibecheck.js', 'commands/roast.js', 'commands/roastuser.js'];

for (const file of commandFiles) {
  let content = fs.readFileSync(file, 'utf8');

  // Replace EmbedBuilder import with V2 Components
  content = content.replace(
    /EmbedBuilder/g,
    'ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, MessageFlags'
  );

  if (file.includes('vibe')) {
    content = content.replace(/const embed = new ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, MessageFlags\(\)[\s\S]*?\.setFooter\(\{[\s\S]*?\}\);/g, `const container = new ContainerBuilder()
        .setAccentColor(colour)
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(\`# ✨ Vibe Check: \${displayName}\`),
              new TextDisplayBuilder().setContent(text)
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder().setURL(fetched.displayAvatarURL({ size: 128 }))
            )
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(\`- # \${isSelf ? \`\${interaction.user.username} wanted their vibes read\` : \`Requested by \${interaction.user.username}\`}\`)
        );`);
  } else {
    content = content.replace(/const embed = new ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, MessageFlags\(\)[\s\S]*?\.setFooter\(\{[\s\S]*?\}\);/g, `const container = new ContainerBuilder()
        .setAccentColor(0xef4444)
        .addSectionComponents(
          new SectionBuilder()
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(\`# 🔥 Roast: \${displayName}\`),
              new TextDisplayBuilder().setContent(text)
            )
            .setThumbnailAccessory(
              new ThumbnailBuilder().setURL(fetched.displayAvatarURL({ size: 128 }))
            )
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(\`- # \${isSelf ? \`\${interaction.user.username} asked for this\` : \`Requested by \${interaction.user.username}\`}\`)
        );`);
  }

  if (file === 'commands/roastuser.js' || file === 'commands/vibecheck.js') {
    content = content.replace(/\isSelf \? `\$\{interaction.user.username\}.*? : /g, '');
  }

  content = content.replace(/embeds: \[embed\],/g, 'components: [container], flags: MessageFlags.IsComponentsV2,');
  content = content.replace(/embeds: \[\]/g, 'components: [makeRecoveryButtons(userId)]');
  content = content.replace(/components: \[makeRecoveryButtons\(userId\)\],/g, ''); // Fix duplicate components

  fs.writeFileSync(file, content);
}
