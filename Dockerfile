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
