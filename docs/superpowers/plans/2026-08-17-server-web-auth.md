# Szerver + Web UI + Auth alapinfrastruktúra Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Két új belépési pont (Express szerver + React web UI) és fiókos belépés a meglévő Plantbase agent elé, az agent-mag Vercel AI SDK 6-ra migrálva, úgy hogy a meglévő CLI változtatás nélkül tovább működjön.

**Architecture:** `packages/core` agent-magja Vercel AI SDK 6-ra (`generateText`/`streamText` + `stopWhen`) migrál, a 3 meglévő tool egy közös `agent-tools.ts`-ből származik mind a CLI-nek szánt (nem streamelő) `askAgent`, mind az új, streamelő `streamAgentResponse` számára. Az `apps/server` (Express 5) ad auth-ot (regisztráció/belépés, DB-session, httpOnly cookie) és egy streamelő `/api/chat` végpontot; az `apps/web` (Vite + React 19 + Tailwind 4 + shadcn-mintájú komponensek) a `@ai-sdk/react` `useChat`-tel fogyasztja ezt. A `packages/core` továbbra sem függhet a `packages/db`-től (auth/session-logika az `apps/server`-ben él).

**Tech Stack:** Express 5, React 19, Vite 8, Tailwind 4, Vercel AI SDK 6 (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/react`), Prisma 6.19.2, bcryptjs, Vitest, supertest.

**Spec:** `docs/superpowers/specs/2026-08-17-server-web-auth-design.md`

## Global Constraints

- `packages/core` SOSEM függhet `packages/db`-től (`eslint.config.mjs` `@nx/enforce-module-boundaries`, `scope:core` csak `scope:core`-tól függhet).
- Jelszó-szabály: min. 8 karakter, legalább egy kisbetű, egy nagybetű, egy szám.
- Session: DB-alapú, httpOnly, `sameSite=lax`, `secure=false` (localhost-only) cookie, fix 7 napos lejárat (`SESSION_TTL_DAYS`).
- Jelszó-hash: `bcryptjs` (tiszta JS, nincs natív fordítás — pnpm `allowBuilds` súrlódás elkerülése).
- Az `askAgent` visszatérési kontraktusa (`answer`, `systemPrompt`, `messages`, `generatedSql`, `retrieval`, `usage`) NEM változhat — `apps/cli/src/main.ts` egy sort sem módosulhat.
- Prettier: `semi: false`, nincs `console.log` termékkódban (strukturált logger vagy Express error-middleware).
- Minden fájl `kebab-case`, camelCase változó/függvény, `interface` objektum-alakra, `unknown` a külső inputra.
- Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`), egy lépés = egy commit.
- **Új vagy ritkán használt API előtt (Vercel AI SDK 6, `ai/test`) ELLENŐRIZD a live doksit Context7-vel** (`architektura.md` #7) — az alábbi kódrészletek a terv írásakor ismert AI SDK 6 API-alakot követik (`generateText`/`streamText`/`tool`/`stopWhen`/`stepCountIs`/`convertToModelMessages`/`pipeUIMessageStreamToResponse`/`@ai-sdk/react` `useChat` + `DefaultChatTransport`); ha a Context7-doksi ettől eltérő szignatúrát mutat, ahhoz igazítsd az implementációt, a viselkedési szerződés (lásd fent) megtartása mellett.

---

## Task 1: Prisma séma — `accounts` + `sessions` tábla

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_add_accounts_sessions/migration.sql` (Prisma generálja)

**Interfaces:**
- Produces: Prisma modellek `Account` (`id`, `fullName`, `salutation`, `email`, `passwordHash`, `role`, `createdAt`) és `Session` (`token`, `accountId`, `account`, `createdAt`, `expiresAt`), táblanevek `accounts`/`sessions`. Ezeket a `@plantbase/db` csomag `prisma` kliense (`packages/db/src/lib/client.ts`) exportálja, minden későbbi szerver-oldali task ezen keresztül éri el.

- [ ] **Step 1: `docker compose up -d` fut-e — ellenőrzés**

Run: `docker compose ps`
Expected: a `postgres` service `running`/`healthy` státuszban. Ha nem fut: `docker compose up -d`.

- [ ] **Step 2: Modellek hozzáadása a séma-fájlhoz**

Szerkeszd a `packages/db/prisma/schema.prisma`-t, a `KnowledgeChunk` modell UTÁN illeszd be:

```prisma
model Account {
  id           Int      @id @default(autoincrement())
  fullName     String   @map("full_name")
  salutation   String
  email        String   @unique
  passwordHash String   @map("password_hash")
  role         String   @default("customer") // customer | staff | admin
  createdAt    DateTime @default(now()) @map("created_at")
  sessions     Session[]

  @@map("accounts")
}

model Session {
  token     String   @id
  accountId Int      @map("account_id")
  account   Account  @relation(fields: [accountId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now()) @map("created_at")
  expiresAt DateTime @map("expires_at")

  @@map("sessions")
}
```

- [ ] **Step 3: Migráció generálása és alkalmazása**

Run (repo gyökérből):
```bash
pnpm --filter @plantbase/db exec prisma migrate dev --name add_accounts_sessions
```
Expected: `Your database is now in sync with your schema.` és egy új `packages/db/prisma/migrations/<timestamp>_add_accounts_sessions/migration.sql` fájl jön létre `CREATE TABLE "accounts"` és `CREATE TABLE "sessions"` utasításokkal.

- [ ] **Step 4: Prisma Client típusok generálása és build-ellenőrzés**

Run:
```bash
pnpm exec nx run db:build
```
Expected: sikeres build, hiba nélkül (a generált `PrismaClient` már ismeri az `account`/`session` modelleket).

- [ ] **Step 5: Smoke-teszt — insert/read/delete egy ideiglenes fiókkal**

Run (repo gyökérből, egysoros ideiglenes szkript, NEM kerül a repóba):
```bash
pnpm --filter @plantbase/db exec tsx -e "
import { prisma } from './src/lib/client.js'
const acc = await prisma.account.create({ data: { fullName: 'Teszt Elek', salutation: 'Elek', email: 'smoke-test@example.com', passwordHash: 'x', role: 'customer' } })
console.log('created', acc.id)
const found = await prisma.account.findUnique({ where: { email: 'smoke-test@example.com' } })
console.log('found', found?.fullName)
await prisma.account.delete({ where: { id: acc.id } })
console.log('deleted ok')
await prisma.\$disconnect()
"
```
Expected: `created <id>`, `found Teszt Elek`, `deleted ok` — hiba nélkül.

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat: add accounts and sessions tables"
```

---

## Task 2: `packages/core` — `askAgent` migráció Vercel AI SDK 6-ra

**Files:**
- Create: `packages/core/src/lib/agent-tools.ts`
- Create: `packages/core/src/lib/agent-tools.spec.ts`
- Modify: `packages/core/src/lib/system-prompt.ts`
- Modify: `packages/core/src/lib/ask-agent.ts`
- Modify: `packages/core/src/lib/ask-agent.spec.ts`
- Modify: `packages/core/package.json` (dependency csere)
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `runSql(query: string): Promise<Record<string, unknown>[]>` (`run-sql.ts`), `listCategories(): Promise<string[]>` (`list-categories.ts`), `searchKnowledge(query: string): Promise<SearchKnowledgeOutput>` (`knowledge/search-knowledge.ts`), `logInteraction`/`RetrievalTrace` (`logger.ts`), `SYSTEM_PROMPT` (`system-prompt.ts`).
- Produces:
  - `AGENT_MODEL: string`, `MAX_TOOL_ROUNDS: number`, `AgentToolTrackers { generatedSql: string[]; retrieval: RetrievalTrace[] }`, `buildAgentTools(trackers: AgentToolTrackers)` — AI SDK `tools` objektum, ezt Task 3 (streamAgentResponse) is felhasználja.
  - `buildSystemPrompt(salutation?: string): string` (`system-prompt.ts`) — Task 3 is felhasználja.
  - `askAgent(question: string, options?: { salutation?: string }): Promise<AskAgentResult>` — VÁLTOZATLAN külső szerződés, `apps/cli/src/main.ts` ezt hívja.

- [ ] **Step 1: Régi és új dependency csere a `packages/core`-ban**

```bash
pnpm --filter @plantbase/core remove @anthropic-ai/sdk
pnpm --filter @plantbase/core add ai @ai-sdk/anthropic
```
Ha a telepítés `allowBuilds` jóváhagyást kér egy új natív dependency-hez, a `pnpm-workspace.yaml` `allowBuilds` blokkjába vedd fel `true` értékkel (lásd a meglévő bejegyzéseket mintaként), majd telepíts újra.

- [ ] **Step 2: `agent-tools.ts` — a 3 tool közös definíciója (AI SDK `tool()` formában)**

```ts
// packages/core/src/lib/agent-tools.ts
import { tool } from 'ai'
import { z } from 'zod'
import { searchKnowledge } from './knowledge/search-knowledge.js'
import { listCategories } from './list-categories.js'
import { runSql } from './run-sql.js'
import type { RetrievalTrace } from './logger.js'

export const AGENT_MODEL = 'claude-sonnet-5'
export const MAX_TOOL_ROUNDS = 5

export interface AgentToolTrackers {
  generatedSql: string[]
  retrieval: RetrievalTrace[]
}

export function buildAgentTools(trackers: AgentToolTrackers) {
  return {
    runSql: tool({
      description:
        'Read-only SQL (csak SELECT) lefuttatása a products katalóguson, és a sorok visszaadása.',
      inputSchema: z.object({
        query: z.string().describe('A futtatandó SELECT SQL lekérdezés.'),
      }),
      execute: async ({ query }: { query: string }) => {
        trackers.generatedSql.push(query)
        return runSql(query)
      },
    }),
    listCategories: tool({
      description:
        'A katalógusban ténylegesen szereplő kategóriák listázása. Paramétert nem vár.',
      inputSchema: z.object({}),
      execute: async () => listCategories(),
    }),
    searchKnowledge: tool({
      description:
        'Növénygondozási tudásbázis (öntözés, fény, kártevők, egyéb gondozási témák) keresése a felhasználó kérdéséhez kapcsolódó cikk-részletek visszaadására.',
      inputSchema: z.object({
        query: z.string().describe('A keresendő gondozási kérdés.'),
      }),
      execute: async ({ query }: { query: string }) => {
        const { result, trace } = await searchKnowledge(query)
        trackers.retrieval.push(trace)
        return result
      },
    }),
  }
}
```

- [ ] **Step 3: `agent-tools.spec.ts` — a tool-execute-ök helyesen delegálnak és nyomon követik a mellékhatásokat**

```ts
// packages/core/src/lib/agent-tools.spec.ts
import { buildAgentTools, type AgentToolTrackers } from './agent-tools.js'
import { runSql } from './run-sql.js'
import { listCategories } from './list-categories.js'
import { searchKnowledge } from './knowledge/search-knowledge.js'

vi.mock('./run-sql.js', () => ({ runSql: vi.fn() }))
vi.mock('./list-categories.js', () => ({ listCategories: vi.fn() }))
vi.mock('./knowledge/search-knowledge.js', () => ({ searchKnowledge: vi.fn() }))

describe('buildAgentTools', () => {
  let trackers: AgentToolTrackers

  beforeEach(() => {
    vi.clearAllMocks()
    trackers = { generatedSql: [], retrieval: [] }
  })

  it('runs runSql and records the generated query', async () => {
    vi.mocked(runSql).mockResolvedValue([{ id: 1 }])
    const tools = buildAgentTools(trackers)

    const result = await tools.runSql.execute(
      { query: 'SELECT 1' },
      { toolCallId: 't1', messages: [] },
    )

    expect(runSql).toHaveBeenCalledWith('SELECT 1')
    expect(result).toEqual([{ id: 1 }])
    expect(trackers.generatedSql).toEqual(['SELECT 1'])
  })

  it('runs listCategories without arguments', async () => {
    vi.mocked(listCategories).mockResolvedValue(['kaktusz'])
    const tools = buildAgentTools(trackers)

    const result = await tools.listCategories.execute(
      {},
      { toolCallId: 't2', messages: [] },
    )

    expect(listCategories).toHaveBeenCalledOnce()
    expect(result).toEqual(['kaktusz'])
  })

  it('runs searchKnowledge and records the retrieval trace', async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      result: { found: true, chunks: [] },
      trace: {
        query: 'öntözés',
        hydeText: 'x',
        candidateCount: 1,
        scores: [],
        selectedChunkIds: [],
        found: true,
      },
    })
    const tools = buildAgentTools(trackers)

    const result = await tools.searchKnowledge.execute(
      { query: 'öntözés' },
      { toolCallId: 't3', messages: [] },
    )

    expect(searchKnowledge).toHaveBeenCalledWith('öntözés')
    expect(result).toEqual({ found: true, chunks: [] })
    expect(trackers.retrieval).toHaveLength(1)
  })
})
```

- [ ] **Step 4: Tesztek futtatása — várhatóan buknak (a modul még nem létezik implementáció nélkül, vagy az `execute` hívási alak eltér)**

Run: `pnpm exec nx test core`
Expected: FAIL / hiba az `agent-tools.spec.ts`-ben, amíg a Step 2 kódja nincs a helyén (ha Step 2-t már megírtad, ez a lépés valójában PASS-t ad — ha az `execute`-hívás második argumentuma az AI SDK aktuális verziójában más alakú, a Context7-doksi alapján igazítsd a tesztet és a hívást).

- [ ] **Step 5: `buildSystemPrompt` hozzáadása a `system-prompt.ts`-hez**

A meglévő `SYSTEM_PROMPT` konstans VÁLTOZATLAN marad (ne módosítsd a szöveget, csak a doksiban). Illeszd a fájl VÉGÉRE:

```ts
export function buildSystemPrompt(salutation?: string): string {
  if (!salutation) return SYSTEM_PROMPT
  return `${SYSTEM_PROMPT}\n\n<user>\nA felhasználót így szólítsd, amikor ez természetes és a beszélgetés indokolja: ${salutation}.\n</user>`
}
```

- [ ] **Step 6: `ask-agent.spec.ts` átírása — AI SDK mockolás `vi.mock('@ai-sdk/anthropic', ...)`-tal**

```ts
// packages/core/src/lib/ask-agent.spec.ts
import { MockLanguageModelV2 } from 'ai/test'
import { askAgent } from './ask-agent.js'
import { logInteraction } from './logger.js'
import { runSql } from './run-sql.js'
import { listCategories } from './list-categories.js'
import { searchKnowledge } from './knowledge/search-knowledge.js'

let mockModel: MockLanguageModelV2

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: () => mockModel,
}))
vi.mock('./logger.js', () => ({ logInteraction: vi.fn() }))
vi.mock('./run-sql.js', () => ({ runSql: vi.fn() }))
vi.mock('./list-categories.js', () => ({ listCategories: vi.fn() }))
vi.mock('./knowledge/search-knowledge.js', () => ({ searchKnowledge: vi.fn() }))

function textResult(text: string) {
  return {
    finishReason: 'stop' as const,
    usage: { inputTokens: 10, outputTokens: 5 },
    content: [{ type: 'text' as const, text }],
    warnings: [],
  }
}

function toolCallResult(toolName: string, input: unknown, toolCallId = 'call_1') {
  return {
    finishReason: 'tool-calls' as const,
    usage: { inputTokens: 10, outputTokens: 5 },
    content: [
      {
        type: 'tool-call' as const,
        toolCallId,
        toolName,
        input: JSON.stringify(input),
      },
    ],
    warnings: [],
  }
}

function mockGenerateSequence(results: unknown[]) {
  let call = 0
  mockModel = new MockLanguageModelV2({
    doGenerate: async () => results[call++] as never,
  })
}

describe('askAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns the answer directly when the model needs no tool', async () => {
    mockGenerateSequence([textResult('42 db van a raktáron.')])

    const result = await askAgent('Hány darab van a raktáron?')

    expect(result.answer).toBe('42 db van a raktáron.')
    expect(result.generatedSql).toEqual([])
    expect(logInteraction).toHaveBeenCalledTimes(1)
  })

  it('runs the runSql tool and feeds the result back for a final answer', async () => {
    vi.mocked(runSql).mockResolvedValue([{ id: 1, name: 'Aloe vera' }])
    mockGenerateSequence([
      toolCallResult('runSql', { query: 'SELECT * FROM products' }),
      textResult('Egy Aloe vera van.'),
    ])

    const result = await askAgent('Milyen növények vannak?')

    expect(runSql).toHaveBeenCalledWith('SELECT * FROM products')
    expect(result.generatedSql).toEqual(['SELECT * FROM products'])
    expect(result.answer).toBe('Egy Aloe vera van.')
  })

  it('runs the listCategories tool when requested', async () => {
    vi.mocked(listCategories).mockResolvedValue(['Szobanövény'])
    mockGenerateSequence([
      toolCallResult('listCategories', {}),
      textResult('Egy kategória van: Szobanövény.'),
    ])

    const result = await askAgent('Milyen kategóriák vannak?')

    expect(listCategories).toHaveBeenCalledOnce()
    expect(result.answer).toBe('Egy kategória van: Szobanövény.')
  })

  it('throws when the tool-use loop never reaches a final answer', async () => {
    vi.mocked(runSql).mockResolvedValue([])
    mockGenerateSequence(
      Array.from({ length: 5 }, (_, i) =>
        toolCallResult('runSql', { query: 'SELECT 1' }, `call_${i}`),
      ),
    )

    await expect(askAgent('Végtelen kör?')).rejects.toThrow(
      'Túl sok tool-use kör',
    )
  })

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
    mockGenerateSequence([
      toolCallResult('searchKnowledge', {
        query: 'Milyen gyakran öntözzem a kaktuszt?',
      }),
      textResult('Ritkán öntözd. Források: Kaktusz gondozás (https://example.com/x)'),
    ])

    const result = await askAgent('Milyen gyakran öntözzem a kaktuszt?')

    expect(searchKnowledge).toHaveBeenCalledWith(
      'Milyen gyakran öntözzem a kaktuszt?',
    )
    expect(result.retrieval).toHaveLength(1)
    expect(result.retrieval[0].found).toBe(true)
    expect(result.answer).toContain('Források')
  })

  it('appends the salutation to the system prompt when provided', async () => {
    mockGenerateSequence([textResult('Szia, Elek!')])

    const result = await askAgent('Szia!', { salutation: 'Elek' })

    expect(result.systemPrompt).toContain('Elek')
  })
})
```

Megjegyzés: az eredeti "reports an unknown tool back to the model as a tool error and continues" eset a hand-rolled loop sajátja volt — az AI SDK a `tools` objektumban deklarált neveken kívül strukturálisan nem enged a modellnek hívást indítani, ezért ez az eset a migráció után nem értelmezhető ugyanúgy; a fenti teszt-lista NEM tartalmazza, ez szándékos.

- [ ] **Step 7: Tesztek futtatása — várhatóan buknak (implementáció még a régi)**

Run: `pnpm exec nx test core`
Expected: FAIL az `ask-agent.spec.ts`-ben.

- [ ] **Step 8: `ask-agent.ts` implementáció Vercel AI SDK 6-tal**

```ts
// packages/core/src/lib/ask-agent.ts
import { anthropic } from '@ai-sdk/anthropic'
import { generateText, stepCountIs, type ModelMessage } from 'ai'
import { AGENT_MODEL, MAX_TOOL_ROUNDS, buildAgentTools } from './agent-tools.js'
import { logInteraction, type RetrievalTrace } from './logger.js'
import { buildSystemPrompt } from './system-prompt.js'

export interface AskAgentOptions {
  salutation?: string
}

export interface AskAgentResult {
  answer: string
  systemPrompt: string
  messages: ModelMessage[]
  generatedSql: string[]
  retrieval: RetrievalTrace[]
  usage: { inputTokens: number; outputTokens: number }
}

export async function askAgent(
  question: string,
  options: AskAgentOptions = {},
): Promise<AskAgentResult> {
  const generatedSql: string[] = []
  const retrieval: RetrievalTrace[] = []
  const systemPrompt = buildSystemPrompt(options.salutation)

  const result = await generateText({
    model: anthropic(AGENT_MODEL),
    system: systemPrompt,
    messages: [{ role: 'user', content: question }],
    stopWhen: stepCountIs(MAX_TOOL_ROUNDS),
    tools: buildAgentTools({ generatedSql, retrieval }),
  })

  if (!result.text) {
    throw new Error('Túl sok tool-use kör, nem sikerült végleges választ adni.')
  }

  const finalResult: AskAgentResult = {
    answer: result.text,
    systemPrompt,
    messages: result.response.messages,
    generatedSql,
    retrieval,
    usage: {
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
    },
  }
  await logInteraction({ timestamp: new Date().toISOString(), ...finalResult })
  return finalResult
}
```

- [ ] **Step 9: Tesztek futtatása — várhatóan zöldek**

Run: `pnpm exec nx test core`
Expected: PASS mind az `agent-tools.spec.ts`, mind az `ask-agent.spec.ts` esetekre.

- [ ] **Step 10: `index.ts` bővítése (ha a szerver-oldal közvetlenül importálni fogja a típusokat)**

Ellenőrizd, hogy `packages/core/src/index.ts` már exportálja-e az `ask-agent.js`-t (`export * from './lib/ask-agent.js'` — igen, ez már megvan). Nincs teendő itt, ez a lépés csak ellenőrzés.

- [ ] **Step 11: Teljes lint + build ellenőrzés**

Run: `pnpm exec nx run-many -t lint,build -p core`
Expected: hiba nélkül.

- [ ] **Step 12: Commit**

```bash
git add packages/core
git commit -m "feat: migrate askAgent to Vercel AI SDK 6"
```

---

## Task 3: `packages/core` — `streamAgentResponse` a szerver-streaminghez

**Files:**
- Create: `packages/core/src/lib/stream-agent.ts`
- Create: `packages/core/src/lib/stream-agent.spec.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `AGENT_MODEL`, `MAX_TOOL_ROUNDS`, `buildAgentTools` (Task 2, `agent-tools.ts`), `buildSystemPrompt` (Task 2, `system-prompt.ts`).
- Produces: `streamAgentResponse(messages: ModelMessage[], options?: { salutation?: string }): StreamTextResult<...>` — Task 9 (`apps/server` chat route) ezt hívja és `.toUIMessageStreamResponse()` / `.pipeUIMessageStreamToResponse(res)` metódusát használja (a pontos metódusnevet Context7-vel ellenőrizd Task 9-ben).

- [ ] **Step 1: Failing test — a függvény meghívja a `streamText`-et a helyes paraméterekkel**

```ts
// packages/core/src/lib/stream-agent.spec.ts
import { streamText } from 'ai'
import { streamAgentResponse } from './stream-agent.js'

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return { ...actual, streamText: vi.fn(() => ({ mocked: true })) }
})
vi.mock('@ai-sdk/anthropic', () => ({ anthropic: (m: string) => ({ model: m }) }))

