const fs = require('fs');
let content = fs.readFileSync('commands/aimodel.js', 'utf8');

content = content.replace(/container\.components\[1\] = \{ type: 10, content: \(\n\s*\`✅ Model updated to \*\*\$\{parsed\.model\}\*\* \(\$\{providerLabel\(parsed\.provider\)\}\)\`,\n\s*\);/g, 'container.components[1] = { type: 10, content: `✅ Model updated to **${parsed.model}** (${providerLabel(parsed.provider)})` };');

content = content.replace(/container\.components\[1\] = \{ type: 10, content: \(\`✅ Mode set to \*\*\$\{selectedMode\}\*\*\$\{consentNote\}\`\);/g, 'container.components[1] = { type: 10, content: `✅ Mode set to **${selectedMode}**${consentNote}` };');

fs.writeFileSync('commands/aimodel.js', content);
