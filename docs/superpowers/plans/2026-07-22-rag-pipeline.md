# RAG-pipeline az askAgent-hez — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Az `askAgent` (Anthropic Sonnet 5 tool-use loop) kiegészítése egy `searchKnowledge` tool-lal, amely HyDE + pgvector ANN + Anthropic-rerank alapú keresést végez a `seed/knowledge/` alatti 202 gondozási cikk fölött, forráshivatkozással (grounding) és őszinte "nincs találat" viselkedéssel.

**Architecture:** Új `packages/core/src/lib/knowledge/` modulcsoport (tiszta chunking/cleaning függvények + OpenAI embedding/HyDE + Anthropic rerank + orchesztráló `searchKnowledge`), egy új `knowledge_chunks` pgvector-tábla (`packages/db`, Prisma migráció), egy egyszeri betöltő script (`seed-knowledge.ts`), és az `ask-agent.ts` bővítése egy új tool-lal — ugyanabban a mintában, mint a meglévő `runSql`/`listCategories`.

**Tech Stack:** TypeScript strict, Nx/pnpm monorepo, Vitest, Anthropic SDK (`@anthropic-ai/sdk`), OpenAI SDK (`openai`), `pg` (read-only pool), Prisma 6 (migráció + ingestion), Zod, Postgres `pgvector` extension.

## Global Constraints

- Vektortár: pgvector (Postgres extension), HNSW index, cosine távolság (`vector_cosine_ops`).
- Embedding modell: OpenAI `text-embedding-3-small` (1536 dim) — rögzített adottság.
- HyDE, Rerank, Grounding (forrás cím/URL a válasz végén "Források:" szakaszban), és őszinte "nincs találat" viselkedés — mind kötelező.
- Multi-provider routing: retrieval-előkészítés (HyDE, embedding) = OpenAI; ítélkezés (rerank) + orchestráció/végső válasz = Anthropic.
- Csak SELECT az agent felől, olvasás mindig a read-only poolon (`getReadOnlyPool()`), soha nem Prisma-n.
- Determinisztikus, tiszta függvényként megírt chunking/cleaning, unit-tesztelve.
- `konvenciok.md`: strict TS, kebab-case fájlnév, `unknown` a külső inputra, nincs `console.log` a termékkódban (strukturált logger), Zod validáció a rendszerhatáron, kis fókuszált commit minden koherens lépés után, push minden commit után.
- `docs/system-prompt.md` és `packages/core/src/lib/system-prompt.ts` mindig verbátim szinkronban (lásd `system-prompt.spec.ts`).
- `OPENAI_API_KEY` már be van állítva a `.env`-ben; a `.env.example`-t viszont dokumentálni kell.

---

### Task 1: Tudásbázis-dokumentum tisztítása (`clean.ts`)

**Files:**

- Create: `packages/core/src/lib/knowledge/clean.ts`
- Test: `packages/core/src/lib/knowledge/clean.spec.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

- Produces: `export interface CleanedDocument { title: string; sourceUrl: string; category: string; body: string }`, `export function cleanDocument(raw: string): CleanedDocument`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/lib/knowledge/clean.spec.ts
import { cleanDocument } from './clean.js'

const SAMPLE = `---
title: Best Time to Water Your Plants
source: https://www.thesill.com/blogs/care-miscellaneous/best-time-to-water-your-plants
category: care-miscellaneous
---

# Best Time to Water Your Plants

Common Care Questions



When watering your houseplants, keep in mind the time of day.

## Perfect Pairings For Your Plants

* ### Premium Potting Mix

  From $19

##### Words By The Sill

Empowering all people to be plant people.

Do Some Plant Shopping
`

describe('cleanDocument', () => {
  it('extracts frontmatter fields', () => {
    const result = cleanDocument(SAMPLE)

    expect(result.title).toBe('Best Time to Water Your Plants')
    expect(result.sourceUrl).toBe(
      'https://www.thesill.com/blogs/care-miscellaneous/best-time-to-water-your-plants',
    )
    expect(result.category).toBe('care-miscellaneous')
  })

  it('strips the duplicate H1 and breadcrumb label', () => {
    const result = cleanDocument(SAMPLE)

    expect(result.body).not.toContain('# Best Time to Water Your Plants')
    expect(result.body).not.toContain('Common Care Questions')
  })

  it('strips everything from the boilerplate marker onward', () => {
    const result = cleanDocument(SAMPLE)

    expect(result.body).not.toContain('Perfect Pairings')
    expect(result.body).not.toContain('Do Some Plant Shopping')
  })

  it('keeps the real content', () => {
    const result = cleanDocument(SAMPLE)

    expect(result.body).toBe(
      'When watering your houseplants, keep in mind the time of day.',
    )
  })

  it('leaves the body unchanged when the boilerplate marker is absent', () => {
    const withoutBoilerplate = `---
title: X
source: https://example.com
category: plants-101
---

# X

Plants 101

Body text here.
`
    const result = cleanDocument(withoutBoilerplate)

    expect(result.body).toBe('Body text here.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run (from repo root): `npx nx test core`
Expected: FAIL — `Cannot find module './clean.js'` (a fájl még nem létezik).

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/lib/knowledge/clean.ts
export interface CleanedDocument {
  title: string
  sourceUrl: string
  category: string
  body: string
}

const BOILERPLATE_MARKER = '## Perfect Pairings For Your Plants'
const BREADCRUMB_LABELS = new Set([
  'Plants 101',
  'Ask The Sill',
  'Outdoor Care',
  'Common Care Questions',
  'The Basics',
])

function parseFrontmatter(raw: string): {
  fields: Record<string, string>
  rest: string
} {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) {
    return { fields: {}, rest: raw }
  }
  const fields: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const separatorIndex = line.indexOf(':')
    if (separatorIndex === -1) continue
    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim()
    fields[key] = value
  }
  return { fields, rest: match[2] }
}

function stripHeadingAndBreadcrumb(body: string, title: string): string {
  const lines = body.split('\n')
  let index = 0

  while (index < lines.length && lines[index].trim() === '') index++
  if (lines[index]?.trim() === `# ${title}`) {
    index++
    while (index < lines.length && lines[index].trim() === '') index++
    if (BREADCRUMB_LABELS.has(lines[index]?.trim())) {
      index++
      while (index < lines.length && lines[index].trim() === '') index++
    }
  }
  return lines.slice(index).join('\n')
}

function stripBoilerplateTail(body: string): string {
  const markerIndex = body.indexOf(BOILERPLATE_MARKER)
  return markerIndex === -1 ? body : body.slice(0, markerIndex)
}

export function cleanDocument(raw: string): CleanedDocument {
  const { fields, rest } = parseFrontmatter(raw)
  const title = fields.title ?? ''
  const withoutHeading = stripHeadingAndBreadcrumb(rest, title)
  const withoutTail = stripBoilerplateTail(withoutHeading)

  return {
    title,
    sourceUrl: fields.source ?? '',
    category: fields.category ?? '',
    body: withoutTail.trim(),
  }
}
```

- [ ] **Step 4: Export from the package's public API**

```ts
// packages/core/src/index.ts
export * from './lib/ask-agent.js'
export * from './lib/knowledge/clean.js'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx nx test core`
Expected: PASS (5/5 tests in `clean.spec.ts`)

- [ ] **Step 6: Commit and push**

```bash
git add packages/core/src/lib/knowledge/clean.ts packages/core/src/lib/knowledge/clean.spec.ts packages/core/src/index.ts
git commit -m "feat: add deterministic knowledge document cleaner"
git push
```

---

### Task 2: Determinisztikus chunkolás (`chunk.ts`)

**Files:**

- Create: `packages/core/src/lib/knowledge/chunk.ts`
- Test: `packages/core/src/lib/knowledge/chunk.spec.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

- Consumes: semmi (tiszta függvény, csak stringet kap)
- Produces: `export interface ChunkOptions { targetWords: number; overlapWords: number }`, `export const DEFAULT_CHUNK_OPTIONS: ChunkOptions`, `export function chunkText(body: string, options?: ChunkOptions): string[]`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/lib/knowledge/chunk.spec.ts
import { chunkText } from './chunk.js'

