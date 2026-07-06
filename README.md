# Scheduler

Automated employee scheduling app — weekly schedule generation, tiered coverage broadcasts for sick calls and day-off requests, and direct shift swaps. Built with Next.js + Supabase + Tailwind.

See [`docs/`](./docs) for the full build plan and roadmap.

---

## Prerequisites

- Node.js LTS (v20+)
- Docker — required by the local Supabase stack

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and fill in values
cp .env.example .env.local
# Edit .env.local — at minimum set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY

# 3. Start the local Supabase stack (requires Docker)
npx supabase start
# This prints the local URL and anon key — paste them into .env.local

# 4. Apply migrations and seed
npx supabase db push

# 5. Start the dev server
npm run dev
# → http://localhost:3000
```

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server on port 3000 |
| `npm run build` | Production build |
| `npm run typecheck` | TypeScript type-check (no emit) |
| `npm run lint` | ESLint |
| `npm run test` | Vitest unit tests (single run) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | Playwright E2E tests |

---

## Supabase migration workflow

```bash
# Create a new migration
npx supabase migration new <descriptive-name>

# Apply to local DB
npx supabase db push

# Regenerate TypeScript types after schema changes
npx supabase gen types typescript --local > src/lib/supabase/database.types.ts

# Apply to remote (production) project
npx supabase db push --db-url <your-remote-db-url>
```
