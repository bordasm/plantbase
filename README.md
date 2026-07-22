# Plantbase

Ez a repo az ** AI-ágensfejlesztés az alapoktól ** robot_dreams kurzus egyik elkészítendő feladatát tartalmazza.
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