describe('streamAgentResponse', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls streamText with the system prompt, given messages, and the tool set', () => {
    const messages = [{ role: 'user' as const, content: 'Szia' }]

    streamAgentResponse(messages)

    expect(streamText).toHaveBeenCalledOnce()
    const call = vi.mocked(streamText).mock.calls[0][0]
    expect(call.messages).toBe(messages)
    expect(call.system).toContain('Plantbase asszisztens')
    expect(call.tools).toHaveProperty('runSql')
    expect(call.tools).toHaveProperty('listCategories')
    expect(call.tools).toHaveProperty('searchKnowledge')
  })

  it('appends the salutation to the system prompt when provided', () => {
    streamAgentResponse([{ role: 'user' as const, content: 'Szia' }], {
      salutation: 'Kovácsné',
    })

    const call = vi.mocked(streamText).mock.calls[0][0]
    expect(call.system).toContain('Kovácsné')
  })
})
```

- [ ] **Step 2: Teszt futtatása — bukik (a modul nem létezik)**

Run: `pnpm exec nx test core`
Expected: FAIL — `Cannot find module './stream-agent.js'`.

- [ ] **Step 3: Implementáció**

```ts
// packages/core/src/lib/stream-agent.ts
import { anthropic } from '@ai-sdk/anthropic'
import { streamText, stepCountIs, type ModelMessage } from 'ai'
import { AGENT_MODEL, MAX_TOOL_ROUNDS, buildAgentTools } from './agent-tools.js'
import { buildSystemPrompt } from './system-prompt.js'
import type { RetrievalTrace } from './logger.js'

