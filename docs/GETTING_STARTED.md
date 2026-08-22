# Getting Started & Running the Project

This guide provides instructions on setting up, running, and managing the **MedSuper Healthcare Platform Backend** locally.

---

## 📋 Prerequisites

Ensure you have the following installed on your machine:
- **Node.js**: v18+ (Recommended v20+)
- **npm**: v9+
- **Docker Desktop**: (for running PostgreSQL + PostGIS & Redis containers)

---

## 🚀 Quick Start Guide

### 1. Environment Configuration
Verify that you have a `.env` file in the root directory. If not, copy from `.env.example`:

```bash
cp .env.example .env
```

Default local database connection in `.env`:
```env
DATABASE_URL="postgresql://medsuper:medsuper@localhost:5432/medsuper?schema=public"
DIRECT_URL="postgresql://medsuper:medsuper@localhost:5432/medsuper?schema=public"
REDIS_URL="redis://localhost:6379"
```

---

### 2. Start Infrastructure Services (Docker)
Start the PostgreSQL (with PostGIS extension) and Redis containers using Docker Compose:

```bash
docker compose up -d
```

To verify that the containers are running and healthy:
```bash
docker compose ps
```

---

### 3. Database Setup & Seeding
Generate the Prisma client, apply database migrations, and seed initial baseline data (roles, policies, specialties):

```bash
# Generate Prisma Client
npm run db:generate

# Apply Database Migrations
npm run db:migrate

# Seed Database
npm run db:seed
```

---

### 4. Running the Application

#### Development Mode (Main API Service)
Start the NestJS API server in hot-reload watch mode:

```bash
npm run start:dev
```
The server will start listening at `http://localhost:3000`.

#### Background Outbox Worker (Optional)
If you are developing or testing outbox pattern event processing, start the worker in a separate terminal:

```bash
npm run start:worker:dev
```

#### Production Mode
To build and run the compiled production JavaScript:

```bash
# Build TypeScript
npm run build

# Start Production Server
npm run start
```

---

## 🛠 Available npm Scripts Reference

| Script | Command | Description |
| :--- | :--- | :--- |
| `start:dev` | `tsx watch src/main.ts` | Runs the NestJS API server with live reloading |
| `start:worker:dev` | `tsx watch src/worker.ts` | Runs the background worker process with live reloading |
| `build` | `tsc` | Compiles TypeScript into JavaScript inside `dist/` |
| `start` | `node dist/main.js` | Launches the built production API server |
| `start:worker` | `node dist/worker.js` | Launches the built production worker process |
| `db:generate` | `prisma generate` | Generates Prisma Client types from schemas |
| `db:migrate` | `prisma migrate dev` | Applies database migrations in dev environment |
| `db:seed` | `tsx src/db/seed.ts` | Populates database with initial seed data |
| `db:studio` | `prisma studio` | Opens Prisma GUI to inspect and manage database data |
| `test` | `jest` | Executes unit tests |
| `test:e2e` | `jest --config ./test/jest-e2e.json` | Executes end-to-end integration tests |
| `lint` | `eslint "src/**/*.ts"` | Lints source files for code standard compliance |
