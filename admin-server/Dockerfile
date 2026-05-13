FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl

FROM base AS server-deps
WORKDIR /app/server
COPY server/package.json server/package-lock.json* ./
RUN npm ci --include=dev --ignore-scripts

FROM base AS admin-deps
WORKDIR /app/admin-server
COPY admin-server/package.json admin-server/package-lock.json* ./
RUN npm ci --ignore-scripts

FROM base AS builder
WORKDIR /app
COPY --from=server-deps /app/server/node_modules ./server/node_modules
COPY --from=admin-deps /app/admin-server/node_modules ./admin-server/node_modules
COPY server ./server
COPY admin-server ./admin-server
WORKDIR /app/server
RUN DATABASE_URL="postgresql://prisma:prisma@localhost:5432/prisma" npx prisma generate
WORKDIR /app/admin-server
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV NODE_PATH=/app/server/node_modules

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodeuser

WORKDIR /app/admin-server
COPY --from=builder /app/admin-server/dist ./dist
COPY --from=builder /app/admin-server/node_modules ./node_modules
COPY --from=builder /app/admin-server/package.json ./package.json
COPY --from=builder /app/server/node_modules /app/server/node_modules

USER nodeuser

EXPOSE 3002

CMD ["node", "dist/server.js"]