export interface StreamAgentOptions {
  salutation?: string
}

export interface StreamAgentTrace {
  generatedSql: string[]
  retrieval: RetrievalTrace[]
}

export function streamAgentResponse(
  messages: ModelMessage[],
  options: StreamAgentOptions = {},
) {
  const trace: StreamAgentTrace = { generatedSql: [], retrieval: [] }
  const stream = streamText({
    model: anthropic(AGENT_MODEL),
    system: buildSystemPrompt(options.salutation),
    messages,
    stopWhen: stepCountIs(MAX_TOOL_ROUNDS),
    tools: buildAgentTools(trace),
  })
  return { stream, trace }
}
```

Megjegyzés: a teszt közvetlenül a `streamText` hívási argumentumait ellenőrzi, a `{ stream, trace }` visszatérési alakot nem — ha Task 9 megírásakor a `trace` mezőre (SQL/retrieval napló a streamelt válaszhoz) mégsem lesz szükség, a visszatérési érték egyszerűsíthető `streamText(...)` közvetlen visszaadására; ha igen, a `stream` mezőn kell hívni a `toUIMessageStreamResponse()`/`pipeUIMessageStreamToResponse()` metódust.

- [ ] **Step 4: Teszt futtatása — zöld**

Run: `pnpm exec nx test core`
Expected: PASS.

- [ ] **Step 5: Export hozzáadása az `index.ts`-hez**

```ts
// packages/core/src/index.ts — az export * from './lib/ask-agent.js' sor UTÁN
export * from './lib/stream-agent.js'
```

- [ ] **Step 6: Lint + build**

Run: `pnpm exec nx run-many -t lint,build -p core`
Expected: hiba nélkül.

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat: add streaming agent entrypoint for the server chat route"
```

---

## Task 4: `apps/server` — Nx-app scaffold + Express bootstrap

**Files:**
- Create: `apps/server/package.json`, `apps/server/tsconfig.json`, `apps/server/tsconfig.app.json`, `apps/server/tsconfig.spec.json`, `apps/server/eslint.config.mjs`, `apps/server/vitest.config.mts`
- Create: `apps/server/src/main.ts`
- Create: `apps/server/src/app.ts`
- Create: `apps/server/src/app.spec.ts`
- Create: `apps/server/src/assets/.gitkeep`

**Interfaces:**
- Produces: `createApp(): Express` (`apps/server/src/app.ts`) — Task 5-10 minden route-ot ide regisztrál; `main.ts` ezt hívja és `listen`-el.

- [ ] **Step 1: Package-mappa és `package.json`**

```json
// apps/server/package.json
{
  "name": "server",
  "version": "0.0.1",
  "private": true,
  "nx": {
    "tags": ["scope:app"],
    "targets": {
      "build": {
        "executor": "@nx/esbuild:esbuild",
        "outputs": ["{options.outputPath}"],
        "defaultConfiguration": "production",
        "options": {
          "platform": "node",
          "outputPath": "apps/server/dist",
          "format": ["cjs"],
          "bundle": false,
          "main": "apps/server/src/main.ts",
          "tsConfig": "apps/server/tsconfig.app.json",
          "assets": ["apps/server/src/assets"],
          "esbuildOptions": {
            "sourcemap": true,
            "outExtension": { ".js": ".js" }
          }
        },
        "configurations": {
          "development": {},
          "production": {
            "esbuildOptions": {
              "sourcemap": false,
              "outExtension": { ".js": ".js" }
            }
          }
        }
      },
      "prune-lockfile": {
        "dependsOn": ["build"],
        "cache": true,
        "executor": "@nx/js:prune-lockfile",
        "outputs": [
          "{workspaceRoot}/apps/server/dist/package.json",
          "{workspaceRoot}/apps/server/dist/pnpm-lock.yaml"
        ],
        "options": { "buildTarget": "build" }
      },
      "copy-workspace-modules": {
        "dependsOn": ["build"],
        "cache": true,
        "outputs": ["{workspaceRoot}/apps/server/dist/workspace_modules"],
        "executor": "@nx/js:copy-workspace-modules",
        "options": { "buildTarget": "build" }
      },
      "prune": {
        "dependsOn": ["prune-lockfile", "copy-workspace-modules"],
        "executor": "nx:noop"
      },
      "serve": {
        "continuous": true,
        "executor": "@nx/js:node",
        "defaultConfiguration": "development",
        "dependsOn": ["build"],
        "options": { "buildTarget": "server:build", "runBuildTargetDependencies": false },
        "configurations": {
          "development": { "buildTarget": "server:build:development" },
          "production": { "buildTarget": "server:build:production" }
        }
      }
    }
  },
  "dependencies": {
    "@plantbase/core": "workspace:*",
    "@plantbase/db": "workspace:*",
    "express": "^5.1.0",
    "cookie-parser": "^1.4.7",
    "bcryptjs": "^3.0.2",
    "ai": "^6.0.0",
    "@ai-sdk/anthropic": "^2.0.0",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/cookie-parser": "^1.4.7",
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.0"
  }
}
```

- [ ] **Step 2: tsconfig-hármas (a `packages/core` és `apps/cli` mintáját ötvözve — build ÉS vitest is kell)**

```json
// apps/server/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "files": [],
  "include": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.spec.json" }
  ]
}
```

```json
// apps/server/tsconfig.app.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "types": ["node"],
    "rootDir": "src",
    "tsBuildInfoFile": "dist/tsconfig.app.tsbuildinfo"
  },
  "include": ["src/**/*.ts"],
  "exclude": [
    "eslint.config.js", "eslint.config.cjs", "eslint.config.mjs",
    "src/**/*.spec.ts"
  ],
  "references": [
    { "path": "../../packages/core/tsconfig.lib.json" },
    { "path": "../../packages/db/tsconfig.lib.json" }
  ]
}
```

```json
// apps/server/tsconfig.spec.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./out-tsc/vitest",
    "types": ["vitest/globals", "vitest/importMeta", "vite/client", "node", "vitest"],
    "forceConsistentCasingInFileNames": true
  },
  "include": [
    "vitest.config.mts",
    "src/**/*.test.ts",
    "src/**/*.spec.ts",
    "src/**/*.d.ts"
  ],
  "references": [{ "path": "./tsconfig.app.json" }]
}
```

- [ ] **Step 3: `eslint.config.mjs` (a `packages/core` mintája)**

```js
// apps/server/eslint.config.mjs
import baseConfig from '../../eslint.config.mjs'

export default [
  ...baseConfig,
  {
    files: ['**/*.json'],
    rules: {
      '@nx/dependency-checks': [
        'error',
        {
          ignoredFiles: [
            '{projectRoot}/eslint.config.{js,cjs,mjs,ts,cts,mts}',
            '{projectRoot}/vitest.config.{js,ts,mjs,mts}',
          ],
        },
      ],
    },
    languageOptions: {
      parser: await import('jsonc-eslint-parser'),
    },
  },
  { ignores: ['**/out-tsc'] },
]
```

