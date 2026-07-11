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
# Cap the V8 heap well above what the app ever uses (~12 MB) so memory can't
# balloon on a small server; SQLite lives outside this limit in native code.
ENV NODE_OPTIONS=--max-old-space-size=192
COPY package*.json ./
# Install prod deps, then strip the package managers: the runtime only ever
# runs `node server/index.js`, so npm and corepack are dead weight — and
# their bundled deps (undici, tar, …) are the only thing left tripping the
# image scanner. Removing them clears those CVEs for good and shrinks the
# image, without touching anything the app needs.
# Also drop better-sqlite3's bundled SQLite sources (deps/, src/, binding.gyp):
# they exist only to compile the native module at install time; at runtime the
# module loads lib/ + the prebuilt build/Release/better_sqlite3.node.
RUN npm ci --omit=dev \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
    /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /root/.npm \
    node_modules/better-sqlite3/deps node_modules/better-sqlite3/src \
    node_modules/better-sqlite3/binding.gyp
COPY server/ ./server/
COPY --from=webbuild /app/web/dist ./web/dist
EXPOSE 3000
CMD ["node", "server/index.js"]
