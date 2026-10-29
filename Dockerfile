FROM node:22-bookworm AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ENV PORT=4000
ENV NOTING_DATA_DIR=/data
WORKDIR /app

COPY package.json package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
RUN npm prune --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY server ./server

RUN mkdir -p /data && chown -R node:node /data
USER node

EXPOSE 4000
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/index.js"]