- [ ] **Step 4: `vitest.config.mts` (a `packages/core` mintája)**

```ts
// apps/server/vitest.config.mts
import { defineConfig } from 'vitest/config'

export default defineConfig(() => ({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/server',
  test: {
    name: 'server',
    watch: false,
    passWithNoTests: true,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8' as const,
    },
  },
}))
```

- [ ] **Step 5: `app.ts` — Express app factory (route nélkül még, csak health-check)**

```ts
// apps/server/src/app.ts
import express, { type Express } from 'express'
import cookieParser from 'cookie-parser'

export function createApp(): Express {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  return app
}
```

- [ ] **Step 6: Failing test — `/health` végpont**

```ts
// apps/server/src/app.spec.ts
import request from 'supertest'
import { createApp } from './app.js'

describe('createApp', () => {
  it('responds to GET /health with ok status', async () => {
    const app = createApp()

    const response = await request(app).get('/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
  })
})
```

- [ ] **Step 7: `main.ts` — bootstrap**

```ts
// apps/server/src/main.ts
import { createApp } from './app.js'

try {
  process.loadEnvFile()
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
}

const PORT = Number(process.env.SERVER_PORT ?? 3000)
const app = createApp()

app.listen(PORT, () => {
  console.log(`Plantbase server listening on http://localhost:${PORT}`)
})
```

- [ ] **Step 8: Telepítés + tesztfuttatás**

Run:
```bash
pnpm install
pnpm exec nx test server
```
Expected: PASS (`GET /health` teszt zöld). Ha `pnpm install` `allowBuilds` jóváhagyást kér, töltsd ki `true`-ra a `pnpm-workspace.yaml`-ban és telepíts újra.

- [ ] **Step 9: Lint + build**

Run: `pnpm exec nx run-many -t lint,build -p server`
Expected: hiba nélkül.

- [ ] **Step 10: Commit**

```bash
git add apps/server pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat: scaffold apps/server with Express bootstrap"
```

---

## Task 5: `apps/server` — jelszó-szabály + hash (`lib/password.ts`)

**Files:**
- Create: `apps/server/src/lib/password.ts`
- Create: `apps/server/src/lib/password.spec.ts`

**Interfaces:**
- Produces: `PasswordSchema: ZodString` (jelszó-szabály validáció), `hashPassword(password: string): Promise<string>`, `verifyPassword(password: string, hash: string): Promise<boolean>`. Task 8 (register/login route) ezeket hívja.

- [ ] **Step 1: Failing test**

```ts
// apps/server/src/lib/password.spec.ts
import { PasswordSchema, hashPassword, verifyPassword } from './password.js'

describe('PasswordSchema', () => {
  it('accepts a password with lower, upper, digit, min 8 chars', () => {
    expect(PasswordSchema.safeParse('Abcdef12').success).toBe(true)
  })

  it('rejects a password shorter than 8 characters', () => {
    const result = PasswordSchema.safeParse('Ab1defg')
    expect(result.success).toBe(false)
  })

  it('rejects a password without an uppercase letter', () => {
    expect(PasswordSchema.safeParse('abcdef12').success).toBe(false)
  })

  it('rejects a password without a lowercase letter', () => {
    expect(PasswordSchema.safeParse('ABCDEF12').success).toBe(false)
  })

  it('rejects a password without a digit', () => {
    expect(PasswordSchema.safeParse('Abcdefgh').success).toBe(false)
  })
})

describe('hashPassword / verifyPassword', () => {
  it('hashes a password and verifies it back correctly', async () => {
    const hash = await hashPassword('Abcdef12')

    expect(hash).not.toBe('Abcdef12')
    await expect(verifyPassword('Abcdef12', hash)).resolves.toBe(true)
    await expect(verifyPassword('wrongPass1', hash)).resolves.toBe(false)
  })
})
```

- [ ] **Step 2: Teszt futtatása — bukik**

Run: `pnpm exec nx test server`
Expected: FAIL — `Cannot find module './password.js'`.

- [ ] **Step 3: Implementáció**

```ts
// apps/server/src/lib/password.ts
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const SALT_ROUNDS = 12

export const PasswordSchema = z
  .string()
  .min(8, 'A jelszónak legalább 8 karakter hosszúnak kell lennie.')
  .regex(/[a-z]/, 'A jelszónak tartalmaznia kell kisbetűt.')
  .regex(/[A-Z]/, 'A jelszónak tartalmaznia kell nagybetűt.')
  .regex(/[0-9]/, 'A jelszónak tartalmaznia kell számot.')

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
```

- [ ] **Step 4: Teszt futtatása — zöld**

Run: `pnpm exec nx test server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib/password.ts apps/server/src/lib/password.spec.ts
git commit -m "feat: add password policy and bcrypt hashing"
```

---

## Task 6: `apps/server` — session store (`lib/session-store.ts`)

**Files:**
- Create: `apps/server/src/lib/session-store.ts`
- Create: `apps/server/src/lib/session-store.spec.ts`

**Interfaces:**
- Consumes: `prisma` (`@plantbase/db`), Prisma `Account`/`Session` modellek (Task 1).
- Produces: `SessionAccount { id: number; fullName: string; salutation: string; email: string; role: string }`, `createSession(accountId: number): Promise<{ token: string; expiresAt: Date }>`, `getAccountBySessionToken(token: string): Promise<SessionAccount | null>`, `deleteSession(token: string): Promise<void>`. Task 7 (middleware) és Task 8 (auth routes) ezeket hívják.

- [ ] **Step 1: Failing test (Prisma mockolva)**

```ts
// apps/server/src/lib/session-store.spec.ts
import { prisma } from '@plantbase/db'
import {
  createSession,
  getAccountBySessionToken,
  deleteSession,
} from './session-store.js'

vi.mock('@plantbase/db', () => ({
  prisma: {
    session: {
      create: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

describe('createSession', () => {
  it('creates a session row with a random token and a 7-day expiry', async () => {
    vi.mocked(prisma.session.create).mockResolvedValue({} as never)

    const { token, expiresAt } = await createSession(42)

    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(prisma.session.create).toHaveBeenCalledWith({
      data: { token, accountId: 42, expiresAt },
    })
    const daysAhead = (expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    expect(daysAhead).toBeGreaterThan(6.9)
    expect(daysAhead).toBeLessThan(7.1)
  })
})

describe('getAccountBySessionToken', () => {
  it('returns the account when the session exists and is not expired', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      token: 'abc',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      account: {
        id: 1,
        fullName: 'Kovács Béla',
        salutation: 'Béla',
        email: 'bela@example.com',
        role: 'customer',
      },
    } as never)

    const account = await getAccountBySessionToken('abc')

    expect(account).toEqual({
      id: 1,
      fullName: 'Kovács Béla',
      salutation: 'Béla',
      email: 'bela@example.com',
      role: 'customer',
    })
  })

  it('returns null when the session does not exist', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue(null)

    await expect(getAccountBySessionToken('missing')).resolves.toBeNull()
  })

  it('returns null when the session is expired', async () => {
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      token: 'abc',
      expiresAt: new Date(Date.now() - 1000),
      account: {
        id: 1,
        fullName: 'X',
        salutation: 'X',
        email: 'x@example.com',
        role: 'customer',
      },
    } as never)

    await expect(getAccountBySessionToken('abc')).resolves.toBeNull()
  })
})

describe('deleteSession', () => {
  it('deletes the session row by token', async () => {
    vi.mocked(prisma.session.deleteMany).mockResolvedValue({ count: 1 } as never)

    await deleteSession('abc')

    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { token: 'abc' },
    })
  })
})
```

- [ ] **Step 2: Teszt futtatása — bukik**

Run: `pnpm exec nx test server`
Expected: FAIL — a modul nem létezik.

- [ ] **Step 3: Implementáció**

```ts
// apps/server/src/lib/session-store.ts
import { randomBytes } from 'node:crypto'
import { prisma } from '@plantbase/db'

const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 7)

export interface SessionAccount {
  id: number
  fullName: string
  salutation: string
  email: string
  role: string
}

export async function createSession(
  accountId: number,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(
    Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
  )
  await prisma.session.create({ data: { token, accountId, expiresAt } })
  return { token, expiresAt }
}

export async function getAccountBySessionToken(
  token: string,
): Promise<SessionAccount | null> {
  const session = await prisma.session.findUnique({
    where: { token },
    include: { account: true },
  })
  if (!session || session.expiresAt < new Date()) return null
  return {
    id: session.account.id,
    fullName: session.account.fullName,
    salutation: session.account.salutation,
    email: session.account.email,
    role: session.account.role,
  }
}

export async function deleteSession(token: string): Promise<void> {
  await prisma.session.deleteMany({ where: { token } })
}
```

- [ ] **Step 4: Teszt futtatása — zöld**

Run: `pnpm exec nx test server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib/session-store.ts apps/server/src/lib/session-store.spec.ts
git commit -m "feat: add DB-backed session store"
```

---

## Task 7: `apps/server` — session middleware

**Files:**
- Create: `apps/server/src/middleware/session.ts`
- Create: `apps/server/src/middleware/session.spec.ts`

**Interfaces:**
- Consumes: `getAccountBySessionToken` (Task 6), `SessionAccount` típus.
- Produces: `SESSION_COOKIE_NAME: string`, `attachAccount` (Express middleware — mindig lefut, `req.account`-ot állítja be, ha van érvényes session, egyébként `undefined`-ot hagy, sosem 401-el), `requireAccount` (Express middleware — 401-et ad, ha nincs `req.account`). Express `Request` típus bővítve `account?: SessionAccount` mezővel. Task 8-10 minden védett route-ja `requireAccount`-ot használja.

- [ ] **Step 1: Failing test**

```ts
// apps/server/src/middleware/session.spec.ts
import type { Request, Response } from 'express'
import { attachAccount, requireAccount, SESSION_COOKIE_NAME } from './session.js'
import { getAccountBySessionToken } from '../lib/session-store.js'

vi.mock('../lib/session-store.js', () => ({
  getAccountBySessionToken: vi.fn(),
}))

function mockReqRes(cookies: Record<string, string> = {}) {
  const req = { cookies, account: undefined } as unknown as Request & {
    account?: unknown
  }
  const json = vi.fn()
  const status = vi.fn().mockReturnValue({ json })
  const res = { status } as unknown as Response
  const next = vi.fn()
  return { req, res, next, json, status }
}

