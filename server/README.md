# Server Project

Express API for Neon Dominion.

## Stack

- Node.js + Express
- Prisma ORM
- PostgreSQL
- JWT auth

## Setup

```bash
npm install
cp .env.example .env
```

Required environment variables:

- `DATABASE_URL`
- `JWT_SECRET`

Recommended for production:

- `NODE_ENV=production`
- `CORS_ORIGINS=https://your-client.example.com,https://your-admin.example.com`

## Database

```bash
npm run db:migrate
npm run db:generate
```

## Run

```bash
npm run dev
```

Server runs on `http://localhost:3001` by default.

## Health Endpoints

- `GET /healthz` - process is running
- `GET /readyz` - process can reach PostgreSQL

## Mission Types

The API currently supports `attack` and `scout` missions. `support` is intentionally disabled for alpha until rules are finalized.
