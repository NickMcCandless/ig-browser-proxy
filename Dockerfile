# Use a lightweight Node image with Chromium installed
FROM node:18-slim

# Install Chromium
RUN apt-get update && \
    apt-get install -y chromium && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package.json
COPY package.json ./

# Install dependencies without dev dependencies
RUN npm install --omit=dev

# Copy server.js
COPY server.js ./

# Set environment variables for puppeteer executable path and Node environment
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

# Expose port 8080
EXPOSE 8080

# Start the server
CMD ["node", "server.js"]