describe('chunkText', () => {
  it('returns a single chunk when the body is shorter than the target size', () => {
    const body = 'Short paragraph about watering.\n\nAnother short paragraph.'

    const chunks = chunkText(body, { targetWords: 220, overlapWords: 30 })

    expect(chunks).toEqual([body])
  })

  it('splits a long document into multiple chunks near the target size', () => {
    const paragraph = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ')
    const body = Array.from({ length: 10 }, () => paragraph).join('\n\n')

    const chunks = chunkText(body, { targetWords: 100, overlapWords: 20 })

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.trim().split(/\s+/).length).toBeLessThanOrEqual(130)
    }
  })

  it('carries the trailing paragraph of a chunk into the start of the next chunk (overlap)', () => {
    const paragraphs = [
      'P1 '.repeat(20),
      'P2 '.repeat(20),
      'P3 '.repeat(20),
      'P4 '.repeat(20),
    ]
    const body = paragraphs.join('\n\n')

    const chunks = chunkText(body, { targetWords: 40, overlapWords: 20 })

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[1].startsWith(paragraphs[1].trim())).toBe(true)
  })

  it('is deterministic: same input always produces the same output', () => {
    const body = Array.from({ length: 5 }, (_, i) =>
      `Paragraph number ${i}. `.repeat(10),
    ).join('\n\n')

    const first = chunkText(body)
    const second = chunkText(body)

    expect(first).toEqual(second)
  })

  it('splits an oversized single paragraph by sentence', () => {
    const sentence = 'This is one sentence about plant care. '
    const hugeParagraph = sentence.repeat(60)

    const chunks = chunkText(hugeParagraph, {
      targetWords: 100,
      overlapWords: 10,
    })

    expect(chunks.length).toBeGreaterThan(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test core`
Expected: FAIL — `Cannot find module './chunk.js'`

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/lib/knowledge/chunk.ts
export interface ChunkOptions {
  targetWords: number
  overlapWords: number
}

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  targetWords: 220,
  overlapWords: 30,
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function splitIntoSentences(paragraph: string): string[] {
  return paragraph.split(/(?<=[.!?])\s+/).filter(Boolean)
}

function splitOversizedParagraph(
  paragraph: string,
  targetWords: number,
): string[] {
  const sentences = splitIntoSentences(paragraph)
  const pieces: string[] = []
  let current: string[] = []
  let currentWords = 0

  for (const sentence of sentences) {
    const sentenceWords = countWords(sentence)
    if (currentWords > 0 && currentWords + sentenceWords > targetWords) {
      pieces.push(current.join(' '))
      current = []
      currentWords = 0
    }
    current.push(sentence)
    currentWords += sentenceWords
  }
  if (current.length > 0) pieces.push(current.join(' '))
  return pieces
}

function takeOverlapParagraphs(
  paragraphs: string[],
  overlapWords: number,
): string[] {
  const overlap: string[] = []
  let words = 0
  for (let i = paragraphs.length - 1; i >= 0 && words < overlapWords; i--) {
    overlap.unshift(paragraphs[i])
    words += countWords(paragraphs[i])
  }
  return overlap
}

export function chunkText(
  body: string,
  options: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
): string[] {
  const rawParagraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  const paragraphs = rawParagraphs.flatMap((paragraph) =>
    countWords(paragraph) > options.targetWords
      ? splitOversizedParagraph(paragraph, options.targetWords)
      : [paragraph],
  )

  const chunks: string[] = []
  let current: string[] = []
  let currentWords = 0

  for (const paragraph of paragraphs) {
    const paragraphWords = countWords(paragraph)
    if (
      currentWords > 0 &&
      currentWords + paragraphWords > options.targetWords
    ) {
      chunks.push(current.join('\n\n'))
      current = takeOverlapParagraphs(current, options.overlapWords)
      currentWords = countWords(current.join(' '))
    }
    current.push(paragraph)
    currentWords += paragraphWords
  }
  if (current.length > 0) chunks.push(current.join('\n\n'))

  return chunks
}
```

- [ ] **Step 4: Export from the package's public API**

```ts
// packages/core/src/index.ts
export * from './lib/ask-agent.js'
export * from './lib/knowledge/clean.js'
export * from './lib/knowledge/chunk.js'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx nx test core`
Expected: PASS (5/5 tests in `chunk.spec.ts`)

- [ ] **Step 6: Commit and push**

```bash
git add packages/core/src/lib/knowledge/chunk.ts packages/core/src/lib/knowledge/chunk.spec.ts packages/core/src/index.ts
git commit -m "feat: add deterministic recursive chunker"
git push
```

---

### Task 3: `knowledge_chunks` pgvector tábla (Prisma migráció)

**Files:**

- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_add_knowledge_chunks/migration.sql`

**Interfaces:**

- Produces: `knowledge_chunks` tábla (`id, source_file, title, source_url, category, chunk_index, content, embedding vector(1536)`), HNSW index `embedding <=> `-hez.

- [ ] **Step 1: Add the model to schema.prisma**

```prisma
// packages/db/prisma/schema.prisma — az meglévő `model Product { ... }` blokk UTÁN:

model KnowledgeChunk {
  id          Int    @id @default(autoincrement())
  source_file String
  title       String
  source_url  String
  category    String
  chunk_index Int
  content     String
  embedding   Unsupported("vector(1536)")

  @@map("knowledge_chunks")
}
```

- [ ] **Step 2: Generate a create-only migration**

Run (a `packages/db` könyvtárból): `npx prisma migrate dev --name add_knowledge_chunks --create-only`
Expected: létrejön `packages/db/prisma/migrations/<timestamp>_add_knowledge_chunks/migration.sql`, DE MÉG NINCS alkalmazva.

- [ ] **Step 3: Hand-edit the generated migration.sql**

```sql
-- packages/db/prisma/migrations/<timestamp>_add_knowledge_chunks/migration.sql
-- CreateExtension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "knowledge_chunks" (
    "id" SERIAL NOT NULL,
    "source_file" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "source_url" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,

    CONSTRAINT "knowledge_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_chunks_embedding_idx" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);
```

(A Prisma által generált `"embedding" vector(1536) NOT NULL` sor önmagában rendben lesz — csak az extension-létrehozást előre, az index-létrehozást pedig utána kell hozzáfűzni, mert ezt a két dolgot a Prisma nem generálja le magától.)

- [ ] **Step 4: Apply the migration**

Run (a `packages/db` könyvtárból): `npx prisma migrate dev`
Expected: "Applying migration `<timestamp>_add_knowledge_chunks`" — sikeres, `npx prisma generate` is lefut a végén.

- [ ] **Step 5: Verify the table and index exist**

Run: `docker exec plantbase-postgres-1 psql -U plantbase -d plantbase -c "\d knowledge_chunks"`
Expected: az oszlopok listája + `"knowledge_chunks_embedding_idx" hnsw (embedding vector_cosine_ops)` az indexek között.

- [ ] **Step 6: Verify the read-only role can already SELECT it**

Run: `docker exec plantbase-postgres-1 psql -U plantbase -d plantbase -c "\dp knowledge_chunks"`
Expected: a jogosultság-listában szerepel `plantbase_ro=r/plantbase` (SELECT) — ezt a `docker/init-readonly-role.sql` `ALTER DEFAULT PRIVILEGES` sora automatikusan beállította, nincs hozzá teendő.

- [ ] **Step 7: Commit and push**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat: add knowledge_chunks pgvector table and hnsw index"
git push
```

---

### Task 4: OpenAI embedding wrapper (`embed-openai.ts`)

**Files:**

- Modify: `packages/core/package.json` (új dependency)
- Modify: `.env.example`
- Create: `packages/core/src/lib/knowledge/embed-openai.ts`
- Test: `packages/core/src/lib/knowledge/embed-openai.spec.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

- Produces: `export const EMBEDDING_MODEL = 'text-embedding-3-small'`, `export function embedTexts(texts: string[]): Promise<number[][]>`

- [ ] **Step 1: Add the OpenAI SDK dependency**

Run: `pnpm add openai --filter @plantbase/core`
Expected: `openai` megjelenik a `packages/core/package.json` `dependencies` alatt.

- [ ] **Step 2: Document the env var**

```bash
# .env.example — az ANTHROPIC_API_KEY sor UTÁN:
OPENAI_API_KEY="sk-..."
```

- [ ] **Step 3: Write the failing test**

```ts
// packages/core/src/lib/knowledge/embed-openai.spec.ts
import OpenAI from 'openai'
import { EMBEDDING_MODEL, embedTexts } from './embed-openai.js'

vi.mock('openai', () => ({
  default: vi.fn(),
}))

function mockEmbeddingsCreate(embeddings: number[][]) {
  const create = vi.fn().mockResolvedValue({
    data: embeddings.map((embedding) => ({ embedding })),
  })
  vi.mocked(OpenAI).mockImplementation(function OpenAIMock() {
    return { embeddings: { create } } as never
  })
  return create
}

describe('embedTexts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns one embedding vector per input text', async () => {
    mockEmbeddingsCreate([
      [0.1, 0.2],
      [0.3, 0.4],
    ])

    const result = await embedTexts(['alma', 'körte'])

    expect(result).toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ])
  })

  it('calls the OpenAI embeddings endpoint with the configured small model', async () => {
    const create = mockEmbeddingsCreate([[0.1]])

    await embedTexts(['alma'])

    expect(create).toHaveBeenCalledWith({
      model: EMBEDDING_MODEL,
      input: ['alma'],
    })
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx nx test core`
Expected: FAIL — `Cannot find module './embed-openai.js'`

- [ ] **Step 5: Write minimal implementation**

```ts
// packages/core/src/lib/knowledge/embed-openai.ts
import OpenAI from 'openai'

export const EMBEDDING_MODEL = 'text-embedding-3-small'

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const client = new OpenAI()
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  })
  return response.data.map((item) => item.embedding)
}
```

- [ ] **Step 6: Export from the package's public API**

```ts
// packages/core/src/index.ts
export * from './lib/ask-agent.js'
export * from './lib/knowledge/clean.js'
export * from './lib/knowledge/chunk.js'
export * from './lib/knowledge/embed-openai.js'
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx nx test core`
Expected: PASS (2/2 tests in `embed-openai.spec.ts`)

- [ ] **Step 8: Commit and push**

```bash
git add packages/core/package.json .env.example packages/core/src/lib/knowledge/embed-openai.ts packages/core/src/lib/knowledge/embed-openai.spec.ts packages/core/src/index.ts pnpm-lock.yaml
git commit -m "feat: add OpenAI embedding wrapper"
git push
```

---

### Task 5: HyDE hipotetikus válasz generálás (`hyde.ts`)

**Files:**

- Create: `packages/core/src/lib/knowledge/hyde.ts`
- Test: `packages/core/src/lib/knowledge/hyde.spec.ts`

**Interfaces:**

- Produces: `export const HYDE_MODEL = 'gpt-5-mini'`, `export function generateHydeDocument(question: string): Promise<string>`

> **Megjegyzés implementáláskor:** a `HYDE_MODEL` értékét (`'gpt-5-mini'`) az OpenAI aktuális dokumentációja (Context7) alapján erősítsd meg implementálás előtt — ha időközben más a jelenlegi "mini"-osztályú chat modell neve, azt írd a konstansba, a kód többi része változatlan marad.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/lib/knowledge/hyde.spec.ts
import OpenAI from 'openai'
import { HYDE_MODEL, generateHydeDocument } from './hyde.js'

vi.mock('openai', () => ({
  default: vi.fn(),
}))

function mockChatCompletion(text: string | undefined) {
  const create = vi.fn().mockResolvedValue({
    choices: [{ message: { content: text } }],
  })
  vi.mocked(OpenAI).mockImplementation(function OpenAIMock() {
    return { chat: { completions: { create } } } as never
  })
  return create
}

describe('generateHydeDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the generated hypothetical answer text', async () => {
    mockChatCompletion('A pozsgásokat ritkán kell öntözni.')

    const result = await generateHydeDocument(
      'Milyen gyakran öntözzem a pozsgásokat?',
    )

    expect(result).toBe('A pozsgásokat ritkán kell öntözni.')
  })

  it('calls the chat completions endpoint with the configured HyDE model', async () => {
    const create = mockChatCompletion('válasz')

    await generateHydeDocument('kérdés')

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ model: HYDE_MODEL }),
    )
  })

  it('falls back to the original question if the model returns no content', async () => {
    mockChatCompletion(undefined)

    const result = await generateHydeDocument('eredeti kérdés')

    expect(result).toBe('eredeti kérdés')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test core`
