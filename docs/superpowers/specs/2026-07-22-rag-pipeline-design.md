# RAG-pipeline az askAgent-hez — design spec

> Épít: `docs/chunking.md` (korpuszelemzés + chunking-stratégia indoklás), `docs/architektura.md`, `docs/stack.md`, `docs/system-prompt.md`, `docs/konvenciok.md`.
> Cél: az `askAgent` (jelenleg csak `runSql` + `listCategories` tool a `products` katalóguson) kiegészítése egy tudásbázis-alapú RAG-képességgel a `seed/knowledge/` alatt található 202 gondozási cikk fölött, HyDE + rerank + grounding-gal, két LLM-providerre (Anthropic, OpenAI) elosztott szereposztásban.

## Adottságok (a feladat rögzíti, nem tervezési döntés)

- Vektortár: **pgvector** (Postgres extension).
- Embedding modell: **OpenAI kisebb embedding modell** (`text-embedding-3-small`, 1536 dim).
- **HyDE** (Hypothetical Document Embeddings) a retrievalhoz.
- **Rerank** a retrieval-jelöltek szűkítésére.
- **Grounding**: a válasz forráshivatkozással (dokumentum cím / URL / fájlnév); ha nincs releváns találat, az agent ezt mondja ki, nem hallucinál.
- **Multi-provider routing**: a pipeline-ban Anthropic ÉS OpenAI modell is szerepel, tudatosan szétosztva.
- `OPENAI_API_KEY` már benne van a `.env`-ben.

## 1. Korpusz és chunking (összefoglaló — részletes indoklás: `docs/chunking.md`)

202 md fájl (5 kategória, `plants-101` domináns), egységes YAML frontmatter, átlag ~960 szó/fájl. Minden fájl végén byte-azonos marketing-boilerplate (`## Perfect Pairings For Your Plants` ...), ami egy mintafájlnál a szöveg ~33%-a — ezt determinisztikusan (fix string-határ) le kell vágni chunkolás előtt. A heading-struktúra megbízhatatlan (inkonzisztens mélység), ezért **nem** szigorú heading-alapú vágás, hanem rekurzív, mérethatáros vágás (bekezdés → heading → mondat elválasztó-prioritással), célméret ~250–350 token, ~10–15% átfedéssel, heading csak preferencia, nem kötelező határ.

## 2. Architektúra és adatmodell

```
packages/core/src/lib/knowledge/
├── clean.ts              # frontmatter + boilerplate levágása — pure fn
├── chunk.ts               # tisztított markdown → chunk[] — pure fn, determinisztikus
├── embed-openai.ts        # OpenAI embeddings hívás (text-embedding-3-small)
├── hyde.ts                 # OpenAI mini chat hívás: hipotetikus válasz-bekezdés
├── rerank.ts               # Anthropic Haiku tool-use hívás: relevancia-pontozás (kényszerített JSON)
└── search-knowledge.ts     # orchestrál: hyde → embed → pgvector ANN → rerank → küszöb-szűrés

packages/db/prisma/
├── schema.prisma           # + KnowledgeChunk modell (Unsupported("vector(1536)"))
├── migrations/..._add_knowledge_chunks/migration.sql   # CREATE EXTENSION vector; CREATE TABLE + HNSW index
└── seed-knowledge.ts        # egyszeri betöltő: seed/knowledge/*.md → clean → chunk → embed → INSERT
```

### Adatmodell

```sql
knowledge_chunks (
  id            serial primary key,
  source_file   text,        -- pl. "plants-101__christmas-cactus.md"
  title         text,        -- frontmatter title
  source_url    text,        -- frontmatter source
  category      text,        -- frontmatter category
  chunk_index   int,         -- sorrend a dokumentumon belül
  content       text,        -- tisztított, chunkolt szövegrész
  embedding     vector(1536) -- pgvector, text-embedding-3-small dimenzió
)
```

- Index: `hnsw (embedding vector_cosine_ops)` — a korpusz mérete (~700-800 sor) miatt a típusnak nincs teljesítmény-hatása, de ez a jelenlegi ajánlott alapértelmezés (nincs `lists`-hangolási igény, mint az ivfflat-nál).
- A futásidejű vektor-lekérdezés nyers SQL-lel megy a **read-only poolon** (`db-pool.ts`, `getReadOnlyPool()`), ugyanúgy, mint a `runSql`/`listCategories` — nem próbáljuk a Prisma query buildert pgvector-operátorra hajlítani.
- Nincs szükség a `docker/init-readonly-role.sql` módosítására: az `ALTER DEFAULT PRIVILEGES ... GRANT SELECT ON TABLES` már automatikusan lefedi az új, migrációval létrejövő táblát.
- `packages/core` új dependency: `openai` (hivatalos SDK, ugyanúgy, mint az Anthropic SDK-nál — nem nyers HTTP).

