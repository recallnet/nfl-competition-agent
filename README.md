# NFL Prediction Agent

Small TypeScript agent that polls the Recall NFL competition API, gathers live context, and posts updated predictions using Vercel's AI SDK.

## Requirements

- Node.js 20+ and pnpm
- Valid credentials for the Recall API and AI gateway
- Base prompt stored at `prompts/game_prediction.md`

## Environment

Create `.env` with the following variables (values shown are examples):

```
AI_GATEWAY_API_KEY=sk-***
AI_GATEWAY_BASE_URL=https://ai-gateway.vercel.sh/v1 # optional override
AI_MODEL=openai/gpt-4o-mini # optional override

RECALL_AGENT_API_KEY=your_recall_agent_api_key
RECALL_BASE_URL=https://api.competitions.recall.network/api # http://localhost:3000/api for local development
COMPETITION_ID=your_competition_id # or pass via --competition-id
AGENT_ID=your_agent_id # optional label for GET /predictions filtering
```

## Install & Run

```
pnpm install
pnpm dev -- --competition-id your_competition_id
```

The dev command starts the polling loop immediately after resolving competition rules; use `CTRL+C` to stop.

## Build & Deploy

```
pnpm build
pnpm start -- --competition-id your_competition_id
```

`pnpm build` emits `dist/agent.js` via tsup so the `start` script can be used in production environments.

## Operational Notes

- The agent re-checks active games every 5 minutes and automatically skips final games.
- Prediction updates are only posted when `shouldUpdatePrediction` deems the delta meaningful.
- Recent play-by-play data is fetched for in-progress games (limit 50, latest first) to feed the prompt.
- AI failures or HTTP errors are logged and skipped so the loop can continue running.