Expected: FAIL — `Cannot find module './hyde.js'`

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/lib/knowledge/hyde.ts
import OpenAI from 'openai'

export const HYDE_MODEL = 'gpt-5-mini'

export async function generateHydeDocument(question: string): Promise<string> {
  const client = new OpenAI()
  const response = await client.chat.completions.create({
    model: HYDE_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'Írj egy rövid (2-4 mondatos), plauzibilis válaszbekezdést a felhasználó növénygondozási kérdésére, mintha egy szakcikk részlete lenne. Nem baj, ha a részletek nem pontosak -- ez csak egy keresési segédlet, nem a végső válasz.',
      },
      { role: 'user', content: question },
    ],
  })
  return response.choices[0]?.message?.content ?? question
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test core`
Expected: PASS (3/3 tests in `hyde.spec.ts`)

- [ ] **Step 5: Commit and push**

```bash
git add packages/core/src/lib/knowledge/hyde.ts packages/core/src/lib/knowledge/hyde.spec.ts
git commit -m "feat: add HyDE hypothetical-document generation (OpenAI)"
git push
```

---

### Task 6: Anthropic rerank (`rerank.ts`)

**Files:**

- Modify: `packages/core/package.json` (új dependency: `zod`)
- Create: `packages/core/src/lib/knowledge/rerank.ts`
- Test: `packages/core/src/lib/knowledge/rerank.spec.ts`

**Interfaces:**

- Produces: `export const RERANK_MODEL = 'claude-haiku-4-5-20251001'`, `export interface RerankCandidate { id: number; content: string }`, `export interface RerankScore { id: number; score: number }`, `export function rerankChunks(question: string, candidates: RerankCandidate[]): Promise<RerankScore[]>`

- [ ] **Step 1: Add the zod dependency**

Run: `pnpm add zod --filter @plantbase/core`
Expected: `zod` megjelenik a `packages/core/package.json` `dependencies` alatt.

- [ ] **Step 2: Write the failing test**

```ts
// packages/core/src/lib/knowledge/rerank.spec.ts
import Anthropic from '@anthropic-ai/sdk'
import { RERANK_MODEL, rerankChunks } from './rerank.js'

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(),
}))

function mockToolResponse(scores: { id: number; score: number }[]) {
  const create = vi.fn().mockResolvedValue({
    content: [
      {
        type: 'tool_use',
        id: 'tool_1',
        name: 'submitScores',
        input: { scores },
      },
    ],
  })
  vi.mocked(Anthropic).mockImplementation(function AnthropicMock() {
    return { messages: { create } } as never
  })
  return create
}

describe('rerankChunks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the scores parsed from the submitScores tool call', async () => {
    mockToolResponse([
      { id: 1, score: 8 },
      { id: 2, score: 3 },
    ])

    const result = await rerankChunks('kérdés', [
      { id: 1, content: 'egyik jelölt' },
      { id: 2, content: 'másik jelölt' },
    ])

    expect(result).toEqual([
      { id: 1, score: 8 },
      { id: 2, score: 3 },
    ])
  })

  it('forces the submitScores tool via tool_choice, using the configured rerank model', async () => {
    const create = mockToolResponse([{ id: 1, score: 5 }])

    await rerankChunks('kérdés', [{ id: 1, content: 'jelölt' }])

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: RERANK_MODEL,
        tool_choice: { type: 'tool', name: 'submitScores' },
      }),
    )
  })

  it('throws when the model does not call submitScores', async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'nem hívom' }],
    })
    vi.mocked(Anthropic).mockImplementation(function AnthropicMock() {
      return { messages: { create } } as never
    })

    await expect(
      rerankChunks('kérdés', [{ id: 1, content: 'x' }]),
    ).rejects.toThrow('nem hívta meg')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx nx test core`
Expected: FAIL — `Cannot find module './rerank.js'`

- [ ] **Step 4: Write minimal implementation**

```ts
// packages/core/src/lib/knowledge/rerank.ts
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