describe('attachAccount', () => {
  beforeEach(() => vi.clearAllMocks())

  it('attaches the account to the request when the cookie is a valid session', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue({
      id: 1,
      fullName: 'X',
      salutation: 'X',
      email: 'x@example.com',
      role: 'customer',
    })
    const { req, res, next } = mockReqRes({ [SESSION_COOKIE_NAME]: 'tok' })

    await attachAccount(req, res, next)

    expect(req.account).toEqual({
      id: 1,
      fullName: 'X',
      salutation: 'X',
      email: 'x@example.com',
      role: 'customer',
    })
    expect(next).toHaveBeenCalledOnce()
  })

  it('leaves the account undefined and still calls next when there is no cookie', async () => {
    const { req, res, next } = mockReqRes()

    await attachAccount(req, res, next)

    expect(req.account).toBeUndefined()
    expect(next).toHaveBeenCalledOnce()
  })
})

describe('requireAccount', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls next when req.account is set', () => {
    const { req, res, next } = mockReqRes()
    ;(req as unknown as { account: unknown }).account = { id: 1 }

    requireAccount(req, res, next)

    expect(next).toHaveBeenCalledOnce()
  })

  it('responds 401 when req.account is missing', () => {
    const { req, res, next, status, json } = mockReqRes()

    requireAccount(req, res, next)

    expect(status).toHaveBeenCalledWith(401)
    expect(json).toHaveBeenCalledWith({ error: 'Bejelentkezés szükséges.' })
    expect(next).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Teszt futtatása — bukik**

Run: `pnpm exec nx test server`
Expected: FAIL — a modul nem létezik.

- [ ] **Step 3: Implementáció**

```ts
// apps/server/src/middleware/session.ts
import type { NextFunction, Request, Response } from 'express'
import { getAccountBySessionToken, type SessionAccount } from '../lib/session-store.js'

export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME ?? 'plantbase_session'

declare module 'express-serve-static-core' {
  interface Request {
    account?: SessionAccount
  }
}

export async function attachAccount(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE_NAME]
  if (typeof token === 'string') {
    const account = await getAccountBySessionToken(token)
    if (account) req.account = account
  }
  next()
}

export function requireAccount(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.account) {
    res.status(401).json({ error: 'Bejelentkezés szükséges.' })
    return
  }
  next()
}
```

- [ ] **Step 4: Teszt futtatása — zöld**

Run: `pnpm exec nx test server`
Expected: PASS.

- [ ] **Step 5: `attachAccount` bekötése az `app.ts`-be**

```ts
// apps/server/src/app.ts — a cookieParser() sor UTÁN
import { attachAccount } from './middleware/session.js'
// ...
app.use(cookieParser())
app.use(attachAccount)
```

- [ ] **Step 6: Regresszió — `app.spec.ts` továbbra is zöld**

Run: `pnpm exec nx test server`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/middleware apps/server/src/app.ts
git commit -m "feat: add session middleware"
```

---

## Task 8: `apps/server` — auth route-ok (register/login/logout/me)

**Files:**
- Create: `apps/server/src/routes/auth.ts`
- Create: `apps/server/src/routes/auth.spec.ts`
- Modify: `apps/server/src/app.ts`

**Interfaces:**
- Consumes: `PasswordSchema`, `hashPassword`, `verifyPassword` (Task 5); `createSession`, `deleteSession` (Task 6); `SESSION_COOKIE_NAME`, `requireAccount` (Task 7); `prisma` (`@plantbase/db`).
- Produces: `authRouter: Router` — `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`. Task 9/10 route-jai ugyanígy `requireAccount`-tal védettek, Task 12 (web api-client) ezeket a végpontokat hívja.

- [ ] **Step 1: Failing test (Prisma és session-store mockolva, supertest az Express appon)**

```ts
// apps/server/src/routes/auth.spec.ts
import request from 'supertest'
import { prisma } from '@plantbase/db'
import { createApp } from '../app.js'
import { createSession, deleteSession, getAccountBySessionToken } from '../lib/session-store.js'
import { SESSION_COOKIE_NAME } from '../middleware/session.js'

vi.mock('@plantbase/db', () => ({
  prisma: {
    account: { create: vi.fn(), findUnique: vi.fn() },
  },
}))
vi.mock('../lib/session-store.js', () => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getAccountBySessionToken: vi.fn(),
}))

describe('POST /api/auth/register', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a customer account and sets the session cookie', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.account.create).mockResolvedValue({
      id: 1,
      fullName: 'Kovács Béla',
      salutation: 'Béla',
      email: 'bela@example.com',
      role: 'customer',
    } as never)
    vi.mocked(createSession).mockResolvedValue({
      token: 'tok123',
      expiresAt: new Date(Date.now() + 1000),
    })

    const response = await request(createApp())
      .post('/api/auth/register')
      .send({
        fullName: 'Kovács Béla',
        salutation: 'Béla',
        email: 'bela@example.com',
        password: 'Abcdef12',
        passwordConfirm: 'Abcdef12',
      })

    expect(response.status).toBe(201)
    expect(response.body).toEqual({
      id: 1,
      fullName: 'Kovács Béla',
      salutation: 'Béla',
      email: 'bela@example.com',
      role: 'customer',
    })
    expect(response.headers['set-cookie'][0]).toContain(SESSION_COOKIE_NAME)
  })

  it('rejects when the two passwords do not match', async () => {
    const response = await request(createApp())
      .post('/api/auth/register')
      .send({
        fullName: 'X',
        salutation: 'X',
        email: 'x@example.com',
        password: 'Abcdef12',
        passwordConfirm: 'Abcdef13',
      })

    expect(response.status).toBe(400)
  })

  it('rejects a weak password', async () => {
    const response = await request(createApp())
      .post('/api/auth/register')
      .send({
        fullName: 'X',
        salutation: 'X',
        email: 'x@example.com',
        password: 'weak',
        passwordConfirm: 'weak',
      })

    expect(response.status).toBe(400)
  })

  it('returns 409 when the email is already registered', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue({ id: 1 } as never)

    const response = await request(createApp())
      .post('/api/auth/register')
      .send({
        fullName: 'X',
        salutation: 'X',
        email: 'bela@example.com',
        password: 'Abcdef12',
        passwordConfirm: 'Abcdef12',
      })

    expect(response.status).toBe(409)
  })
})

describe('POST /api/auth/login', () => {
  beforeEach(() => vi.clearAllMocks())

  it('logs in with correct credentials and sets the session cookie', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue({
      id: 1,
      fullName: 'Kovács Béla',
      salutation: 'Béla',
      email: 'bela@example.com',
      role: 'customer',
      passwordHash: await (await import('../lib/password.js')).hashPassword('Abcdef12'),
    } as never)
    vi.mocked(createSession).mockResolvedValue({
      token: 'tok123',
      expiresAt: new Date(Date.now() + 1000),
    })

    const response = await request(createApp())
      .post('/api/auth/login')
      .send({ email: 'bela@example.com', password: 'Abcdef12' })

    expect(response.status).toBe(200)
    expect(response.headers['set-cookie'][0]).toContain(SESSION_COOKIE_NAME)
  })

  it('returns 401 with a generic message for a wrong password', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue({
      id: 1,
      passwordHash: await (await import('../lib/password.js')).hashPassword('Abcdef12'),
    } as never)

    const response = await request(createApp())
      .post('/api/auth/login')
      .send({ email: 'bela@example.com', password: 'wrongPass1' })

    expect(response.status).toBe(401)
    expect(response.body).toEqual({ error: 'Hibás e-mail vagy jelszó.' })
  })

  it('returns 401 with the same generic message for an unknown email', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(null)

    const response = await request(createApp())
      .post('/api/auth/login')
      .send({ email: 'unknown@example.com', password: 'Abcdef12' })

    expect(response.status).toBe(401)
    expect(response.body).toEqual({ error: 'Hibás e-mail vagy jelszó.' })
  })
})

describe('POST /api/auth/logout', () => {
  it('deletes the session and clears the cookie', async () => {
    const response = await request(createApp())
      .post('/api/auth/logout')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok123`])

    expect(response.status).toBe(204)
    expect(deleteSession).toHaveBeenCalledWith('tok123')
  })
})

describe('GET /api/auth/me', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const response = await request(createApp()).get('/api/auth/me')

    expect(response.status).toBe(401)
  })

  it('returns the account when authenticated', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue({
      id: 1,
      fullName: 'Kovács Béla',
      salutation: 'Béla',
      email: 'bela@example.com',
      role: 'customer',
    })

    const response = await request(createApp())
      .get('/api/auth/me')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok123`])

    expect(response.status).toBe(200)
    expect(response.body.email).toBe('bela@example.com')
  })
})
```

- [ ] **Step 2: Teszt futtatása — bukik**

Run: `pnpm exec nx test server`
Expected: FAIL — az `auth.ts` route modul nem létezik / nincs bekötve.

- [ ] **Step 3: Implementáció**

```ts
// apps/server/src/routes/auth.ts
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '@plantbase/db'
import { PasswordSchema, hashPassword, verifyPassword } from '../lib/password.js'
import { createSession, deleteSession } from '../lib/session-store.js'
import { SESSION_COOKIE_NAME } from '../middleware/session.js'
import { requireAccount } from '../middleware/session.js'

const RegisterSchema = z
  .object({
    fullName: z.string().trim().min(1, 'A teljes név megadása kötelező.'),
    salutation: z.string().trim().min(1, 'A megszólítás megadása kötelező.'),
    email: z.string().trim().email('Érvénytelen e-mail cím.'),
    password: PasswordSchema,
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: 'A két jelszó nem egyezik.',
    path: ['passwordConfirm'],
  })

const LoginSchema = z.object({
  email: z.string().trim().email('Érvénytelen e-mail cím.'),
  password: z.string().min(1, 'A jelszó megadása kötelező.'),
})

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: false,
}

export const authRouter = Router()

authRouter.post('/api/auth/register', async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  const { fullName, salutation, email, password } = parsed.data

  const existing = await prisma.account.findUnique({ where: { email } })
  if (existing) {
    res.status(409).json({ error: 'Ez az e-mail cím már regisztrálva van.' })
    return
  }

  const passwordHash = await hashPassword(password)
  const account = await prisma.account.create({
    data: { fullName, salutation, email, passwordHash, role: 'customer' },
  })

  const { token, expiresAt } = await createSession(account.id)
  res.cookie(SESSION_COOKIE_NAME, token, { ...SESSION_COOKIE_OPTIONS, expires: expiresAt })
  res.status(201).json({
    id: account.id,
    fullName: account.fullName,
    salutation: account.salutation,
    email: account.email,
    role: account.role,
  })
})

