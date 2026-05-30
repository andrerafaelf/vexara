FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS builder
COPY . .
# Build-time env vars must be passed as ARGs so Next.js can embed them
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ARG BUILD_ID=dev
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
# Stamp the service worker cache name with this build's ID so every deploy
# invalidates the previous cache (see public/sw.js).
RUN sed -i "s/{{BUILD_ID}}/${BUILD_ID}/g" public/sw.js
# Version-stamp icon filenames so existing PWA installs pick up the new icon
# on next manifest re-read. Change the suffix (v2 → v3) whenever the icon changes.
RUN cp public/vexara192.png public/vexara-icon-v2-192.png && \
    cp public/vexara512.png public/vexara-icon-v2-512.png
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

EXPOSE 3000

CMD ["sh", "-c", "if [ -f server.js ]; then exec node server.js; elif [ -f app.js ]; then exec node app.js; else echo 'No Next standalone entrypoint found (expected server.js or app.js)'; ls -la; exit 1; fi"]
