FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

FROM dependencies AS builder
WORKDIR /app
COPY . .
RUN npm run prisma:generate
RUN npm run build

FROM dependencies AS migration
WORKDIR /app
COPY . .
RUN npm run prisma:generate
CMD ["sh", "-c", "npm run prisma:deploy && npm run identity:seed"]

FROM node:22-bookworm-slim AS production-dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps

FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/main"]