## 3. Modell-szereposztás (multi-provider routing)

| Lépés                                             | Modell                               | Miért                                                                                                                                                         |
| ------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Embedding (index + query/HyDE-doc)                | OpenAI `text-embedding-3-small`      | adottság                                                                                                                                                      |
| HyDE hipotetikus válasz generálása                | OpenAI mini chat modell              | olcsó, gyors, egylövéses generatív lépés; a HyDE lényege, hogy a _plauzibilis_, nem a _helyes_ válasz is javítja a retrievalt — nem igényel mély érvelést     |
| Rerank (relevancia-pontozás)                      | Anthropic Haiku 4.5                  | a kódbázis már Anthropic tool-use mintát használ strukturált JSON kikényszerítésére (`runSql`/`listCategories` tool schema) — ugyanaz a minta újrahasználható |
| Végső válasz szintézis + grounding + orchestráció | Anthropic Sonnet 5 (meglévő `MODEL`) | ez már ma is az agent döntéshozó rétege; bővül egy új `searchKnowledge` tool-lal                                                                              |

**Elv**: a _retrieval-előkészítés_ (gyors/olcsó generálás + vektorszámítás, nem igényel mély érvelést) OpenAI-nál marad — ami amúgy is kötelező az embeddinghez, így nem nyitunk extra providert feleslegesen. A _döntéshozatal/ítélkezés_ (mi releváns, mi a végső válasz) Anthropicnál marad, ami már ma is a termék döntéshozó rétege. Ezzel a multi-provider routing nem formális (csak az embedding OpenAI-nál), hanem érdemi feladat-alapú szétosztás.

Mérlegelt alternatívák: (B) csak az embedding megy OpenAI-hoz, minden generatív lépés Anthropic — egyszerűbb, de a routing formális marad; (C) HyDE és rerank is OpenAI mini, Anthropic csak a végső válaszért — legolcsóbb, de elveszíti a meglévő Anthropic tool-use strukturált kimenet mintáját a reranknél, és egy más gyártó modellje dönt a relevanciáról, mint aki a végső választ adja.

## 4. Futásidejű pipeline (`searchKnowledge` tool)

```
Sonnet: tool_use searchKnowledge(query)
  │
  ├─ 1. HyDE (OpenAI mini):        rövid, hipotetikus válasz-bekezdés a query-re
  ├─ 2. Embed (OpenAI, 3-small):    a HyDE-bekezdés embeddingje
  ├─ 3. pgvector ANN (read-only pool): ORDER BY embedding <=> $1 LIMIT 20  → 20 jelölt
  ├─ 4. Rerank (Anthropic Haiku, tool-use, kényszerített JSON):
  │       az EREDETI user kérdéshez (nem a HyDE-szöveghez) pontoz 0-10-ig mind a 20 jelöltet, egy hívásban
  ├─ 5. Szűrés: score >= 6, majd top 5 megtartása
  └─ 6. { found: false }  ha egy jelölt sem éri el a küszöböt
      { found: true, chunks: [{title, sourceUrl, category, content}, ...] }  egyébként
  │
Sonnet: a tool_result alapján végső NL válasz + "Források:" lista (found:true esetén),
         vagy őszinte "nincs releváns találat" mondat (found:false esetén)
```

- A rerank az **eredeti** kérdésre pontoz, nem a HyDE-szövegre — a HyDE csak a retrievalt segíti (plauzibilis, akár téves szöveg is jó embeddinghez), de a relevancia-ítéletnek a ténylegesen feltett kérdéshez kell igazodnia.
- 20→5, küszöb 6/10: a 20 ANN-jelölt elég szórást ad a reranknek valódi különbségtételhez; az 5 végleges chunk (~250-350 token/chunk) ~1000-1500 token kontextust ad a Sonnetnek egyetlen tool-result-ban; a küszöb kizárja a gyengén kapcsolódó találatokat, hogy az agent inkább az "nincs találat"-ot vallja be, mint hogy gyenge egyezésből válaszoljon.

### Hibakezelés / degradáció

- HyDE-hívás hibázik → fallback: nyers user-kérdés embedelése HyDE-doc helyett, strukturált logger warning, a folyamat folytatódik.
- Rerank-hívás hibázik → fallback: az ANN cosine-sorrend első 5 eleme rerank nélkül, warning logolva.
- Embedding-hívás hibázik → a tool `tool_result`-ja `is_error: true`-val megy vissza (ugyanaz a minta, mint a `runSql` catch ága); a Sonnet a meglévő logikával kezeli.

### Grounding formátum

