# Use Puppeteer's official image with Chromium preinstalled
FROM ghcr.io/puppeteer/puppeteer:latest

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY server.js ./

ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "server.js"]
