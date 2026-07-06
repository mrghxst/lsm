# Stage 1: build the React frontend
FROM node:22-alpine AS webbuild
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Stage 2: production server
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY server/ ./server/
COPY --from=webbuild /app/web/dist ./web/dist
EXPOSE 3000
CMD ["node", "server/index.js"]