export const RERANK_MODEL = 'claude-haiku-4-5-20251001'

const RerankResponseSchema = z.object({
  scores: z.array(
    z.object({
      id: z.number(),
      score: z.number(),
    }),
  ),
})

const SUBMIT_SCORES_TOOL: Anthropic.Tool = {
  name: 'submitScores',
  description:
    'Relevancia-pontszám (0-10) beküldése minden jelölt szövegrészhez, a kérdéshez viszonyítva.',
  input_schema: {
    type: 'object',
    properties: {
      scores: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            score: { type: 'number' },
          },
          required: ['id', 'score'],
        },
      },
    },
    required: ['scores'],
  },
}

export interface RerankCandidate {
  id: number
  content: string
}

export interface RerankScore {
  id: number
  score: number
}

export async function rerankChunks(
  question: string,
  candidates: RerankCandidate[],
): Promise<RerankScore[]> {
  const client = new Anthropic()
  const candidateList = candidates
    .map((candidate) => `[${candidate.id}] ${candidate.content}`)
    .join('\n\n')

  const response = await client.messages.create({
    model: RERANK_MODEL,
    max_tokens: 1024,
    tools: [SUBMIT_SCORES_TOOL],
    tool_choice: { type: 'tool', name: 'submitScores' },
    messages: [
      {
        role: 'user',
        content: `Kérdés: ${question}\n\nJelöltek:\n${candidateList}\n\nPontozd 0-10-ig mindegyik jelölt relevanciáját a kérdéshez a submitScores tool hívásával.`,
      },
    ],
  })

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  )
  if (!toolUse) {
    throw new Error('A rerank modell nem hívta meg a submitScores toolt.')
  }

  return RerankResponseSchema.parse(toolUse.input).scores
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx nx test core`
Expected: PASS (3/3 tests in `rerank.spec.ts`)

- [ ] **Step 6: Commit and push**

```bash
git add packages/core/package.json pnpm-lock.yaml packages/core/src/lib/knowledge/rerank.ts packages/core/src/lib/knowledge/rerank.spec.ts
git commit -m "feat: add Anthropic tool-use relevance rerank"
git push
```

---

### Task 7: Napló bővítése (`logger.ts`) — retrieval trace + warning log

**Files:**

- Modify: `packages/core/src/lib/logger.ts`
- Modify: `packages/core/src/lib/logger.spec.ts`

**Interfaces:**

- Produces: `export interface RetrievalTrace { query: string; hydeText: string; candidateCount: number; scores: { id: number; score: number }[]; selectedChunkIds: number[]; found: boolean }`, `export interface WarningLogEntry { timestamp: string; event: string; message: string }`, `export function logWarning(entry: WarningLogEntry): Promise<void>`
- Modifies: `InteractionLogEntry` — új kötelező mező: `retrieval: RetrievalTrace[]`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/src/lib/logger.spec.ts — a TELJES fájl új tartalma
import { appendFile, mkdir } from 'node:fs/promises'
import type { InteractionLogEntry } from './logger.js'

vi.mock('node:fs/promises', () => ({
  appendFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}))

function sampleEntry(
  overrides: Partial<InteractionLogEntry> = {},
): InteractionLogEntry {
  return {
    timestamp: '2026-07-16T00:00:00.000Z',
    systemPrompt: 'system prompt',
    messages: [],
    generatedSql: [],
    retrieval: [],
    answer: 'answer',
    usage: { inputTokens: 1, outputTokens: 2 },
    ...overrides,
  }
}

describe('logInteraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('creates the logs directory before writing', async () => {
    const { logInteraction } = await import('./logger.js')

    await logInteraction(sampleEntry())

    expect(mkdir).toHaveBeenCalledWith(expect.stringMatching(/logs$/), {
      recursive: true,
    })
  })

  it('appends the entry as a JSONL line to a .jsonl file under logs/', async () => {
    const { logInteraction } = await import('./logger.js')
    const entry = sampleEntry()

    await logInteraction(entry)

    expect(appendFile).toHaveBeenCalledWith(
      expect.stringMatching(/logs[\\/].*\.jsonl$/),
      `${JSON.stringify(entry)}\n`,
      'utf-8',
    )
  })

  it('reuses the same log file across multiple calls in one process', async () => {
    const { logInteraction } = await import('./logger.js')

    await logInteraction(sampleEntry())
    await logInteraction(sampleEntry({ answer: 'second answer' }))

    const [firstPath] = vi.mocked(appendFile).mock.calls[0]
    const [secondPath] = vi.mocked(appendFile).mock.calls[1]
    expect(secondPath).toBe(firstPath)
  })
})

describe('logWarning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('appends the warning as a JSONL line to logs/warnings.jsonl', async () => {
    const { logWarning } = await import('./logger.js')
    const entry = {
      timestamp: '2026-07-22T00:00:00.000Z',
      event: 'hyde_failed',
      message: 'timeout',
    }

    await logWarning(entry)

    expect(appendFile).toHaveBeenCalledWith(
      expect.stringMatching(/logs[\\/]warnings\.jsonl$/),
      `${JSON.stringify(entry)}\n`,
      'utf-8',
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test core`
Expected: FAIL — `retrieval` mező hiányzik az `InteractionLogEntry` típusból (TS hiba), és `logWarning` nem létezik.

- [ ] **Step 3: Modify the implementation**

