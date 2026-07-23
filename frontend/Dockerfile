# pnpm 11 (pinned via packageManager) requires Node 22.
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable

COPY package.json ./

# pnpm 11 aborts on ignored build scripts, and only reads this allowlist from
# pnpm-workspace.yaml — the repo's copy lives at the workspace root, outside this
# image's build context, so declare the same packages here.
RUN printf 'allowBuilds:\n  sharp: true\n  unrs-resolver: true\n' > pnpm-workspace.yaml

RUN pnpm install

COPY . .
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./next.config.mjs

EXPOSE 3000
# Call Next directly: running it through pnpm makes the container re-verify the
# dependency tree (and re-hit the build-script allowlist) on every start.
CMD ["./node_modules/.bin/next", "start"]
