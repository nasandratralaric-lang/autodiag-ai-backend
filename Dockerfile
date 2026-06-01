FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

# Dev stage
FROM base AS development
RUN npm ci
COPY . .
CMD ["npm", "run", "start:dev"]

# Build stage
FROM base AS builder
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main"]
