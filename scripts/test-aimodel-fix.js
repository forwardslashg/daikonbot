const fs = require('fs');
let content = fs.readFileSync('commands/aimodel.js', 'utf8');

content = content.replace(/container\.components\[1\]\.content =\(/g, 'container.components[1] = { type: 10, content: (');
content = content.replace(/\]\),\n\s*\);/g, '] ) };');

fs.writeFileSync('commands/aimodel.js', content);