```ts
// packages/core/src/lib/logger.ts — a TELJES fájl új tartalma
import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type Anthropic from '@anthropic-ai/sdk'

export interface RetrievalTrace {
  query: string
  hydeText: string
  candidateCount: number
  scores: { id: number; score: number }[]
  selectedChunkIds: number[]
  found: boolean
}

export interface InteractionLogEntry {
  timestamp: string
  systemPrompt: string
  messages: Anthropic.MessageParam[]
  generatedSql: string[]
  retrieval: RetrievalTrace[]
  answer: string
  usage: { inputTokens: number; outputTokens: number }
}

export interface WarningLogEntry {
  timestamp: string
  event: string
  message: string
}

const LOG_DIR = join(process.cwd(), 'logs')

// Egy logfájl / folyamat-futás (a CLI indulásának időbélyegével), minden
// interakció (kérdés) egy-egy JSONL sorként kerül bele -- FR4.
let logFileName: string | undefined

function getLogFileName(): string {
  logFileName ??= `${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`
  return logFileName
}

export async function logInteraction(
  entry: InteractionLogEntry,
): Promise<void> {
  await mkdir(LOG_DIR, { recursive: true })
  await appendFile(
    join(LOG_DIR, getLogFileName()),
    `${JSON.stringify(entry)}\n`,
    'utf-8',
  )
}

export async function logWarning(entry: WarningLogEntry): Promise<void> {
  await mkdir(LOG_DIR, { recursive: true })
  await appendFile(
    join(LOG_DIR, 'warnings.jsonl'),
    `${JSON.stringify(entry)}\n`,
    'utf-8',
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test core`
Expected: PASS (4/4 tests)

- [ ] **Step 5: Commit and push**

```bash
git add packages/core/src/lib/logger.ts packages/core/src/lib/logger.spec.ts
git commit -m "feat: add retrieval trace field and structured warning logging"
git push
```

---

### Task 8: Orchesztráció (`search-knowledge.ts`)

**Files:**

- Create: `packages/core/src/lib/knowledge/search-knowledge.ts`
- Test: `packages/core/src/lib/knowledge/search-knowledge.spec.ts`

**Interfaces:**

- Consumes: `getReadOnlyPool` (`../db-pool.js`), `logWarning`, `type RetrievalTrace` (`../logger.js`), `embedTexts` (`./embed-openai.js`), `generateHydeDocument` (`./hyde.js`), `rerankChunks` (`./rerank.js`)
- Produces: `export const ANN_CANDIDATES = 20`, `export const RERANK_KEEP = 5`, `export const RERANK_THRESHOLD = 6`, `export interface KnowledgeChunkResult { title: string; sourceUrl: string; category: string; content: string }`, `export interface SearchKnowledgeResult { found: boolean; chunks: KnowledgeChunkResult[] }`, `export interface SearchKnowledgeOutput { result: SearchKnowledgeResult; trace: RetrievalTrace }`, `export function searchKnowledge(query: string): Promise<SearchKnowledgeOutput>`

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/src/lib/knowledge/search-knowledge.spec.ts
import { getReadOnlyPool } from '../db-pool.js'
import { logWarning } from '../logger.js'
import { embedTexts } from './embed-openai.js'
import { generateHydeDocument } from './hyde.js'
import { rerankChunks } from './rerank.js'
import { searchKnowledge } from './search-knowledge.js'

vi.mock('../db-pool.js', () => ({ getReadOnlyPool: vi.fn() }))
vi.mock('../logger.js', () => ({ logWarning: vi.fn() }))
vi.mock('./embed-openai.js', () => ({ embedTexts: vi.fn() }))
vi.mock('./hyde.js', () => ({ generateHydeDocument: vi.fn() }))
vi.mock('./rerank.js', () => ({ rerankChunks: vi.fn() }))

function mockCandidates(
  rows: {
    id: number
    title: string
    source_url: string
    category: string
    content: string
  }[],
) {
  const query = vi.fn().mockResolvedValue({ rows })
  vi.mocked(getReadOnlyPool).mockReturnValue({ query } as never)
  return query
}

describe('searchKnowledge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(generateHydeDocument).mockResolvedValue('hipotetikus válasz')
    vi.mocked(embedTexts).mockResolvedValue([[0.1, 0.2]])
  })

  it('returns found:false when there are no ANN candidates', async () => {
    mockCandidates([])

    const { result, trace } = await searchKnowledge('öntözés?')

    expect(result).toEqual({ found: false, chunks: [] })
    expect(trace.candidateCount).toBe(0)
  })

  it('keeps only candidates scoring at or above the threshold, best first, capped at 5', async () => {
    mockCandidates([
      {
        id: 1,
        title: 'A',
        source_url: 'urlA',
        category: 'plants-101',
        content: 'contentA',
      },
      {
        id: 2,
        title: 'B',
        source_url: 'urlB',
        category: 'plants-101',
        content: 'contentB',
      },
      {
        id: 3,
        title: 'C',
        source_url: 'urlC',
        category: 'plants-101',
        content: 'contentC',
      },
    ])
    vi.mocked(rerankChunks).mockResolvedValue([
      { id: 1, score: 4 },
      { id: 2, score: 9 },
      { id: 3, score: 7 },
    ])

    const { result } = await searchKnowledge('öntözés?')

    expect(result.found).toBe(true)
    expect(result.chunks.map((chunk) => chunk.title)).toEqual(['B', 'C'])
  })

  it('returns found:false when every candidate scores below the threshold', async () => {
    mockCandidates([
      {
        id: 1,
        title: 'A',
        source_url: 'urlA',
        category: 'plants-101',
        content: 'x',
      },
    ])
    vi.mocked(rerankChunks).mockResolvedValue([{ id: 1, score: 2 }])

    const { result } = await searchKnowledge('öntözés?')

    expect(result).toEqual({ found: false, chunks: [] })
  })

  it('falls back to the raw question embedding when HyDE fails, and logs a warning', async () => {
    vi.mocked(generateHydeDocument).mockRejectedValue(new Error('timeout'))
    const query = mockCandidates([])

    await searchKnowledge('öntözés?')

    expect(embedTexts).toHaveBeenCalledWith(['öntözés?'])
    expect(logWarning).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'hyde_failed' }),
    )
    expect(query).toHaveBeenCalled()
  })

  it('falls back to ANN order when rerank fails, and logs a warning', async () => {
    mockCandidates([
      {
        id: 1,
        title: 'A',
        source_url: 'urlA',
        category: 'plants-101',
        content: 'x',
      },
    ])
    vi.mocked(rerankChunks).mockRejectedValue(new Error('rerank down'))

    const { result } = await searchKnowledge('öntözés?')

    expect(result.found).toBe(true)
    expect(result.chunks[0].title).toBe('A')
    expect(logWarning).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'rerank_failed' }),
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test core`
Expected: FAIL — `Cannot find module './search-knowledge.js'`

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/lib/knowledge/search-knowledge.ts
import { getReadOnlyPool } from '../db-pool.js'
import { logWarning, type RetrievalTrace } from '../logger.js'
import { embedTexts } from './embed-openai.js'
import { generateHydeDocument } from './hyde.js'
import { rerankChunks } from './rerank.js'

export const ANN_CANDIDATES = 20
export const RERANK_KEEP = 5
export const RERANK_THRESHOLD = 6

export interface KnowledgeChunkResult {
  title: string
  sourceUrl: string
  category: string
  content: string
}

export interface SearchKnowledgeResult {
  found: boolean
  chunks: KnowledgeChunkResult[]
}

export interface SearchKnowledgeOutput {
  result: SearchKnowledgeResult
  trace: RetrievalTrace
}

interface CandidateRow {
  id: number
  title: string
  source_url: string
  category: string
  content: string
}

export async function searchKnowledge(
  query: string,
): Promise<SearchKnowledgeOutput> {
  let hydeText: string
  try {
    hydeText = await generateHydeDocument(query)
  } catch (err) {
    await logWarning({
      timestamp: new Date().toISOString(),
      event: 'hyde_failed',
      message: err instanceof Error ? err.message : String(err),
    })
    hydeText = query
  }

  const [embedding] = await embedTexts([hydeText])
  const vectorLiteral = `[${embedding.join(',')}]`

  const result = await getReadOnlyPool().query<CandidateRow>(
    `SELECT id, title, source_url, category, content
     FROM knowledge_chunks
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [vectorLiteral, ANN_CANDIDATES],
  )
  const candidates = result.rows

  if (candidates.length === 0) {
    return {
      result: { found: false, chunks: [] },
      trace: {
        query,
        hydeText,
        candidateCount: 0,
        scores: [],
        selectedChunkIds: [],
        found: false,
      },
    }
  }

  let scores: { id: number; score: number }[]
  try {
    scores = await rerankChunks(
      query,
      candidates.map((candidate) => ({
        id: candidate.id,
        content: candidate.content,
      })),
    )
  } catch (err) {
    await logWarning({
      timestamp: new Date().toISOString(),
      event: 'rerank_failed',
      message: err instanceof Error ? err.message : String(err),
    })
    scores = candidates.map((candidate, index) => ({
      id: candidate.id,
      score: RERANK_THRESHOLD + (candidates.length - index),
    }))
  }

  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]))
  const selected = scores
    .filter((score) => score.score >= RERANK_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, RERANK_KEEP)
    .map((score) => byId.get(score.id))
    .filter((candidate): candidate is CandidateRow => candidate !== undefined)

  const trace: RetrievalTrace = {
    query,
    hydeText,
    candidateCount: candidates.length,
    scores,
    selectedChunkIds: selected.map((candidate) => candidate.id),
    found: selected.length > 0,
  }

  if (selected.length === 0) {
    return { result: { found: false, chunks: [] }, trace }
  }

  return {
    result: {
      found: true,
      chunks: selected.map((candidate) => ({
        title: candidate.title,
        sourceUrl: candidate.source_url,
        category: candidate.category,
        content: candidate.content,
      })),
    },
    trace,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test core`
Expected: PASS (5/5 tests in `search-knowledge.spec.ts`)

- [ ] **Step 5: Commit and push**

```bash
git add packages/core/src/lib/knowledge/search-knowledge.ts packages/core/src/lib/knowledge/search-knowledge.spec.ts
git commit -m "feat: orchestrate HyDE + pgvector ANN + rerank retrieval pipeline"
git push
```

---

### Task 9: Dokumentum-betöltés (`load-documents.ts`)

> **Miért itt, nem a `packages/db`-ben?** A `packages/db`-nek nincs Vitest/Nx `test` targetje (nincs `vitest.config.mts`, a `tsconfig.lib.json` sem foglalja magába a `prisma/` mappát) — egy ottani spec fájl futtathatatlan lenne. A tiszta fájl-beolvasás+tisztítás+chunkolás logika I/O-mentes lényege (a Prisma/embedding hívások nélkül) ezért a már tesztelt `packages/core`-ba kerül; a `packages/db/prisma/seed-knowledge.ts` (Task 10) ezt importálja, és — a már meglévő, teszt nélküli `seed.ts` mintáját követve — csak a Prisma-specifikus írást végzi, automatizált teszt nélkül.

**Files:**

- Create: `packages/core/src/lib/knowledge/load-documents.ts`
- Test: `packages/core/src/lib/knowledge/load-documents.spec.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

- Consumes: `cleanDocument` (`./clean.js`), `chunkText` (`./chunk.js`)
- Produces: `export interface PendingChunk { sourceFile: string; title: string; sourceUrl: string; category: string; chunkIndex: number; content: string }`, `export function loadKnowledgeDocuments(dir: string): Promise<PendingChunk[]>`

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/src/lib/knowledge/load-documents.spec.ts
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadKnowledgeDocuments } from './load-documents.js'

