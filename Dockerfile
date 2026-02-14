FROM node:20-alpine

# Install Chromium for Puppeteer
RUN apk add --no-cache chromium chromium-chromedriver

# Set environment variables for Puppeteer
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_CHROMIUM_ARGS="--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage"

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
# Use npm install rather than npm ci because the lockfile may be out of sync
# Install only production dependencies to keep image small
RUN npm install --omit=dev --no-audit --no-fund

# Copy app source
COPY . .

# Set Docker environment flag
ENV DOCKER_CONTAINER=true

# Expose port used by the server
EXPOSE 3000

# Run the server
CMD ["node", "server.js"]
