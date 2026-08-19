# Plantbase

This repo contains an assignment for the **AI Agent Development from the Ground Up** robot_dreams course.
https://robotdreams.hu/

CLI AI agent that translates a natural-language question into SQL over the plant catalog (`products`), runs it read-only, and returns a natural-language answer.

Documentation: see the [`docs/`](docs/) folder, to get started:

- [`docs/brs-plantbase.md`](docs/brs-plantbase.md) — business requirements
- [`docs/stack.md`](docs/stack.md) — tech stack, schema
- [`docs/architektura.md`](docs/architektura.md) — architecture
- [`docs/konvenciok.md`](docs/konvenciok.md) — code conventions
- [`docs/dev-workflow.md`](docs/dev-workflow.md) — git/hook workflow
- [`docs/implementacios-terv.md`](docs/implementacios-terv.md) — implementation plan (phases)
- [`docs/superpowers/specs/2026-07-22-rag-pipeline-design.md`](docs/superpowers/specs/2026-07-22-rag-pipeline-design.md) — RAG pipeline design spec (HyDE, rerank, grounding)
- [`docs/superpowers/plans/2026-07-22-rag-pipeline.md`](docs/superpowers/plans/2026-07-22-rag-pipeline.md) — RAG pipeline implementation plan

## Setting up the knowledge base (RAG)

The `docker compose up -d && prisma migrate deploy && prisma db seed` sequence only loads the `products` catalog. For the `searchKnowledge` agent tool to work (care-guide knowledge base, `knowledge_chunks` table), two more steps are needed:

```bash
npx nx build core
cd packages/db && npx tsx prisma/seed-knowledge.ts
```

Prerequisite: the Postgres image must be `pgvector/pgvector:pg16` (not plain `postgres:16-alpine` — that one doesn't include the pgvector extension; if you're coming from an earlier state, `docker compose up -d` will recreate the container with the new image, and the data persists thanks to the `plantbase_pgdata` volume), and `OPENAI_API_KEY` must be set in `packages/db/.env` (see `packages/db/.env.example`) — Prisma loads the `.env` next to the schema, not the root `.env`.

Without this, the `searchKnowledge` tool runs, but the `knowledge_chunks` table is empty, so it returns `found: false` for every care-related question (the knowledge-base feature stays "seemingly wired up, actually inactive").

## Cost estimate (order of magnitude)

Calculated from an actual production ingestion run (1115 chunks, 202 documents, ~1.24M characters → ~310K tokens) and real CLI logs (the `usage` field in `logs/*.jsonl`), using official Anthropic pricing (Sonnet 5: $3/$15 per 1M input/output tokens; Haiku 4.5: $1/$5 per 1M) and estimated OpenAI "mini"-class pricing (embedding + HyDE, ~$0.02–0.15/1M tokens order of magnitude — the latter is not verified from a live source, informational only):

- **Vectorizing the full knowledge base (ingest):** ~310K tokens × $0.02/1M (`text-embedding-3-small`) ≈ **$0.006** — practically negligible, well under 1 cent.
- **One question through the full pipeline** (HyDE call + embedding + rerank + answer), using average token counts from real logs (Sonnet: ~7700 in/~900 out; Haiku rerank: ~6200 in/~250 out; HyDE+embed: negligible):
  - Sonnet (orchestration + final answer): ~$0.024–0.037 (dominated by the answer generation)
  - Haiku (rerank): ~$0.007
  - OpenAI (HyDE + embedding): ~$0.0001
  - **Total: on the order of $0.03–0.05 / question** (roughly 10-20 HUF).

The figure is mostly driven by Sonnet's final-answer call (this accounts for ~70-80% of the cost); rerank is the second-largest item, HyDE+embedding is practically free in comparison.

## Running the server + web UI (development mode)

In two separate terminals:

```bash
pnpm dev:server   # Express, http://localhost:3000
pnpm dev:web      # Vite dev server, http://localhost:4200
```

The web UI proxies `/api` and `/debug` routes to the server (`apps/web/vite.config.ts`). Sign up for an account, then log in — you can chat with the agent in the browser with streamed responses. The CLI (`pnpm cli ask "..."`) continues to work standalone, without an account.

### Staff/admin test account (order subsystem)

To test the order-management UI, run the staff seed script:

```bash
pnpm --filter @plantbase/db exec tsx prisma/seed-staff.ts
```

This creates a `staff@plantbase.hu` / `Staff1234` and an `admin@plantbase.hu` / `Admin1234` test account. When signed in with these accounts, the web UI displays the order-management interface instead of chat.

---

# Plantbase (magyar)

Ez a repo az **AI-ágensfejlesztés az alapoktól** robot_dreams kurzus egyik elkészítendő feladatát tartalmazza.
https://robotdreams.hu/

CLI AI agent, amely természetes nyelvű kérdést fordít SQL-re a növény-katalógus (`products`) felett, read-only lefuttatja, és természetes nyelvű választ ad.

Dokumentáció: lásd a [`docs/`](docs/) mappát, kezdésnek:

