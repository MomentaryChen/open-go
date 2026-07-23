# Playwright's Chromium is glibc-only, so this image cannot be Alpine-based.
FROM node:22-bookworm-slim AS builder
WORKDIR /app

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Prisma probes the openssl binary to pick a query engine; the slim image has no
# openssl, and without it Prisma falls back to a 1.1.x engine that bookworm
# (OpenSSL 3) cannot load at runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY package.json ./

# pnpm 11 aborts on ignored build scripts, and only reads this allowlist from
# pnpm-workspace.yaml — the repo's copy lives at the workspace root, outside this
# image's build context, so declare the same packages here.
RUN printf 'allowBuilds:\n  "@google/genai": true\n  "@prisma/client": true\n  "@prisma/engines": true\n  prisma: true\n  protobufjs: true\n  unrs-resolver: true\n' > pnpm-workspace.yaml

RUN pnpm install

COPY . .
RUN pnpm prisma generate
RUN pnpm build

FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules

# Chromium + its system libraries, used only to read Google's JS-rendered results.
RUN npx playwright install --with-deps chromium \
  && rm -rf /var/lib/apt/lists/*

EXPOSE 3000
CMD ["node", "dist/src/main.js"]