describe('loadKnowledgeDocuments', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'plantbase-knowledge-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('cleans and chunks every markdown file in the directory', async () => {
    await writeFile(
      join(dir, 'sample.md'),
      `---
title: Sample Title
source: https://example.com/sample
category: plants-101
---

# Sample Title

Plants 101

Real content paragraph one.

Real content paragraph two.

## Perfect Pairings For Your Plants

Ignore this.
`,
    )

    const result = await loadKnowledgeDocuments(dir)

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      sourceFile: 'sample.md',
      title: 'Sample Title',
      sourceUrl: 'https://example.com/sample',
      category: 'plants-101',
      chunkIndex: 0,
    })
    expect(result[0].content).toContain('Real content paragraph one.')
    expect(result[0].content).not.toContain('Ignore this')
  })

  it('only reads .md files', async () => {
    await writeFile(join(dir, 'notes.txt'), 'irrelevant')

    const result = await loadKnowledgeDocuments(dir)

    expect(result).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test core`
Expected: FAIL — `Cannot find module './load-documents.js'`

- [ ] **Step 3: Write minimal implementation**

```ts
// packages/core/src/lib/knowledge/load-documents.ts
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chunkText } from './chunk.js'
import { cleanDocument } from './clean.js'

export interface PendingChunk {
  sourceFile: string
  title: string
  sourceUrl: string
  category: string
  chunkIndex: number
  content: string
}

export async function loadKnowledgeDocuments(
  dir: string,
): Promise<PendingChunk[]> {
  const files = (await readdir(dir)).filter((file) => file.endsWith('.md'))
  const pending: PendingChunk[] = []

  for (const file of files) {
    const raw = await readFile(join(dir, file), 'utf-8')
    const cleaned = cleanDocument(raw)
    const chunks = chunkText(cleaned.body)
    chunks.forEach((content, chunkIndex) => {
      pending.push({
        sourceFile: file,
        title: cleaned.title,
        sourceUrl: cleaned.sourceUrl,
        category: cleaned.category,
        chunkIndex,
        content,
      })
    })
  }
  return pending
}
```

- [ ] **Step 4: Export from the package's public API**

```ts
// packages/core/src/index.ts
export * from './lib/ask-agent.js'
export * from './lib/knowledge/clean.js'
export * from './lib/knowledge/chunk.js'
export * from './lib/knowledge/embed-openai.js'
export * from './lib/knowledge/load-documents.js'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx nx test core`
Expected: PASS (2/2 tests in `load-documents.spec.ts`)

- [ ] **Step 6: Commit and push**

```bash
git add packages/core/src/lib/knowledge/load-documents.ts packages/core/src/lib/knowledge/load-documents.spec.ts packages/core/src/index.ts
git commit -m "feat: add knowledge document loader (clean+chunk file wiring)"
git push
```

---

### Task 10: Ingestion script (`seed-knowledge.ts`)

**Files:**

- Modify: `packages/db/package.json` (új dependency: `@plantbase/core`)
- Create: `packages/db/prisma/seed-knowledge.ts`

**Interfaces:**

- Consumes: `loadKnowledgeDocuments`, `embedTexts` (`@plantbase/core`)

- [ ] **Step 1: Add the core package as a dependency of db**

```json
// packages/db/package.json — a "dependencies" blokk:
"dependencies": {
  "@plantbase/core": "workspace:*",
  "@prisma/client": "6.19.2",
  "tslib": "^2.3.0"
},
```

Run: `pnpm install`
Expected: `node_modules/@plantbase/core` symlinkelve a workspace package-re.

Run: `npx nx build core`
Expected: `packages/core/dist/index.js` létrejön (a `seed-knowledge.ts` ezt importálja `tsx`-en keresztül).

- [ ] **Step 2: Write the implementation**

Ez a script — a meglévő, szintén automatizált teszt nélküli `packages/db/prisma/seed.ts` mintáját követve — csak manuálisan verifikált (lásd Step 3).

```ts
// packages/db/prisma/seed-knowledge.ts
// Egyszeri (újrafuttatható) betöltő: seed/knowledge/*.md -> tisztítás -> chunkolás ->
// embedding -> knowledge_chunks tábla.
// Futtatás (a packages/db könyvtárból): `npx tsx prisma/seed-knowledge.ts`
// Előfeltétel: `npx nx build core` (a @plantbase/core dist kimenetét használja),
// és a knowledge_chunks migráció már alkalmazva van.

import { join } from 'node:path'
import { embedTexts, loadKnowledgeDocuments } from '@plantbase/core'
import { PrismaClient } from '@prisma/client'

const KNOWLEDGE_DIR = join(process.cwd(), '../../seed/knowledge')
const BATCH_SIZE = 50

async function main() {
  const prisma = new PrismaClient()
  const pending = await loadKnowledgeDocuments(KNOWLEDGE_DIR)
  await prisma.$executeRaw`DELETE FROM knowledge_chunks`

  let inserted = 0
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE)
    const embeddings = await embedTexts(batch.map((chunk) => chunk.content))

    for (const [index, chunk] of batch.entries()) {
      const vectorLiteral = `[${embeddings[index].join(',')}]`
      await prisma.$executeRaw`
        INSERT INTO knowledge_chunks (source_file, title, source_url, category, chunk_index, content, embedding)
        VALUES (${chunk.sourceFile}, ${chunk.title}, ${chunk.sourceUrl}, ${chunk.category}, ${chunk.chunkIndex}, ${chunk.content}, ${vectorLiteral}::vector)
      `
      inserted++
    }
  }

  const documentCount = new Set(pending.map((chunk) => chunk.sourceFile)).size
  console.log(
    `Tudásbázis betöltve: ${inserted} chunk, ${documentCount} dokumentumból.`,
  )
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('Tudásbázis-seed hiba:', e)
  process.exit(1)
})
```

- [ ] **Step 3: Manual/demo test — the real ingestion (OpenAI + DB write)**

Run (a `packages/db` könyvtárból): `npx tsx prisma/seed-knowledge.ts`
Expected: `Tudásbázis betöltve: <N> chunk, 202 dokumentumból.` console-üzenet.

Verify: `docker exec plantbase-postgres-1 psql -U plantbase -d plantbase -c "SELECT count(*) FROM knowledge_chunks;"`
Expected: a betöltött chunk-szám > 0.

- [ ] **Step 4: Commit and push**

```bash
git add packages/db/package.json pnpm-lock.yaml packages/db/prisma/seed-knowledge.ts
git commit -m "feat: add knowledge base ingestion script"
git push
```

---

### Task 11: `searchKnowledge` tool bekötése az `askAgent`-be

**Files:**

- Modify: `packages/core/src/lib/ask-agent.ts`
- Modify: `packages/core/src/lib/ask-agent.spec.ts`

**Interfaces:**

- Consumes: `searchKnowledge` (`./knowledge/search-knowledge.js`), `type RetrievalTrace` (`./logger.js`)
- Modifies: `AskAgentResult` — új mező: `retrieval: RetrievalTrace[]`

- [ ] **Step 1: Write the failing test (add to the existing spec)**

```ts
// packages/core/src/lib/ask-agent.spec.ts — az import-blokk kiegészítése:
import { searchKnowledge } from './knowledge/search-knowledge.js'
// ...
vi.mock('./knowledge/search-knowledge.js', () => ({
  searchKnowledge: vi.fn(),
}))

