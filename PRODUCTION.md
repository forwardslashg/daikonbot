# Production Setup

## 1. Configure environment

Copy `.env.example` values into your real environment (or `.env`) and set real secrets:

- `DISCORD_TOKEN` (required)
- `DISCORD_CLIENT_ID` (required)
- `GOOGLE_AI_KEY` (optional, enables Gemini AI commands)
- `GROQ_API_KEY` (optional, enables Groq AI commands)
- `KLIPY_API_KEY` (optional, enables `/toiletfella`)

## 2. Validate required settings

```bash
npm run check:env
```

## 3. Deploy slash commands

```bash
npm run deploy:commands
```

## 4. Run in production

Direct process:

```bash
npm run start:prod
```

PM2 (recommended):

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

## Notes

- The bot now exits early if `DISCORD_TOKEN` is missing.
- `deploy.js` exits early if required Discord env values are missing.
- Graceful shutdown handlers are enabled for `SIGINT` and `SIGTERM`.
