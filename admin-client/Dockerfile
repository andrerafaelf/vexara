FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS builder
COPY . .
RUN mkdir -p public
ARG NEXT_PUBLIC_ADMIN_API_URL
ENV NEXT_PUBLIC_ADMIN_API_URL=$NEXT_PUBLIC_ADMIN_API_URL
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production

RUN apk add --no-cache wget && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodeuser

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER nodeuser

EXPOSE 3003

CMD ["sh", "-c", "if [ -f server.js ]; then exec node server.js; elif [ -f app.js ]; then exec node app.js; else echo 'No Next standalone entrypoint found (expected server.js or app.js)'; ls -la; exit 1; fi"]