// ...és egy új `it` blokk a fájl végén, a `describe('askAgent', ...)` zárása előtt:
it('runs the searchKnowledge tool and threads the retrieval trace into the result', async () => {
  vi.mocked(searchKnowledge).mockResolvedValue({
    result: {
      found: true,
      chunks: [
        {
          title: 'Kaktusz gondozás',
          sourceUrl: 'https://example.com/x',
          category: 'plants-101',
          content: 'öntözés ritkán',
        },
      ],
    },
    trace: {
      query: 'Milyen gyakran öntözzem a kaktuszt?',
      hydeText: 'hipotetikus válasz',
      candidateCount: 3,
      scores: [{ id: 1, score: 9 }],
      selectedChunkIds: [1],
      found: true,
    },
  })
  mockResponses([
    toolUseResponse('searchKnowledge', {
      query: 'Milyen gyakran öntözzem a kaktuszt?',
    }),
    textResponse(
      'Ritkán öntözd. Források: Kaktusz gondozás (https://example.com/x)',
    ),
  ])

  const result = await askAgent('Milyen gyakran öntözzem a kaktuszt?')

  expect(searchKnowledge).toHaveBeenCalledWith(
    'Milyen gyakran öntözzem a kaktuszt?',
  )
  expect(result.retrieval).toHaveLength(1)
  expect(result.retrieval[0].found).toBe(true)
  expect(result.answer).toContain('Források')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test core`
Expected: FAIL — `searchKnowledge` tool ismeretlen, `result.retrieval` nem létezik.

- [ ] **Step 3: Modify ask-agent.ts**

```ts
// packages/core/src/lib/ask-agent.ts — a TELJES fájl új tartalma
import Anthropic from '@anthropic-ai/sdk'
import { searchKnowledge } from './knowledge/search-knowledge.js'
import { listCategories } from './list-categories.js'
import { logInteraction, type RetrievalTrace } from './logger.js'
import { runSql } from './run-sql.js'
import { SYSTEM_PROMPT } from './system-prompt.js'

const MODEL = 'claude-sonnet-5'
const MAX_TOKENS = 1024
const MAX_TOOL_ROUNDS = 5

const RUN_SQL_TOOL: Anthropic.Tool = {
  name: 'runSql',
  description:
    'Read-only SQL (csak SELECT) lefuttatása a products katalóguson, és a sorok visszaadása.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'A futtatandó SELECT SQL lekérdezés.',
      },
    },
    required: ['query'],
  },
}

const LIST_CATEGORIES_TOOL: Anthropic.Tool = {
  name: 'listCategories',
  description:
    'A katalógusban ténylegesen szereplő kategóriák listázása. Paramétert nem vár.',
  input_schema: {
    type: 'object',
    properties: {},
  },
}

const SEARCH_KNOWLEDGE_TOOL: Anthropic.Tool = {
  name: 'searchKnowledge',
  description:
    'Növénygondozási tudásbázis (öntözés, fény, kártevők, egyéb gondozási témák) keresése a felhasználó kérdéséhez kapcsolódó cikk-részletek visszaadására.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'A keresendő gondozási kérdés.',
      },
    },
    required: ['query'],
  },
}

export interface AskAgentResult {
  answer: string
  systemPrompt: string
  messages: Anthropic.MessageParam[]
  generatedSql: string[]
  retrieval: RetrievalTrace[]
  usage: { inputTokens: number; outputTokens: number }
}

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .filter(Boolean)
    .join('\n')
}

export async function askAgent(question: string): Promise<AskAgentResult> {
  const client = new Anthropic()
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: question },
  ]
  const generatedSql: string[] = []
  const retrieval: RetrievalTrace[] = []
  let inputTokens = 0
  let outputTokens = 0

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: [RUN_SQL_TOOL, LIST_CATEGORIES_TOOL, SEARCH_KNOWLEDGE_TOOL],
      messages,
    })

    inputTokens += response.usage.input_tokens
    outputTokens += response.usage.output_tokens
    messages.push({ role: 'assistant', content: response.content })

    if (response.stop_reason !== 'tool_use') {
      const result: AskAgentResult = {
        answer: extractText(response.content),
        systemPrompt: SYSTEM_PROMPT,
        messages,
        generatedSql,
        retrieval,
        usage: { inputTokens, outputTokens },
      }
      await logInteraction({ timestamp: new Date().toISOString(), ...result })
      return result
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue

      try {
        let content: string
        if (block.name === 'runSql') {
          const { query } = block.input as { query: string }
          generatedSql.push(query)
          content = JSON.stringify(await runSql(query))
        } else if (block.name === 'listCategories') {
          content = JSON.stringify(await listCategories())
        } else if (block.name === 'searchKnowledge') {
          const { query } = block.input as { query: string }
          const { result, trace } = await searchKnowledge(query)
          retrieval.push(trace)
          content = JSON.stringify(result)
        } else {
          throw new Error(`Ismeretlen tool: ${block.name}`)
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content,
        })
      } catch (err) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: err instanceof Error ? err.message : String(err),
          is_error: true,
        })
      }
    }
    messages.push({ role: 'user', content: toolResults })
  }

  throw new Error('Túl sok tool-use kör, nem sikerült végleges választ adni.')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx nx test core`
Expected: PASS (mind a 6 teszt az `ask-agent.spec.ts`-ben)

- [ ] **Step 5: Commit and push**

```bash
git add packages/core/src/lib/ask-agent.ts packages/core/src/lib/ask-agent.spec.ts
git commit -m "feat: wire searchKnowledge tool into the agent tool-use loop"
git push
```

---

### Task 12: System prompt bővítése (grounding + no-match viselkedés)

**Files:**

- Modify: `docs/system-prompt.md`
- Modify: `packages/core/src/lib/system-prompt.ts`
- Modify: `packages/core/src/lib/system-prompt.spec.ts`

**Interfaces:**

- Modifies: `SYSTEM_PROMPT` konstans tartalma (verbátim szinkronban a `docs/system-prompt.md` ```xml blokkjával)

- [ ] **Step 1: Update the failing test (tool-name assertion)**

```ts
// packages/core/src/lib/system-prompt.spec.ts — a 30-33. sorok cseréje:
it('mentions all three tools that askAgent actually registers', () => {
  expect(SYSTEM_PROMPT).toContain('runSql')
  expect(SYSTEM_PROMPT).toContain('listCategories')
  expect(SYSTEM_PROMPT).toContain('searchKnowledge')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx nx test core`
Expected: FAIL — `searchKnowledge` nincs a `SYSTEM_PROMPT`-ban.

- [ ] **Step 3: Update docs/system-prompt.md**

```xml
<!-- docs/system-prompt.md — a <tools> blokk cseréje: -->
<tools>
- runSql(query): read-only SQL futtatás a katalóguson. A generált SQL-t mindig ezzel futtasd, ne csak kiírd.
- listCategories(): a katalógusban ténylegesen szereplő kategóriák listázása. Ha a felhasználó a kategóriákra vagy a kategóriák listájára kérdez, ezt hívd (ne runSql-t írj rá).
- searchKnowledge(query): növénygondozási tudásbázis (öntözés, fény, kártevők, egyéb gondozási témák) keresése. Gondozási/általános növényismereti kérdésnél ezt hívd, ne a products táblára írj SQL-t ilyesmire.
</tools>
```

```xml
<!-- docs/system-prompt.md — a <behavior> blokk végére, a záró </behavior> elé: -->
- Ha a searchKnowledge found: false-t ad, mondd ki egyértelműen, hogy nincs releváns információ a tudásbázisban -- ne találj ki választ. Ha found: true, a válasz végén "Források:" címszó alatt sorold fel a felhasznált dokumentumok címét és URL-jét.
```

