# T-Shirt Store API

NestJS + Prisma + PostgreSQL capstone project. See `docs/` for the full
design (start with `docs/challenge.md`) and `CLAUDE.md` for project
conventions.

## Local development

### Postgres

Start a local Postgres via Docker Compose:

```bash
docker compose up -d
```

This runs Postgres 17 on `localhost:5432` with:

- user: `tshirt_store`
- password: `tshirt_store`
- database: `tshirt_store`

Data persists in the `postgres_data` volume across restarts; `docker compose
down -v` wipes it.

Set `DATABASE_URL` in `.env` to match:

```
DATABASE_URL="postgresql://tshirt_store:tshirt_store@localhost:5432/tshirt_store"
```

If you already run Postgres locally another way (native install, a shared
dev instance, etc.), skip Compose and point `DATABASE_URL` at that instance
instead.

### App

```bash
npm install
npm run start:dev
```

See `CLAUDE.md` for the full command list (lint, tests, Prisma migrations).
