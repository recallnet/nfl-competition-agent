# syntax=docker/dockerfile:1

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build the application
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# Production image
FROM base AS runner
ENV NODE_ENV=production

# Copy only what's needed to run
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prompts ./prompts
COPY --from=builder /app/package.json ./
COPY --from=deps /app/node_modules ./node_modules

CMD ["node", "dist/agent.js"]