- [ ] **Step 4: Copy the updated XML block verbatim into system-prompt.ts**

```ts
// packages/core/src/lib/system-prompt.ts — a TELJES fájl új tartalma
// A docs/system-prompt.md XML-blokkjának egy az egyben (verbátim) átvétele --
// ne módosítsd itt, hanem a doksiban, majd másold át ide újra.
export const SYSTEM_PROMPT = `<role>
Te a Plantbase asszisztens vagy: egy lakberendezőnek (és otthoni felhasználóknak) segítesz növényt választani és növénycsomagot összeállítani egy webshop katalógusa alapján.
</role>

<task>
A felhasználó természetes nyelvű kérdését fordítsd le a megfelelő tool-hívásra (runSql egy SELECT lekérdezéshez a products tábla felett, listCategories a kategóriák listázásához, searchKnowledge a növénygondozási tudásbázis kereséséhez), majd a kapott adatokból adj rövid, érthető, magyar nyelvű választ.
</task>

<schema>
products (
  id, name, latin_name,
  category,                              -- szobanövény / kerti / pozsgás / kaktusz / fűszer / fa-cserje / lógó / virágzó
  location,                              -- beltéri / kültéri / mindkettő
  price, sale_price, stock,              -- ár, akciós ár (null ha nincs), raktárkészlet
  light,                                 -- árnyék / alacsony / közepes / erős / direkt nap
  watering,                              -- ritka / közepes / gyakori / állandóan nedves
  difficulty,                            -- kezdő / haladó / profi
  current_height_cm, max_height_cm,      -- aktuális és kifejlett magasság
  current_pot_cm,                        -- aktuális cserépméret
  pet_safe, kid_safe, air_purifying,     -- háziállat-barát, gyerekbiztos, légtisztító
  rating, reviews_count, description
)
</schema>

<rules>
- CSAK SELECT. Soha ne módosíts adatot (INSERT/UPDATE/DELETE/DDL tilos).
- Mindig tegyél LIMIT-et (alapból 20-50).
- Szöveges keresés: ILIKE (kis/nagybetű-független), pl. name ILIKE '%pozsgás%'.
- Ár: a tényleges ár COALESCE(sale_price, price) (ha van akció, az számít). Büdzsénél ezzel számolj.
- Raktár: ha "raktáron" a kérés, szűrj stock > 0-ra.
- Méret: current_height_cm az aktuális, max_height_cm a kifejlett magasság, current_pot_cm a cserépméret.
- Gondozás: light (fény), watering (öntözés), difficulty (nehézség), pet_safe (háziállat-barát).
- Kategória szerinti szűrésnél a listCategories eredményéből használt pontos értéket írd a category = '...' feltételbe, ne a felhasználó szó szerinti kifejezését (pl. "zöld növény", "lombnövény") -- így nem eshet ki hibásan egy egyébként létező kategória.
</rules>

<behavior>
- Ha a kérdés kétértelmű (hiányzik a büdzsé, a szoba adottsága vagy a darabszám), KÉRDEZZ vissza, mielőtt találgatnál.
- Csomag-összeállításnál vedd figyelembe a büdzsét (összár) és a szoba adottságait (fény, méret).
- A válaszban emeld ki a döntéshez fontos attribútumokat: ár (és akció), raktárkészlet, méret-illeszkedés, fény/öntözés/gondozás.
- Légy tömör: a végén természetes nyelvű összegzés, ne nyers tábla-dump.
- Ne találj ki nem létező oszlopot vagy táblát.
- Ha a lekérdezésnek nincs találata, mondd meg egyértelműen (pl. "nincs a kritériumoknak megfelelő növény") -- ne lazíts hallgatólagosan a szűrőn, és ne találj ki eredményt. Ha van értelmes, közeli alternatíva (pl. kicsit magasabb ár), azt felajánlhatod, de jelezd, hogy az eredeti kritériumnak nem felel meg.
- Ha a searchKnowledge found: false-t ad, mondd ki egyértelműen, hogy nincs releváns információ a tudásbázisban -- ne találj ki választ. Ha found: true, a válasz végén "Források:" címszó alatt sorold fel a felhasznált dokumentumok címét és URL-jét.
</behavior>

<tools>
- runSql(query): read-only SQL futtatás a katalóguson. A generált SQL-t mindig ezzel futtasd, ne csak kiírd.
- listCategories(): a katalógusban ténylegesen szereplő kategóriák listázása. Ha a felhasználó a kategóriákra vagy a kategóriák listájára kérdez, ezt hívd (ne runSql-t írj rá).
- searchKnowledge(query): növénygondozási tudásbázis (öntözés, fény, kártevők, egyéb gondozási témák) keresése. Gondozási/általános növényismereti kérdésnél ezt hívd, ne a products táblára írj SQL-t ilyesmire.
</tools>`
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx nx test core`
Expected: PASS — a `system-prompt.spec.ts` verbátim-egyezés tesztje is zöld, mert a `docs/system-prompt.md` ```xml blokkja és a `SYSTEM_PROMPT` karakterre egyeznek.

- [ ] **Step 6: Commit and push**

```bash
git add docs/system-prompt.md packages/core/src/lib/system-prompt.ts packages/core/src/lib/system-prompt.spec.ts
git commit -m "feat: document searchKnowledge tool and grounding/no-match behavior in system prompt"
git push
```

---

### Task 13: End-to-end manuális demó teszt

**Files:** nincs kódváltoztatás — csak verifikáció.

- [ ] **Step 1: Build everything**

Run: `npx nx run-many -t build -p core,cli,db`
Expected: mindhárom projekt hiba nélkül buildel.

- [ ] **Step 2: Ask a real care question and verify grounding**

Run: `node apps/cli/dist/main.js --show-prompt ask "Milyen gyakran öntözzem a kaktuszaimat?"`
Expected: a válasz végén "Források:" szakasz, benne legalább egy `seed/knowledge`-beli cikk címével és URL-jével; a `--show-prompt` kimenetben látszik a `searchKnowledge` tool-hívás és -eredmény.

- [ ] **Step 3: Ask an out-of-scope question and verify the honest no-match**

Run: `node apps/cli/dist/main.js ask "Mi a marsi kőzetek ideális öntözési gyakorisága?"`
Expected: a válasz egyértelműen jelzi, hogy nincs releváns információ a tudásbázisban — nincs kitalált tartalom.

- [ ] **Step 4: Verify the JSONL log captured the retrieval trace**

Run: `Get-Content (Get-ChildItem logs\*.jsonl | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName | Select-Object -Last 2` (PowerShell) vagy a megfelelő `tail` az utolsó két sorra
Expected: mindkét interakció JSONL sorában szerepel a `retrieval` tömb (HyDE-szöveg, jelölt-darabszám, pontszámok, kiválasztott chunk id-k).

---

## Self-Review Notes

- **Spec coverage:** pgvector tábla (Task 3), OpenAI kis embedding modell (Task 4), HyDE (Task 5), rerank (Task 6), grounding + no-match (Task 8, 11, 12), multi-provider routing (Task 5 = OpenAI, Task 6 = Anthropic, Task 11 = Anthropic orchestráció), determinisztikus + tesztelt chunking (Task 1, 2), naplózás bővítése (Task 7), dokumentum-betöltés + ingestion (Task 9, 10), manuális E2E (Task 13) — mind lefedve.
- **Type consistency:** `RetrievalTrace` egyetlen helyen (`logger.ts`) definiált, mindenhol onnan importálva (`search-knowledge.ts`, `ask-agent.ts`) — nincs duplikált/eltérő definíció, nincs kör-import (a `logger.ts` nem importál semmit a `knowledge/`-ból).
- **Konstansok:** `EMBEDDING_MODEL`, `HYDE_MODEL`, `RERANK_MODEL`, `ANN_CANDIDATES`, `RERANK_KEEP`, `RERANK_THRESHOLD` mind egy-egy fájlban definiálva és onnan importálva, nincs kézzel duplikált szám máshol.
