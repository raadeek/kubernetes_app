FROM node:20-alpine AS dependencies

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package*.json ./
COPY --chown=node:node src ./src

USER node
EXPOSE 8080

CMD ["node", "src/server.js"]
