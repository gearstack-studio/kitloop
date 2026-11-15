# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS server-deps
WORKDIR /app/server
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY server/package*.json ./
RUN npm ci
COPY server/prisma ./prisma
RUN npx prisma generate

FROM server-deps AS server-test
COPY server/ ./
RUN npm run build
CMD ["npm", "test"]

FROM server-test AS api
RUN npm prune --omit=dev
ENV NODE_ENV=production PORT=3000
USER node
EXPOSE 3000
CMD ["npm", "start"]

FROM node:24-bookworm-slim AS client-test
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build && npm run lint
CMD ["npm", "test"]

FROM nginx:stable-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=client-test /app/client/dist /usr/share/nginx/html
EXPOSE 80

# A one-shot job image. Prisma CLI is isolated from the application runtime.
FROM server-deps AS migration
COPY --from=server-test /app/server/dist/config.js ./dist/config.js
COPY server/scripts/migrate.mjs ./scripts/migrate.mjs
ENV NODE_ENV=production
USER node
ENTRYPOINT ["node", "scripts/migrate.mjs"]

FROM node:24-bookworm-slim AS production-deps
WORKDIR /app/server
COPY server/package*.json ./
# Install only runtime dependencies. Optional Prisma/TypeScript peers belong to the job/build images.
RUN npm pkg delete devDependencies && npm ci --omit=dev --omit=peer --ignore-scripts
COPY --from=server-test /app/server/node_modules/.prisma ./node_modules/.prisma

# Combined single-port image for Cloud Run. HTTPS terminates at Cloud Run.
FROM node:24-bookworm-slim AS production
WORKDIR /app/server
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=production-deps --chown=node:node /app/server/node_modules ./node_modules
COPY --from=server-test --chown=node:node /app/server/dist ./dist
COPY --from=client-test --chown=node:node /app/client/dist ./public
COPY --chown=node:node server/package.json ./package.json
ENV NODE_ENV=production PORT=8080
USER node
EXPOSE 8080
CMD ["node", "dist/index.js"]
