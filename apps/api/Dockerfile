# Build context is the repo root (workspace lockfile lives there):
#   docker build -f apps/api/Dockerfile -t medlingo-api .

FROM node:20-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps/api ./apps/api
RUN npm run build --workspace @medlingo/api

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# `output: "standalone"` emits a self-contained server plus the tracing root.
COPY --from=build --chown=nextjs:nodejs /repo/apps/api/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /repo/apps/api/.next/static ./apps/api/.next/static
COPY --from=build --chown=nextjs:nodejs /repo/apps/api/public ./apps/api/public

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "apps/api/server.js"]
