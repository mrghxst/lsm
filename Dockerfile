# Stage 1: build the React frontend
FROM node:24-alpine AS webbuild
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2: production server
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
# Install prod deps, then strip the package managers: the runtime only ever
# runs `node server/index.js`, so npm and corepack are dead weight — and
# their bundled deps (undici, tar, …) are the only thing left tripping the
# image scanner. Removing them clears those CVEs for good and shrinks the
# image, without touching anything the app needs.
RUN npm ci --omit=dev \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /root/.npm
COPY server/ ./server/
COPY --from=webbuild /app/web/dist ./web/dist
EXPOSE 3000
CMD ["node", "server/index.js"]