authRouter.post('/api/auth/login', async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  const { email, password } = parsed.data

  const account = await prisma.account.findUnique({ where: { email } })
  if (!account || !(await verifyPassword(password, account.passwordHash))) {
    res.status(401).json({ error: 'Hibás e-mail vagy jelszó.' })
    return
  }

  const { token, expiresAt } = await createSession(account.id)
  res.cookie(SESSION_COOKIE_NAME, token, { ...SESSION_COOKIE_OPTIONS, expires: expiresAt })
  res.status(200).json({
    id: account.id,
    fullName: account.fullName,
    salutation: account.salutation,
    email: account.email,
    role: account.role,
  })
})

authRouter.post('/api/auth/logout', async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE_NAME]
  if (typeof token === 'string') await deleteSession(token)
  res.clearCookie(SESSION_COOKIE_NAME)
  res.status(204).send()
})

authRouter.get('/api/auth/me', requireAccount, (req, res) => {
  res.status(200).json(req.account)
})
```

- [ ] **Step 4: Bekötés az `app.ts`-be**

```ts
// apps/server/src/app.ts
import { authRouter } from './routes/auth.js'
// ... app.use(attachAccount) UTÁN:
app.use(authRouter)
```

- [ ] **Step 5: Teszt futtatása — zöld**

Run: `pnpm exec nx test server`
Expected: PASS.

- [ ] **Step 6: Lint + build**

Run: `pnpm exec nx run-many -t lint,build -p server`
Expected: hiba nélkül.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/routes apps/server/src/app.ts
git commit -m "feat: add register/login/logout/me auth routes"
```

---

## Task 9: `apps/server` — `/api/chat` streaming route

**Files:**
- Create: `apps/server/src/routes/chat.ts`
- Create: `apps/server/src/routes/chat.spec.ts`
- Modify: `apps/server/src/app.ts`

**Interfaces:**
- Consumes: `streamAgentResponse` (Task 3, `@plantbase/core`), `requireAccount` (Task 7).
- Produces: `chatRouter: Router` — `POST /api/chat`, csak bejelentkezve érhető el. Task 13 (web chat page, `useChat`) ezt hívja.

- [ ] **Step 1: ELSŐ LÉPÉSKÉNT — Context7-doksi ellenőrzése**

Nézd meg a Context7-en (vagy a `ai` csomag `node_modules/ai/dist/index.d.ts`-ében telepítés után) a `streamText` visszatérési objektumának Node/Express-kompatibilis stream-válasz metódusát (a terv írásakor ismert név: `pipeUIMessageStreamToResponse(res)`, alternatívaként `toUIMessageStreamResponse()` egy Fetch `Response`-t ad vissza, amit kézzel kell fejléc+body szinten Express `res`-re másolni), valamint a `convertToModelMessages` és `UIMessage` importok elérhetőségét. Az alábbi kód ezt a feltételezett API-t követi — ha eltér, ehhez igazítsd, a viselkedést (streamelt válasz a bejelentkezett fióknak, a megszólítással) tartsd meg.

- [ ] **Step 2: Failing test**

```ts
// apps/server/src/routes/chat.spec.ts
import request from 'supertest'
import { createApp } from '../app.js'
import { streamAgentResponse } from '@plantbase/core'
import { getAccountBySessionToken } from '../lib/session-store.js'
import { SESSION_COOKIE_NAME } from '../middleware/session.js'

vi.mock('@plantbase/core', () => ({
  streamAgentResponse: vi.fn(),
}))
vi.mock('../lib/session-store.js', () => ({
  getAccountBySessionToken: vi.fn(),
}))

describe('POST /api/chat', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const response = await request(createApp())
      .post('/api/chat')
      .send({ messages: [] })

    expect(response.status).toBe(401)
    expect(streamAgentResponse).not.toHaveBeenCalled()
  })

  it('calls streamAgentResponse with the account salutation when authenticated', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue({
      id: 1,
      fullName: 'Kovács Béla',
      salutation: 'Béla',
      email: 'bela@example.com',
      role: 'customer',
    })
    vi.mocked(streamAgentResponse).mockReturnValue({
      stream: {
        pipeUIMessageStreamToResponse: (res: { end: () => void }) => res.end(),
      },
      trace: { generatedSql: [], retrieval: [] },
    } as never)

    const response = await request(createApp())
      .post('/api/chat')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok123`])
      .send({
        messages: [
          { role: 'user', parts: [{ type: 'text', text: 'Szia' }] },
        ],
      })

    expect(response.status).toBe(200)
    expect(streamAgentResponse).toHaveBeenCalledOnce()
    const [, options] = vi.mocked(streamAgentResponse).mock.calls[0]
    expect(options).toEqual({ salutation: 'Béla' })
  })
})
```

- [ ] **Step 3: Teszt futtatása — bukik**

Run: `pnpm exec nx test server`
Expected: FAIL — a `chat.ts` route modul nem létezik.

- [ ] **Step 4: Implementáció**

```ts
// apps/server/src/routes/chat.ts
import { Router } from 'express'
import { z } from 'zod'
import { streamAgentResponse } from '@plantbase/core'
import { convertToModelMessages, type UIMessage } from 'ai'
import { requireAccount } from '../middleware/session.js'

const ChatRequestSchema = z.object({
  messages: z.array(z.unknown()),
})

export const chatRouter = Router()

chatRouter.post('/api/chat', requireAccount, (req, res) => {
  const parsed = ChatRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Érvénytelen kérés.' })
    return
  }

  const uiMessages = parsed.data.messages as UIMessage[]
  const { stream } = streamAgentResponse(convertToModelMessages(uiMessages), {
    salutation: req.account?.salutation,
  })
  stream.pipeUIMessageStreamToResponse(res)
})
```

- [ ] **Step 5: Bekötés az `app.ts`-be**

```ts
// apps/server/src/app.ts
import { chatRouter } from './routes/chat.js'
// ... app.use(authRouter) UTÁN:
app.use(chatRouter)
```

- [ ] **Step 6: Teszt futtatása — zöld**

Run: `pnpm exec nx test server`
Expected: PASS.

- [ ] **Step 7: Lint + build**

Run: `pnpm exec nx run-many -t lint,build -p server`
Expected: hiba nélkül.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/routes/chat.ts apps/server/src/routes/chat.spec.ts apps/server/src/app.ts
git commit -m "feat: add streaming /api/chat route"
```

---

## Task 10: `apps/server` — `/debug/knowledge` route

**Files:**
- Create: `apps/server/src/routes/debug.ts`
- Create: `apps/server/src/routes/debug.spec.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `packages/core/src/index.ts` (ha a `searchKnowledge` még nincs exportálva)

**Interfaces:**
- Consumes: `searchKnowledge(query: string): Promise<SearchKnowledgeOutput>` (`@plantbase/core`), `requireAccount` (Task 7).
- Produces: `debugRouter: Router` — `GET /debug/knowledge?query=...`, csak bejelentkezve.

- [ ] **Step 1: `searchKnowledge` export ellenőrzése/hozzáadása**

Nézd meg a `packages/core/src/index.ts`-t — ha nincs benne `export * from './lib/knowledge/search-knowledge.js'`, add hozzá.

- [ ] **Step 2: Failing test**

```ts
// apps/server/src/routes/debug.spec.ts
import request from 'supertest'
import { createApp } from '../app.js'
import { searchKnowledge } from '@plantbase/core'
import { getAccountBySessionToken } from '../lib/session-store.js'
import { SESSION_COOKIE_NAME } from '../middleware/session.js'

vi.mock('@plantbase/core', () => ({
  searchKnowledge: vi.fn(),
}))
vi.mock('../lib/session-store.js', () => ({
  getAccountBySessionToken: vi.fn(),
}))

describe('GET /debug/knowledge', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const response = await request(createApp()).get('/debug/knowledge?query=öntözés')

    expect(response.status).toBe(401)
  })

  it('returns the search result and trace when authenticated', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue({
      id: 1, fullName: 'X', salutation: 'X', email: 'x@example.com', role: 'customer',
    })
    vi.mocked(searchKnowledge).mockResolvedValue({
      result: { found: true, chunks: [] },
      trace: {
        query: 'öntözés', hydeText: 'x', candidateCount: 0,
        scores: [], selectedChunkIds: [], found: true,
      },
    })

    const response = await request(createApp())
      .get('/debug/knowledge?query=öntözés')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok123`])

    expect(response.status).toBe(200)
    expect(response.body.result.found).toBe(true)
    expect(searchKnowledge).toHaveBeenCalledWith('öntözés')
  })

  it('returns 400 when the query parameter is missing', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue({
      id: 1, fullName: 'X', salutation: 'X', email: 'x@example.com', role: 'customer',
    })

    const response = await request(createApp())
      .get('/debug/knowledge')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok123`])

    expect(response.status).toBe(400)
  })
})
```

- [ ] **Step 3: Teszt futtatása — bukik**

Run: `pnpm exec nx test server`
Expected: FAIL.

- [ ] **Step 4: Implementáció**

```ts
// apps/server/src/routes/debug.ts
import { Router } from 'express'
import { z } from 'zod'
import { searchKnowledge } from '@plantbase/core'
import { requireAccount } from '../middleware/session.js'

const QuerySchema = z.object({
  query: z.string().trim().min(1, 'A query paraméter kötelező.'),
})

export const debugRouter = Router()

