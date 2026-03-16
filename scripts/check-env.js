require('dotenv').config();

const required = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID'];
const optional = ['GOOGLE_AI_KEY', 'GROQ_API_KEY', 'KLIPY_API_KEY'];

const missingRequired = required.filter((key) => !process.env[key]);
const configuredOptional = optional.filter((key) => Boolean(process.env[key]));

if (missingRequired.length > 0) {
  console.error('Missing required environment variables:');
  for (const key of missingRequired) {
    console.error(`- ${key}`);
  }
  process.exit(1);
}

console.log('Required environment variables are present.');

if (configuredOptional.length === 0) {
  console.warn('No optional provider/API keys configured. Some commands may not work.');
} else {
  console.log(`Optional keys configured: ${configuredOptional.join(', ')}`);
}