- [`docs/brs-plantbase.md`](docs/brs-plantbase.md) — üzleti követelmények
- [`docs/stack.md`](docs/stack.md) — tech stack, séma
- [`docs/architektura.md`](docs/architektura.md) — architektúra
- [`docs/konvenciok.md`](docs/konvenciok.md) — kódkonvenciók
- [`docs/dev-workflow.md`](docs/dev-workflow.md) — git/hook workflow
- [`docs/implementacios-terv.md`](docs/implementacios-terv.md) — implementációs terv (fázisok)
- [`docs/superpowers/specs/2026-07-22-rag-pipeline-design.md`](docs/superpowers/specs/2026-07-22-rag-pipeline-design.md) — RAG-pipeline design spec (HyDE, rerank, grounding)
- [`docs/superpowers/plans/2026-07-22-rag-pipeline.md`](docs/superpowers/plans/2026-07-22-rag-pipeline.md) — RAG-pipeline implementációs terv

## Tudásbázis (RAG) beállítása

A `docker compose up -d && prisma migrate deploy && prisma db seed` lépéssor csak a `products` katalógust tölti be. A `searchKnowledge` agent-tool működéséhez (gondozási tudásbázis, `knowledge_chunks` tábla) két további lépés is kell:

```bash
npx nx build core
cd packages/db && npx tsx prisma/seed-knowledge.ts
```

Előfeltétel: a Postgres image `pgvector/pgvector:pg16` (nem a sima `postgres:16-alpine` — az nem tartalmazza a pgvector extensiont; ha korábbi állapotból jössz, `docker compose up -d` újra létrehozza a konténert az új image-dzsel, az adat a `plantbase_pgdata` volume miatt megmarad), és `OPENAI_API_KEY` beállítva a `packages/db/.env`-ben (lásd `packages/db/.env.example`) — a Prisma ugyanis a séma melletti `.env`-et tölti be, nem a gyökér `.env`-et.

Enélkül a `searchKnowledge` tool lefut, de a `knowledge_chunks` tábla üres, így minden gondozási kérdésre `found: false`-t ad (a tudásbázis-funkció "látszólag bekötve, valójában inaktív" marad).

## Költségbecslés (nagyságrend)

A tényleges, éles ingestion-futásból (1115 chunk, 202 dokumentum, ~1,24M karakter → kb. 310K token) és valós CLI-naplókból (`logs/*.jsonl` `usage` mezője) számolva, Anthropic hivatalos árazással (Sonnet 5: $3/$15 per 1M input/output token; Haiku 4.5: $1/$5 per 1M) és becsült OpenAI "mini"-osztályú árazással (embedding + HyDE, ~$0,02–0,15/1M token nagyságrend — ez utóbbi nem élő forrásból ellenőrzött, csak tájékoztató):

- **Teljes tudásbázis vektorizálása (ingest):** ~310K token × $0,02/1M (`text-embedding-3-small`) ≈ **$0,006** — gyakorlatilag elhanyagolható, jóval 1 cent alatt.
- **Egy kérdés a teljes pipeline-nal** (HyDE-hívás + embedding + rerank + válasz), valós naplóból vett átlagos token-számokkal (Sonnet: ~7700 be/~900 ki; Haiku rerank: ~6200 be/~250 ki; HyDE+embed: elhanyagolható):
  - Sonnet (orchestráció + végső válasz): ~$0,024–0,037 (a válaszadás dominál)
  - Haiku (rerank): ~$0,007
  - OpenAI (HyDE + embedding): ~$0,0001
  - **Összesen: nagyságrendileg $0,03–0,05 / kérdés** (kb. 10-20 Ft).

A szám nagyrészt a Sonnet végső-válasz hívásától függ (ez adja a költség ~70-80%-át); a rerank a második legnagyobb tétel, a HyDE+embedding gyakorlatilag ingyenes ezekhez képest.

## Szerver + web UI indítása (fejlesztői mód)

Két külön terminálban:

```bash
pnpm dev:server   # Express, http://localhost:3000
pnpm dev:web      # Vite dev-szerver, http://localhost:4200
```

A web UI a `/api` és `/debug` útvonalakat a szerverre proxyzza (`apps/web/vite.config.ts`). Regisztrálj egy fiókot, majd jelentkezz be — az agenttel a böngészőben, streamelt válaszokkal tudsz beszélgetni. A CLI (`pnpm cli ask "..."`) továbbra is külön, fiók nélkül működik.

### Staff/admin teszt-fiók (rendelés-alrendszer)

A rendelés-kezelő felület teszteléséhez futtasd le a staff seed-szkriptet:

```bash
pnpm --filter @plantbase/db exec tsx prisma/seed-staff.ts
```

Ez létrehoz egy `staff@plantbase.hu` / `Staff1234` és egy `admin@plantbase.hu` / `Admin1234` teszt-fiókot. Ezekkel bejelentkezve a web UI a chat helyett a rendelés-kezelő felületet mutatja.
