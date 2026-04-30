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

Ensure `DATABASE_URL` is set in `.env`.

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
