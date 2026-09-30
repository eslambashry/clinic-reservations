# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS builder
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
RUN npm run db:generate \
    && npm run build \
    && npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update \
    && apt-get install --no-install-recommends -y ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system medsuper \
    && useradd --system --gid medsuper --home-dir /app medsuper
COPY --from=builder --chown=medsuper:medsuper /app/package.json ./package.json
COPY --from=builder --chown=medsuper:medsuper /app/node_modules ./node_modules
COPY --from=builder --chown=medsuper:medsuper /app/dist ./dist
USER medsuper
EXPOSE 3000
CMD ["node", "dist/main.js"]
