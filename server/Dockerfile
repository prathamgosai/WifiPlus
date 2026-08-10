# WifiPlus edge measurement server.
# Runs directly from TypeScript via tsx (a production-supported runtime) — the
# measurement code has no build artifact to stale, and startup is sub-second.
FROM node:20-alpine

# Tini gives us correct signal handling so SIGTERM reaches the app for graceful
# shutdown (draining in-flight downloads) rather than being swallowed by npm.
RUN apk add --no-cache tini

WORKDIR /app

# Install production deps first for layer caching. tsx + fastify are runtime
# deps; typescript/vitest are dev-only and excluded by --omit=dev.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY src ./src
COPY tsconfig.json ./

# Run as a non-root user.
USER node

ENV NODE_ENV=production
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npm", "start"]
