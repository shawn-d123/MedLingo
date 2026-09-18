# Build context is the repo root (workspace lockfile lives there):
#   docker build -f apps/web/Dockerfile -t medlingo-web .

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
COPY apps/web ./apps/web
# Baked in at build time — Vite inlines VITE_* vars into the client bundle.
ARG VITE_API_BASE=http://localhost:3000/api/jobs
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build --workspace @medlingo/web

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -g 1001 -S nodejs && adduser -S tanstack -u 1001

COPY --from=build --chown=tanstack:nodejs /repo/apps/web/.output ./.output

USER tanstack
EXPOSE 8080
ENV PORT=8080 HOST=0.0.0.0
CMD ["node", ".output/server/index.mjs"]
