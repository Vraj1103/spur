# Use Node.js LTS (Long Term Support) as base image
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files first to leverage Docker cache
COPY package*.json ./

# Install dependencies
# --omit=dev installs only production dependencies, but we need dev dependencies to build TS
# So we install all, build, then prune
RUN npm install

# Copy source code
COPY . .

# Build TypeScript code
RUN npm run build

# Remove dev dependencies to keep image small
# RUN npm prune --production

# Expose the port the app runs on
EXPOSE 8000

# Start the application
CMD ["npm", "start"]