debugRouter.get('/debug/knowledge', requireAccount, async (req, res) => {
  const parsed = QuerySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  const output = await searchKnowledge(parsed.data.query)
  res.status(200).json(output)
})
```

- [ ] **Step 5: Bekötés az `app.ts`-be**

```ts
// apps/server/src/app.ts
import { debugRouter } from './routes/debug.js'
// ... app.use(chatRouter) UTÁN:
app.use(debugRouter)
```

- [ ] **Step 6: Teszt futtatása — zöld**

Run: `pnpm exec nx test server`
Expected: PASS.

- [ ] **Step 7: Lint + build a teljes szerver projektre**

Run: `pnpm exec nx run-many -t lint,test,build -p server`
Expected: minden target hiba nélkül lefut.

- [ ] **Step 8: Commit**

```bash
git add apps/server/src/routes/debug.ts apps/server/src/routes/debug.spec.ts apps/server/src/app.ts packages/core/src/index.ts
git commit -m "feat: add /debug/knowledge route"
```

---

## Task 11: `apps/web` — Vite + React + Tailwind 4 scaffold + shadcn-mintájú primitívek

**Files:**
- Create: `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/tsconfig.json`, `apps/web/tsconfig.app.json`, `apps/web/index.html`
- Create: `apps/web/src/main.tsx`, `apps/web/src/app.tsx`, `apps/web/src/index.css`
- Create: `apps/web/src/lib/cn.ts`
- Create: `apps/web/src/components/ui/button.tsx`, `apps/web/src/components/ui/input.tsx`, `apps/web/src/components/ui/label.tsx`, `apps/web/src/components/ui/card.tsx`

**Interfaces:**
- Produces: `cn(...classes: ClassValue[]): string` (Tailwind class-merge util), `<Button>`, `<Input>`, `<Label>`, `<Card>`/`<CardHeader>`/`<CardContent>` React komponensek — Task 12/13 ezekre épít.

- [ ] **Step 1: `package.json`**

```json
// apps/web/package.json
{
  "name": "web",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "nx": { "tags": ["scope:app"] },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "ai": "^6.0.0",
    "@ai-sdk/react": "^2.0.0",
    "@radix-ui/react-slot": "^1.1.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^3.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^5.0.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/vite": "^4.0.0"
  }
}
```

Nincs kézzel írt `nx.targets` blokk — a gyökér `nx.json`-ban regisztrált `@nx/vite/plugin` a `vite.config.ts` jelenlétéből automatikusan felismeri a `build`/`serve`/`dev`/`preview` targeteket.

- [ ] **Step 2: `vite.config.ts`**

```ts
// apps/web/vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/web',
  plugins: [react(), tailwindcss()],
  server: {
    port: 4200,
    proxy: {
      '/api': 'http://localhost:3000',
      '/debug': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    watch: false,
    passWithNoTests: true,
    globals: true,
    environment: 'node',
  },
})
```

- [ ] **Step 3: tsconfig-ek**

```json
// apps/web/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "files": [],
  "include": [],
  "references": [{ "path": "./tsconfig.app.json" }]
}
```

```json
// apps/web/tsconfig.app.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "lib": ["es2022", "dom", "dom.iterable"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "types": ["vite/client"],
    "noEmit": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "references": [{ "path": "../../packages/core/tsconfig.lib.json" }]
}
```

- [ ] **Step 4: `index.html` + belépési pont**

```html
<!-- apps/web/index.html -->
<!doctype html>
<html lang="hu">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Plantbase</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

```tsx
// apps/web/src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

```css
/* apps/web/src/index.css */
@import "tailwindcss";
```

```tsx
// apps/web/src/app.tsx — ideiglenes placeholder, Task 12-13 cseréli le
export function App() {
  return <div className="p-4">Plantbase</div>
}
```

- [ ] **Step 5: `cn` util + shadcn-mintájú primitívek**

```ts
// apps/web/src/lib/cn.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
```

```tsx
// apps/web/src/components/ui/button.tsx
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/cn.js'

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-green-700 text-white hover:bg-green-800',
        outline: 'border border-gray-300 bg-white hover:bg-gray-50',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'
```

```tsx
// apps/web/src/components/ui/input.tsx
import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '../../lib/cn.js'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600',
        className,
      )}
      {...props}
    />
  ),
)
Input.displayName = 'Input'
```

```tsx
// apps/web/src/components/ui/label.tsx
import { forwardRef, type LabelHTMLAttributes } from 'react'
import { cn } from '../../lib/cn.js'

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn('text-sm font-medium', className)} {...props} />
  ),
)
Label.displayName = 'Label'
```

```tsx
// apps/web/src/components/ui/card.tsx
import type { HTMLAttributes } from 'react'
import { cn } from '../../lib/cn.js'

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-gray-200 bg-white shadow-sm', className)} {...props} />
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6 pb-2', className)} {...props} />
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6 pt-2', className)} {...props} />
}
```

- [ ] **Step 6: Telepítés + dev-szerver smoke-check**

Run:
```bash
pnpm install
pnpm exec nx run web:serve
```
Expected: a Vite dev-szerver elindul (`http://localhost:4200`), a böngészőben "Plantbase" felirat látszik hiba nélkül. Állítsd le utána (Ctrl+C).

- [ ] **Step 7: Lint**

Run: `pnpm exec nx run web:lint`
Expected: hiba nélkül (ha az `@nx/eslint/plugin` nem ismer fel automatikus lint targetet egy `eslint.config.mjs` nélkül, hozd létre a `packages/core` mintáját követve, `apps/web/eslint.config.mjs`-ként, JSX/React szabályok nélkül egyelőre).

- [ ] **Step 8: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "feat: scaffold apps/web with Vite, React 19, Tailwind 4, shadcn-style primitives"
```

---

## Task 12: `apps/web` — api-client + regisztráció/belépés oldalak

**Files:**
- Create: `apps/web/src/lib/api-client.ts`
- Create: `apps/web/src/pages/register-page.tsx`
- Create: `apps/web/src/pages/login-page.tsx`
- Create: `apps/web/src/lib/auth-context.tsx`
- Modify: `apps/web/src/app.tsx`

**Interfaces:**
- Produces: `Account { id: number; fullName: string; salutation: string; email: string; role: string }`, `register(input): Promise<Account>`, `login(input): Promise<Account>`, `logout(): Promise<void>`, `fetchMe(): Promise<Account | null>` (`api-client.ts`); `AuthProvider`, `useAuth(): { account: Account | null; loading: boolean; refresh(): Promise<void> }` (`auth-context.tsx`). Task 13 (chat page) a `useAuth()`-ot és az `Account.salutation`-t használja.

- [ ] **Step 1: `api-client.ts`**

```ts
// apps/web/src/lib/api-client.ts
export interface Account {
  id: number
  fullName: string
  salutation: string
  email: string
  role: string
}

async function parseJsonOrThrow(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = (body as { error?: string }).error ?? 'Ismeretlen hiba történt.'
    throw new Error(message)
  }
  return body
}

export async function register(input: {
  fullName: string
  salutation: string
  email: string
  password: string
  passwordConfirm: string
}): Promise<Account> {
  const response = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  })
  return (await parseJsonOrThrow(response)) as Account
}

export async function login(input: { email: string; password: string }): Promise<Account> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(input),
  })
  return (await parseJsonOrThrow(response)) as Account
}

export async function logout(): Promise<void> {
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
}

export async function fetchMe(): Promise<Account | null> {
  const response = await fetch('/api/auth/me', { credentials: 'include' })
  if (response.status === 401) return null
  return (await parseJsonOrThrow(response)) as Account
}
```

- [ ] **Step 2: `auth-context.tsx`**

```tsx
// apps/web/src/lib/auth-context.tsx
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { fetchMe, type Account } from './api-client.js'

