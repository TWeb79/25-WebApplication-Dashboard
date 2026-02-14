FROM node:20-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
# Use npm install rather than npm ci because the lockfile may be out of sync
# Install only production dependencies to keep image small
RUN npm install --omit=dev --no-audit --no-fund

# Copy app source
COPY . .

# Expose port used by the server
EXPOSE 3000

# Run the server
CMD ["node", "server.js"]
