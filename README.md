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

## Költségbecslés (nagyságrend)

A tényleges, éles ingestion-futásból (1115 chunk, 202 dokumentum, ~1,24M karakter → kb. 310K token) és valós CLI-naplókból (`logs/*.jsonl` `usage` mezője) számolva, Anthropic hivatalos árazással (Sonnet 5: $3/$15 per 1M input/output token; Haiku 4.5: $1/$5 per 1M) és becsült OpenAI "mini"-osztályú árazással (embedding + HyDE, ~$0,02–0,15/1M token nagyságrend — ez utóbbi nem élő forrásból ellenőrzött, csak tájékoztató):

- **Teljes tudásbázis vektorizálása (ingest):** ~310K token × $0,02/1M (`text-embedding-3-small`) ≈ **$0,006** — gyakorlatilag elhanyagolható, jóval 1 cent alatt.
- **Egy kérdés a teljes pipeline-nal** (HyDE-hívás + embedding + rerank + válasz), valós naplóból vett átlagos token-számokkal (Sonnet: ~7700 be/~900 ki; Haiku rerank: ~6200 be/~250 ki; HyDE+embed: elhanyagolható):
  - Sonnet (orchestráció + végső válasz): ~$0,024–0,037 (a válaszadás dominál)
  - Haiku (rerank): ~$0,007
  - OpenAI (HyDE + embedding): ~$0,0001
  - **Összesen: nagyságrendileg $0,03–0,05 / kérdés** (kb. 10-20 Ft).

A szám nagyrészt a Sonnet végső-válasz hívásától függ (ez adja a költség ~70-80%-át); a rerank a második legnagyobb tétel, a HyDE+embedding gyakorlatilag ingyenes ezekhez képest.
