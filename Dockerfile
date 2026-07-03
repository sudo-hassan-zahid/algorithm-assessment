FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && chown -R node:node /app

ENV NODE_ENV=production
EXPOSE 3000

USER node
CMD ["npm", "run", "start:seeded"]