A válasz természetes nyelvű szövege után egy külön **„Források:”** szakasz sorolja fel a felhasznált dokumentumok címét és URL-jét (nem inline hivatkozás) — egyszerűbb parseolni, következetes formátum minden válaszban.

## 5. System prompt és napló bővítése

- `docs/system-prompt.md`: új `<tools>` bejegyzés a `searchKnowledge`-hez; új `<behavior>` szabály: ha `found: false`, az agent egyértelműen kimondja, hogy nincs releváns információ a tudásbázisban (nem hallucinál); ha `found: true`, a válasz végén „Források:” címszó alatt felsorolja a felhasznált dokumentumok címét és URL-jét.
- `logger.ts` / `InteractionLogEntry`: új `retrieval` mező (HyDE-szöveg, jelölt-darabszám, rerank-pontszámok, kiválasztott chunk id-k) — a `--show-prompt` és a JSONL-napló a RAG-lépéseket is átláthatóvá teszi, az FR4 elvvel konzisztensen.

## 6. Konfiguráció

- Névvel ellátott konstansok (a meglévő `MODEL`/`MAX_TOKENS`/`MAX_TOOL_ROUNDS` mintáját követve, `search-knowledge.ts`-ben): `EMBEDDING_MODEL = 'text-embedding-3-small'`, `HYDE_MODEL`, `RERANK_MODEL = 'claude-haiku-4-5'`, `ANN_CANDIDATES = 20`, `RERANK_KEEP = 5`, `RERANK_THRESHOLD = 6`, `CHUNK_TARGET_TOKENS`, `CHUNK_OVERLAP`.
- `HYDE_MODEL` pontos azonosítója (OpenAI aktuális "mini"-osztályú chat modellje) implementáció előtt Context7/OpenAI doksi alapján megerősítendő — `implementacios-terv.md` meglévő elve: "Új vagy ritkán használt library előtt mindig Context7."

## 7. Tesztelés

| Modul                 | Teszt-jelleg                                                           | Mit ellenőriz                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `clean.ts`            | pure unit, mock nélkül                                                 | frontmatter levágva, boilerplate a fájl végéig eldobva, duplikált H1/kategória-label eltűnik                                            |
| `chunk.ts`            | pure unit, mock nélkül, **determinisztikus**                           | méret-korlátok, overlap helyes, ugyanaz a bemenet mindig ugyanazt a chunk-listát adja, rövid doksi = 1 chunk, hosszú doksi = több chunk |
| `embed-openai.ts`     | unit, mockolt OpenAI kliens                                            | helyes modell-név, helyes kérés/válasz-mapping                                                                                          |
| `hyde.ts`             | unit, mockolt OpenAI kliens                                            | prompt-összeállítás, modell-konstans használata                                                                                         |
| `rerank.ts`           | unit, mockolt Anthropic kliens                                         | tool-schema helyes, Zod-validáció a válaszon, küszöb-szűrés                                                                             |
| `search-knowledge.ts` | unit, minden dependency mockolva                                       | orchestráció sorrendje, HyDE/rerank hiba esetén fallback lefut, `found:false` amikor nincs elég jó jelölt                               |
| `ask-agent.ts`        | a meglévő `ask-agent.spec.ts` bővítése                                 | új tool regisztrálva és dispatch-elve, hibaág (`is_error: true`) kezelve                                                                |
| `seed-knowledge.ts`   | unit a fájl-beolvasás+clean+chunk vezetékre (embedding hívás mockolva) | a tényleges OpenAI-hívás + DB-írás manuális/demo teszt (`implementacios-terv.md` B3.6 mintája)                                          |

## 8. Munkafolyamat ehhez a fejlesztéshez

Ettől a ponttól kezdve a session minden koherens, tesztelt lépése után **kis, fókuszált git commit**, majd **push** (a `dev-workflow.md` meglévő elve szerint, most explicit módon megerősítve). A chunkoló logika (`clean.ts`, `chunk.ts`) tiszta függvény, determinisztikus, unit-tesztelt.

## 9. Kizárt a scope-ból (YAGNI)

- Nincs külön dedikált reranker-szolgáltatás (pl. Cohere) — a rerank Anthropic Haiku tool-use hívással történik, a rögzített két-provider megkötés miatt.
- Nincs automatikus, mindig lefutó middleware-retrieval — a `searchKnowledge` tool-ként épül be, az agent dönt a hívásról (konzisztens a meglévő `runSql`/`listCategories` mintával).
- Nincs multilingual embedding-modell-válogatás — a magyar kérdés / angol tudásbázis nyelvi eltérését elfogadjuk, a végső szintézis (Sonnet) magyarul válaszol, a forrás címe angolul marad (ez a `docs/chunking.md`-ban már jelzett, tudatosan vállalt korlát).
