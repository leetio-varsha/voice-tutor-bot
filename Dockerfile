FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY tsconfig.json ./
COPY src ./src

USER node
# Node is PID 1's only child (compose sets init: true), so SIGTERM reaches the graceful shutdown in src/index.ts.
CMD ["node", "--import", "tsx", "src/index.ts"]