interface AuthState {
  account: Account | null
  loading: boolean
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    const current = await fetchMe()
    setAccount(current)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <AuthContext.Provider value={{ account, loading, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth csak AuthProvider alatt használható.')
  return ctx
}
```

- [ ] **Step 3: `register-page.tsx`**

```tsx
// apps/web/src/pages/register-page.tsx
import { useState, type FormEvent } from 'react'
import { register } from '../lib/api-client.js'
import { useAuth } from '../lib/auth-context.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { Label } from '../components/ui/label.js'
import { Card, CardContent, CardHeader } from '../components/ui/card.js'

export function RegisterPage({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const { refresh } = useAuth()
  const [fullName, setFullName] = useState('')
  const [salutation, setSalutation] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await register({ fullName, salutation, email, password, passwordConfirm })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ismeretlen hiba történt.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="mx-auto mt-16 max-w-sm">
      <CardHeader>
        <h1 className="text-lg font-semibold">Regisztráció</h1>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div>
            <Label htmlFor="fullName">Teljes név</Label>
            <Input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="salutation">Megszólítás</Label>
            <Input id="salutation" required value={salutation} onChange={(e) => setSalutation(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="email">E-mail cím</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">Jelszó</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="passwordConfirm">Jelszó mégegyszer</Label>
            <Input id="passwordConfirm" type="password" required value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Regisztráció...' : 'Regisztráció'}
          </Button>
        </form>
        <button
          type="button"
          className="mt-3 w-full text-sm text-gray-600 underline"
          onClick={onSwitchToLogin}
        >
          Már van fiókod? Belépés
        </button>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: `login-page.tsx`**

```tsx
// apps/web/src/pages/login-page.tsx
import { useState, type FormEvent } from 'react'
import { login } from '../lib/api-client.js'
import { useAuth } from '../lib/auth-context.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { Label } from '../components/ui/label.js'
import { Card, CardContent, CardHeader } from '../components/ui/card.js'

export function LoginPage({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const { refresh } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login({ email, password })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ismeretlen hiba történt.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="mx-auto mt-16 max-w-sm">
      <CardHeader>
        <h1 className="text-lg font-semibold">Belépés</h1>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div>
            <Label htmlFor="email">E-mail cím</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">Jelszó</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Belépés...' : 'Belépés'}
          </Button>
        </form>
        <button
          type="button"
          className="mt-3 w-full text-sm text-gray-600 underline"
          onClick={onSwitchToRegister}
        >
          Nincs még fiókod? Regisztráció
        </button>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 5: `app.tsx` — auth-gate**

```tsx
// apps/web/src/app.tsx
import { useState } from 'react'
import { AuthProvider, useAuth } from './lib/auth-context.js'
import { RegisterPage } from './pages/register-page.js'
import { LoginPage } from './pages/login-page.js'

function AppContent() {
  const { account, loading } = useAuth()
  const [view, setView] = useState<'login' | 'register'>('login')

  if (loading) return <div className="p-4">Betöltés...</div>

  if (!account) {
    return view === 'login' ? (
      <LoginPage onSwitchToRegister={() => setView('register')} />
    ) : (
      <RegisterPage onSwitchToLogin={() => setView('login')} />
    )
  }

  return <div className="p-4">Bejelentkezve: {account.salutation}</div>
}

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
```

- [ ] **Step 6: Manuális smoke-check böngészőben**

Run (két külön terminálban):
```bash
pnpm exec nx run server:serve
pnpm exec nx run web:serve
```
Nyisd meg `http://localhost:4200`-t: regisztrálj egy teszt-fiókkal, majd ellenőrizd, hogy a "Bejelentkezve: <megszólítás>" szöveg megjelenik. Töltsd újra az oldalt — a session cookie miatt továbbra is bejelentkezve kell maradnia.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib apps/web/src/pages apps/web/src/app.tsx
git commit -m "feat: add registration and login pages with session-based auth gate"
```

---

## Task 13: `apps/web` — chat oldal (`useChat`, tool-kártyák, agent-badge)

**Files:**
- Create: `apps/web/src/pages/chat-page.tsx`
- Create: `apps/web/src/components/chat/message-list.tsx`
- Create: `apps/web/src/components/chat/tool-card.tsx`
- Create: `apps/web/src/components/chat/agent-badge.tsx`
- Modify: `apps/web/src/app.tsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 12), `Account` típus.
- Produces: `ChatPage` — a bejelentkezés utáni fő nézet.

- [ ] **Step 1: ELSŐ LÉPÉSKÉNT — Context7-doksi ellenőrzése**

Nézd meg a Context7-en (vagy telepítés után a `node_modules/@ai-sdk/react/dist/index.d.ts`-ben) a `useChat` aktuális API-ját: a `transport`/`DefaultChatTransport` konfigurációs alakot, a visszaadott `messages`/`sendMessage`/`status` mezőket, és az üzenet `parts` tömb tool-hívás-elemeinek típusnevét (a terv írásakor ismert alak: `type: 'tool-<toolName>'`, `state`, `input`, `output` mezőkkel). Az alábbi kód ezt követi — ha eltér, ehhez igazítsd.

- [ ] **Step 2: `agent-badge.tsx`**

```tsx
// apps/web/src/components/chat/agent-badge.tsx
export function AgentBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
      Info-agent
    </span>
  )
}
```

- [ ] **Step 3: `tool-card.tsx`**

```tsx
// apps/web/src/components/chat/tool-card.tsx
interface ToolPart {
  type: string
  toolCallId?: string
  input?: unknown
  output?: unknown
  state?: string
}

const TOOL_LABELS: Record<string, string> = {
  'tool-runSql': 'Katalógus-lekérdezés',
  'tool-listCategories': 'Kategóriák listázása',
  'tool-searchKnowledge': 'Tudásbázis-keresés',
}

export function ToolCard({ part }: { part: ToolPart }) {
  const label = TOOL_LABELS[part.type] ?? part.type
  return (
    <div className="my-1 rounded-md border border-gray-200 bg-gray-50 p-2 text-xs">
      <div className="font-medium text-gray-700">{label}</div>
      {part.input !== undefined && (
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-gray-500">
          {JSON.stringify(part.input, null, 2)}
        </pre>
      )}
    </div>
  )
}
```

- [ ] **Step 4: `message-list.tsx`**

```tsx
// apps/web/src/components/chat/message-list.tsx
import { AgentBadge } from './agent-badge.js'
import { ToolCard } from './tool-card.js'

interface MessagePart {
  type: string
  text?: string
  [key: string]: unknown
}

interface ChatMessage {
  id: string
  role: string
  parts: MessagePart[]
}

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <div key={message.id} className={message.role === 'user' ? 'text-right' : 'text-left'}>
          {message.role !== 'user' && <AgentBadge />}
          <div className="mt-1 space-y-1">
            {message.parts.map((part, index) =>
              part.type === 'text' ? (
                <p key={index} className="whitespace-pre-wrap rounded-md bg-white p-2 text-sm shadow-sm">
                  {part.text}
                </p>
              ) : part.type.startsWith('tool-') ? (
                <ToolCard key={index} part={part} />
              ) : null,
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: `chat-page.tsx`**

```tsx
// apps/web/src/pages/chat-page.tsx
import { useState, type FormEvent } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { logout } from '../lib/api-client.js'
import { useAuth } from '../lib/auth-context.js'
import { MessageList } from '../components/chat/message-list.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'

export function ChatPage() {
  const { account, refresh } = useAuth()
  const [input, setInput] = useState('')
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat', credentials: 'include' }),
  })

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!input.trim()) return
    void sendMessage({ text: input })
    setInput('')
  }

  async function handleLogout() {
    await logout()
    await refresh()
  }

  return (
    <div className="mx-auto flex h-screen max-w-2xl flex-col p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">
          Szia, {account?.salutation}!
        </h1>
        <Button variant="outline" size="sm" onClick={handleLogout}>
          Kilépés
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <MessageList messages={messages as never} />
      </div>
      <form className="mt-4 flex gap-2" onSubmit={handleSubmit}>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Írj egy kérdést a növényekről..."
          disabled={status === 'streaming'}
        />
        <Button type="submit" disabled={status === 'streaming'}>
          Küldés
        </Button>
      </form>
    </div>
  )
}
```

- [ ] **Step 6: `app.tsx` — `ChatPage` bekötése bejelentkezett állapotban**

```tsx
// apps/web/src/app.tsx
import { useState } from 'react'
import { AuthProvider, useAuth } from './lib/auth-context.js'
import { RegisterPage } from './pages/register-page.js'
import { LoginPage } from './pages/login-page.js'
import { ChatPage } from './pages/chat-page.js'

function AppContent() {
  const { account, loading } = useAuth()
  const [view, setView] = useState<'login' | 'register'>('login')

  if (loading) return <div className="p-4">Betöltés...</div>

  if (!account) {
    return view === 'login' ? (
      <LoginPage onSwitchToRegister={() => setView('register')} />
    ) : (
      <RegisterPage onSwitchToLogin={() => setView('login')} />
    )
  }

  return <ChatPage />
}

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
```

- [ ] **Step 7: Manuális böngésző-teszt — teljes golden path**

Run:
```bash
pnpm exec nx run server:serve
pnpm exec nx run web:serve
```
`http://localhost:4200`: regisztrálj → automatikusan a chat nézetbe kerülsz → tegyél fel egy katalógus-kérdést (pl. "Milyen kaktuszok vannak raktáron?") → ellenőrizd, hogy streamelve érkezik a válasz, megjelenik az agent-badge és a `runSql` tool-kártya a generált SQL-lel → "Kilépés" → visszakerülsz a login nézetre → lépj be újra ugyanazzal a fiókkal.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/pages/chat-page.tsx apps/web/src/components/chat apps/web/src/app.tsx
git commit -m "feat: add chat page with streaming responses, tool cards, and agent badge"
```

---

## Task 14: Bekötés — env, gyökér scriptek, dokumentáció

**Files:**
- Modify: `.env.example`
- Modify: `packages/db/.env.example` (csak ha szükséges — nem szükséges, ez csak `DATABASE_URL`/`OPENAI_API_KEY`-t tartalmaz, változatlan marad)
- Modify: `package.json` (gyökér — kényelmi scriptek)
- Modify: `README.md`

**Interfaces:** nincs — dokumentáció és konfiguráció-frissítés.

- [ ] **Step 1: `.env.example` bővítése**

```
# apps/server session-kezeléshez
SESSION_COOKIE_NAME="plantbase_session"
SESSION_TTL_DAYS="7"

# apps/server port
SERVER_PORT="3000"
```

- [ ] **Step 2: Gyökér `package.json` kényelmi scriptek**

```json
// package.json — a "scripts" mezőbe
"scripts": {
  "dev:server": "nx run server:serve",
  "dev:web": "nx run web:serve"
}
```

- [ ] **Step 3: `README.md` — új belépési pontok dokumentálása**

Egészítsd ki a README magyar és angol szekcióját egy-egy alfejezettel a szerver+web indításáról:

```md
## Szerver + web UI indítása (fejlesztői mód)

Két külön terminálban:

\`\`\`bash
pnpm dev:server   # Express, http://localhost:3000
pnpm dev:web      # Vite dev-szerver, http://localhost:4200
\`\`\`

A web UI a `/api` és `/debug` útvonalakat a szerverre proxyzza (`apps/web/vite.config.ts`). Regisztrálj egy fiókot, majd jelentkezz be — az agenttel a böngészőben, streamelt válaszokkal tudsz beszélgetni. A CLI (`pnpm cli ask "..."`) továbbra is külön, fiók nélkül működik.
```

- [ ] **Step 4: Teljes workspace ellenőrzés**

Run:
```bash
pnpm exec nx run-many -t lint,test,build -p core,db,server,cli
```
Expected: minden projekt minden targete hiba nélkül lefut (a `web` projektet a Step 5-6 (Task 11) már ellenőrizte lint/serve szinten).

- [ ] **Step 5: Commit**

```bash
git add .env.example package.json README.md
git commit -m "docs: document server and web dev workflow"
```

---

## Task 15: Végponttól végpontig manuális ellenőrzés (nem blokkoló automata teszt, de kötelező lépés)

**Files:** nincs kódváltozás — csak ellenőrzés.

- [ ] **Step 1: Tiszta indítás ellenőrzése**

```bash
docker compose up -d
pnpm --filter @plantbase/db exec prisma migrate deploy
pnpm --filter @plantbase/db exec prisma db seed
npx nx build core
cd packages/db && npx tsx prisma/seed-knowledge.ts && cd ../..
```
Expected: minden lépés hiba nélkül lefut (a meglévő README-lépések, változatlanul).

- [ ] **Step 2: CLI-regresszió — a migráció nem törte el a CLI-t**

```bash
pnpm exec nx run cli:build
node apps/cli/dist/main.js ask "Milyen pozsgások vannak raktáron?"
```
Expected: a CLI ugyanúgy válaszol, mint a migráció előtt (magyar nyelvű, SQL-alapú válasz).

- [ ] **Step 3: Szerver + web golden path**

```bash
pnpm exec nx run server:serve
pnpm exec nx run web:serve
```
Böngészőben (`http://localhost:4200`):
1. Regisztráció érvénytelen jelszóval (pl. `abc`) → 400-as hibaüzenet jelenik meg a formon.
2. Regisztráció érvényes adatokkal → azonnal a chat nézetbe kerülsz, a köszöntés a megadott megszólítást mutatja.
3. Kérdés a katalógusról → streamelt válasz, `runSql` tool-kártya látszik.
4. Kilépés → login nézet.
5. Belépés ugyanazzal a fiókkal, helytelen jelszóval → "Hibás e-mail vagy jelszó." üzenet.
6. Belépés helyes jelszóval → chat nézet, az előző beszélgetés NEM marad meg (nincs perzisztens chat-history ebben az al-projektben — ez explicit, nem hiba).
7. Oldal frissítése (F5) bejelentkezett állapotban → a session cookie miatt bejelentkezve maradsz.

- [ ] **Step 4: Eredmény rögzítése**

Ha bármelyik lépés hibát mutat, azt Task-onta visszakövetve javítsd (nincs külön "javítás" task — a hibát az érintett Task fájljaiban oldd meg, majd ismételd meg ezt a Task 15-öt).

Ha minden lépés sikeres, ez a Task 15 zárja az A al-projektet — nincs commit (nincs kódváltozás), de jelezd a felhasználónak, hogy az A al-projekt kész, és a `docs/extension-for-customers.md` felbontásában a B al-projekt (rendelés-alrendszer) a következő lépés.
