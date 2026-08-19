# Eszkaláció / off-topic kezelés (D al-projekt) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Az agent két új viselkedést kap: (1) off-topic kérdésekre udvarias elutasítás + irányítás afelé, miben tud segíteni (mindenhol, CLI-n is); (2) ha a Plantbase funkciójához tartozó, de az agent képességein túlmutató kérésre fut, udvariasan jelzi, hogy ügyintézőhöz továbbítja, egy `escalations` DB-sorral rögzíti, és egy szimulált e-mailt küld az ügyfélszolgálatnak — csak a bejelentkezett web-chat-en.

**Architecture:** Az off-topic viselkedés tisztán rendszerprompt-szintű, mellékhatás nélkül. Az eszkaláció a B/C-ben lefektetett DI-tool-mintát követi: `packages/core` egy `EscalationActions` interfészt + egy `escalateToStaff` tool-t exportál, amit `apps/server` a bejelentkezett fiókhoz kötve valósít meg (Prisma-írás + a C-ben létrehozott `sendSimulatedEmail` újrahasználása egy DETERMINISZTIKUS, nem-LLM-alapú tartalommal — szándékos eltérés C `composeOrderEmail`-mintájától, hogy elkerülje a második-LLM-hívásba fecskendezés kockázatát). Egy minimális staff-lista (`GET /api/staff/escalations` + `StaffEscalationsPage`) egészíti ki, a `StaffOrdersPage` mintájára, egy kis fül-váltóval a kettő között.

**Tech Stack:** Prisma, Express 5, Vercel AI SDK 7 (`tool()`), React 19, Vitest, Prettier (`semi:false`).

**Spec:** `docs/superpowers/specs/2026-08-19-escalation-handling-design.md`

## Global Constraints

- Az `escalateToStaff` tool sosem kap `account_id`-t az LLM-től — a szerver a session-ből fixálja be, ugyanúgy, mint a rendelés-tool-oknál.
- A CLI sosem kap `escalationActions`-t (csak a bejelentkezett web-chat-en érhető el) — a CLI-nek nincs bejelentkezett fiókja.
- Az off-topic viselkedés MINDENHOL érvényes (CLI + web) — az alap `SYSTEM_PROMPT` része, nem a csak-web kiegészítésé.
- Az eszkalációs e-mail tartalma szerver-oldalon, DETERMINISZTIKUSAN készül — TILOS egy második LLM-hívást bevezetni hozzá (lásd spec 2.5).
- Az `escalations` tábla csak `staff`/`admin` számára olvasható.
- Az agent olvasó-DB-szerepköre (`plantbase_ro`) NEM férhet hozzá az `escalations` táblához — Task 1 ezt EMPIRIKUSAN, élő `psql`-lel ellenőrzi, nem feltételezi.
- Prettier: `semi: false` mindenhol.
- `docs/system-prompt.md` és `packages/core/src/lib/system-prompt.ts` a megosztott XML-blokkokban byte-for-byte egyezik — minden prompt-változtatás mindkét fájlban, azonos tartalommal történik.

---

## Task 1: Prisma séma — `Escalation` modell + migráció

**Files:**

- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_add_escalations/migration.sql`

**Interfaces:**

- Produces: a Prisma `Escalation` modell (`escalations` tábla), amit Task 6 (`escalations-store.ts`) fog használni Prisma Client-en keresztül.

- [ ] **Step 1: `schema.prisma` bővítése**

Az `Account` modell (jelenleg `orders`/`orderAuditLogEntries` relációkkal záródik, `@@map("accounts")` előtt) kapjon egy új relációs mezőt:

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
  orders               Order[]
  orderAuditLogEntries OrderAuditLog[]
  escalations          Escalation[]

  @@map("accounts")
}
```

(Csak az `escalations Escalation[]` sor az új rész — a többi a jelenlegi tartalom, ellenőrizd a valódi fájlt, mielőtt módosítasz, és ehhez igazítsd, ha eltér.)

A fájl VÉGÉRE (az `OrderAuditLog` modell után) kerüljön az új modell:

```prisma
model Escalation {
  id        Int      @id @default(autoincrement())
  accountId Int      @map("account_id")
  account   Account  @relation(fields: [accountId], references: [id])
  summary   String
  createdAt DateTime @default(now()) @map("created_at")

  @@map("escalations")
}
```

- [ ] **Step 2: Migráció létrehozása**

**FONTOS, a repó dokumentált tapasztalata alapján (lásd `schema.prisma`'s runbook-kommentje és a B/C al-projektek ledger-e):** próbáld meg először a szokásos utat:

```bash
pnpm --filter @plantbase/db exec prisma migrate dev --name add_escalations --create-only
```

Ha ez a HNSW-index-checksum-drift hiba miatt elutasítja a futtatást ("The migration `...` was modified after it was applied" vagy hasonló), NE próbálj `prisma migrate reset`-et futtatni (destruktív, emberi jóváhagyást igényel) — ehelyett kézzel hozd létre a migráció-könyvtárat/fájlt pontosan abban a rétegben, amit a `--create-only` létrehozott volna (időbélyeges könyvtárnév, LF sortörés — a `.gitattributes` `packages/db/prisma/migrations/**/*.sql text eol=lf` szabálya ezt úgyis kikényszeríti), a Step 1 sémaváltozásából Prisma által generált SQL-lel egyenértékű tartalommal (`CREATE TABLE "escalations" (...)`, `ALTER TABLE "escalations" ADD CONSTRAINT ... FOREIGN KEY (...) REFERENCES "accounts"(...)`), majd alkalmazd `prisma migrate deploy`-jal.

- [ ] **Step 3: Élő ellenőrzés — `plantbase_ro` NEM férhet hozzá (empirikus, nem feltételezett)**

```bash
docker exec plantbase-postgres-1 psql -U plantbase_ro -d plantbase -c "SELECT count(*) FROM escalations;"
```

**Elvárt eredmény: `permission denied for table escalations`.** Ha ehelyett sikeres lekérdezést kapsz (pl. `count = 0`), az azt jelenti, hogy a B-ben bevezetett `ALTER DEFAULT PRIVILEGES ... REVOKE SELECT ON TABLES FROM plantbase_ro` valamiért nem érvényesül erre az új táblára — ez egy load-bearing biztonsági regresszió, NE folytasd a task többi lépését, jelentsd BLOCKED státusszal, pontos hibaüzenettel és a `\ddp`/`\dp escalations` kimenetével.

Igazold azt is, hogy a katalógus-táblák továbbra is elérhetők (nem sérült semmi a REVOKE-tól):

```bash
docker exec plantbase-postgres-1 psql -U plantbase_ro -d plantbase -c "SELECT count(*) FROM products;"
```

Elvárt: sikeres, `count = 30`.

- [ ] **Step 4: Prisma Client regenerálása + build**

```bash
pnpm --filter @plantbase/db exec prisma generate
pnpm exec nx run-many -t lint,build -p db
```

Expected: hiba nélkül.

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
git commit -m "feat: add escalations table"
```

---

## Task 2: rendszerprompt bővítés — off-topic elutasítás

**Files:**

- Modify: `packages/core/src/lib/system-prompt.ts`
- Modify: `docs/system-prompt.md`
- Modify: `packages/core/src/lib/system-prompt.spec.ts`

**Interfaces:** nincs — csak prompt-szöveg, mindenhol érvényes (CLI + web).

- [ ] **Step 1: `SYSTEM_PROMPT` bővítése**

A `packages/core/src/lib/system-prompt.ts`-ben a `SYSTEM_PROMPT` konstans jelenleg a `</behavior>` záró taggel folytatódik, majd közvetlenül a `<tools>` blokkal. Szúrj be egy ÚJ `<off_topic>` blokkot a `</behavior>` és a `<tools>` között (tehát a `<tools>` blokk marad az utolsó — ezt a `system-prompt.spec.ts` egyik meglévő tesztje, `SYSTEM_PROMPT.endsWith('</tools>')`, kifejezetten megköveteli, NE törd meg):

```
<off_topic>
Ha a felhasználó kérdése vagy üzenete nem a Plantbase funkciójához kapcsolódik (nem növény/kertészet/rendelés témájú), udvariasan jelezd, miben tudsz segíteni (növényválasztás, csomag-összeállítás, rendelés-kezelés) — ne próbálj a témán kívüli kérdésre válaszolni.
</off_topic>
```

- [ ] **Step 2: `docs/system-prompt.md` verbátim tükrözése**

Ugyanez a blokk, ugyanott (a fő `xml` blokkban, `</behavior>` és `<tools>` között) kerüljön a `docs/system-prompt.md`-be is — a fájl fő XML-blokkja szó szerint kell hogy egyezzen a `SYSTEM_PROMPT` konstanssal (ezt egy meglévő, szigorú `toBe()` teszt ellenőrzi a `system-prompt.spec.ts`-ben).

- [ ] **Step 3: `system-prompt.spec.ts` bővítése**

Adj hozzá egy új esetet a meglévő `describe('SYSTEM_PROMPT', ...)` blokkba:

```ts
it('instructs the agent to redirect off-topic questions', () => {
  expect(SYSTEM_PROMPT).toContain('<off_topic>')
  expect(SYSTEM_PROMPT).toContain('nem a Plantbase funkciójához kapcsolódik')
})
```

A meglévő `'is wrapped in the documented top-level XML sections'` teszt a `['role', 'task', 'schema', 'rules', 'behavior', 'tools']` listát ellenőrzi nyitó/záró tag-ekre — NEM kötelező hozzáadni az `off_topic`-ot ehhez a listához (a fenti új teszt önmagában lefedi), de ha hozzáadod, győződj meg róla, hogy nem töri el a listát (a sorrend nem számít ennél a tesztnél).

A meglévő verbátim-egyezés teszt (`docs` vs `SYSTEM_PROMPT`) automatikusan lefedi az új blokkot is, mivel mindkét fájlt egyszerre bővíted — nem kell külön módosítani.

- [ ] **Step 4: tesztek futtatása**

Run: `pnpm exec nx run test core`
Expected: minden zöld.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/lib/system-prompt.ts packages/core/src/lib/system-prompt.spec.ts docs/system-prompt.md
git commit -m "feat: redirect off-topic questions in the base system prompt"
```

---

## Task 3: `packages/core` — eszkaláció-tool + rendszerprompt-kiegészítés

**Files:**

- Create: `packages/core/src/lib/escalation-tools.ts`
- Test: `packages/core/src/lib/escalation-tools.spec.ts`
- Modify: `packages/core/src/lib/system-prompt.ts`
- Modify: `docs/system-prompt.md`
- Modify: `packages/core/src/lib/system-prompt.spec.ts`
- Modify: `packages/core/src/lib/stream-agent.ts`
- Modify: `packages/core/src/lib/stream-agent.spec.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**

- Produces:
  ```ts
  interface EscalationActions {
    escalate(summary: string): Promise<{ escalationId: number }>
  }
  function buildEscalationTools(actions: EscalationActions): ToolSet
  ```
  Ezt fogja Task 6 (`apps/server/src/lib/escalations-store.ts`) implementálni, és Task 7 (`chat.ts`) átadni.
- Consumes: semmit új — a `tool`/`ToolSet` az `ai`-ból, a `z` a `zod`-ból, ugyanúgy mint `order-tools.ts`-ben.

- [ ] **Step 1: `escalation-tools.ts` megírása**

```ts
import { tool, type ToolSet } from 'ai'
import { z } from 'zod'

export interface EscalationActions {
  escalate(summary: string): Promise<{ escalationId: number }>
}

const EscalateInputSchema = z.object({
  summary: z
    .string()
    .describe(
      'Rövid, tényszerű összefoglaló arról, mit kért az ügyfél és miért nem tudtál segíteni.',
    ),
})

export function buildEscalationTools(actions: EscalationActions): ToolSet {
  return {
    escalateToStaff: tool({
      description:
        'A bejelentkezett ügyfél ügyének továbbítása ügyintézőhöz, amikor a kérés a Plantbase funkciójához tartozik, de nem tudsz rá válaszolni vagy nem tudod elvégezni.',
      inputSchema: EscalateInputSchema,
      execute: async ({ summary }: { summary: string }) =>
        actions.escalate(summary),
    }),
  }
}
```

- [ ] **Step 2: teszt írása**

Az `order-tools.spec.ts` valódi, ellenőrzött mintáját követve (a `tool().execute(input, { toolCallId, messages, context: {} })` hívási alak, nem `!`-lel jelölt opcionális execute):

```ts
import {
  buildEscalationTools,
  type EscalationActions,
} from './escalation-tools.js'
import { describe, it, expect, vi } from 'vitest'

function mockActions(): EscalationActions {
  return { escalate: vi.fn() }
}

describe('buildEscalationTools', () => {
  it('escalateToStaff delegates to actions.escalate with the summary', async () => {
    const actions = mockActions()
    vi.mocked(actions.escalate).mockResolvedValue({ escalationId: 42 })
    const tools = buildEscalationTools(actions)

    const result = await tools.escalateToStaff.execute(
      { summary: 'Az ügyfél egy funkciót kér, ami nincs a katalógusban.' },
      { toolCallId: 't1', messages: [], context: {} },
    )

    expect(actions.escalate).toHaveBeenCalledWith(
      'Az ügyfél egy funkciót kér, ami nincs a katalógusban.',
    )
    expect(result).toEqual({ escalationId: 42 })
  })
})
```

- [ ] **Step 3: `ESCALATION_PROMPT_ADDITION` hozzáadása a `system-prompt.ts`-hez**

A `packages/core/src/lib/system-prompt.ts`-ben, az `ORDER_PROMPT_ADDITION` konstans UTÁN (a `buildSystemPrompt` függvény ELŐTT), egy új konstans:

```ts
export const ESCALATION_PROMPT_ADDITION = `<escalation_behavior>
- Ha a felhasználó kérése a Plantbase funkciójához kapcsolódik, de nem tudsz rá válaszolni vagy nem tudod elvégezni (nincs hozzá tool-od, a kérés a képességeiden túlmutat, vagy kifejezetten emberi ügyintézőt kér), udvariasan közöld, hogy továbbítod az ügyet egy ügyintézőhöz, majd hívd az escalateToStaff tool-t egy rövid, tényszerű összefoglalóval.
- Ne hívd az escalateToStaff-ot off-topic kérdésekre — csak akkor, ha a kérés a Plantbase funkciójához tartozna, de te nem tudtad megoldani.
</escalation_behavior>

<escalation_tools>
- escalateToStaff(summary): a bejelentkezett ügyfél ügyének továbbítása ügyintézőhöz — rövid, tényszerű összefoglalót adj át arról, mit kért az ügyfél és miért nem tudtál segíteni.
</escalation_tools>`
```

- [ ] **Step 4: `buildSystemPrompt` bővítése**

A jelenlegi `buildSystemPrompt`:

```ts
export function buildSystemPrompt(
  salutation?: string,
  includeOrderCapability = false,
): string {
  let prompt = SYSTEM_PROMPT
  if (includeOrderCapability) {
    prompt = `${prompt}\n\n${ORDER_PROMPT_ADDITION}`
  }
  if (!salutation) return prompt
  return `${prompt}\n\n<user>\nA felhasználót így szólítsd, amikor ez természetes és a beszélgetés indokolja: ${salutation}.\n</user>`
}
```

Módosítsd, hogy egy ÚJ, független paramétert is elfogadjon (`includeEscalationCapability`), és ha igaz, fűzze hozzá az `ESCALATION_PROMPT_ADDITION`-t is:

```ts
export function buildSystemPrompt(
  salutation?: string,
  includeOrderCapability = false,
  includeEscalationCapability = false,
): string {
  let prompt = SYSTEM_PROMPT
  if (includeOrderCapability) {
    prompt = `${prompt}\n\n${ORDER_PROMPT_ADDITION}`
  }
  if (includeEscalationCapability) {
    prompt = `${prompt}\n\n${ESCALATION_PROMPT_ADDITION}`
  }
  if (!salutation) return prompt
  return `${prompt}\n\n<user>\nA felhasználót így szólítsd, amikor ez természetes és a beszélgetés indokolja: ${salutation}.\n</user>`
}
```

- [ ] **Step 5: `docs/system-prompt.md` bővítése — új szekció**

A meglévő "## Rendelés-képesség kiegészítés" szekció UTÁN, a fájl végén, egy új szekció, pontosan ugyanabban a stílusban:

- Egy `## Eszkaláció-képesség kiegészítés (opcionális — csak a streamelő, bejelentkezett web-útvonalon)` cím.
- Egy bekezdés: "Ezt a blokkot a `streamAgentResponse` FŰZI HOZZÁ a fenti alap system prompthoz, amikor `escalationActions` meg van adva (tehát SOSEM a CLI-n). Verbátim átvétel a `packages/core/src/lib/system-prompt.ts` `ESCALATION_PROMPT_ADDITION` konstansába."
- Egy ```xml fenced code block, aminek a TARTALMA — belülről, tag-től tag-ig — KARAKTERRŐL KARAKTERRE megegyezik a Step 3-ban fentebb már megadott `ESCALATION_PROMPT_ADDITION` konstans template-literal-jának tartalmával (a backtick karakterek közötti rész, azok nélkül). NE hagyj üres sort a nyitó tag és az első `-` felsorolás-elem között, NE indentáld a záró tag-eket — a Step 3-ban megadott `ESCALATION_PROMPT_ADDITION` string pontosan úgy néz ki, ahogy ott van, semmilyen extra sortörés vagy behúzás nélkül. Ha a szerkesztőd/formázód automatikusan üres sorokat vagy behúzást szúrna be ebbe a code block-ba mentéskor (ez egy ismert kockázat — a markdown-formázók néha "megjavítják" a nested code-block tartalmat, mintha rendes markdown-lista lenne), MENTÉS UTÁN ellenőrizd a fájlt, és ha eltért, javítsd vissza kézzel, majd a Step 6-ban erre írt teszttel (`toBe(...)`) igazold vissza, hogy tényleg egyezik.

**A `ESCALATION_PROMPT_ADDITION` konstansnak és ennek a szekciónak az XML-tartalma byte-for-byte egyeznie kell** — mint az `ORDER_PROMPT_ADDITION` esetében. Ezt a Step 6-ban írt automatikus teszt ellenőrzi (ellentétben a `SYSTEM_PROMPT`/`ORDER_PROMPT_ADDITION` meglévő verbátim tesztjeivel, amik NEM fedik le az `ESCALATION_PROMPT_ADDITION`-t — ez egy már ismert, a C al-projekt idejéből dokumentált, ki nem javított rés a MEGLÉVŐ blokkokra, de a Step 6 teszt kifejezetten az ÚJ blokkra készül, tehát ARRA lesz automatikus fedezet).

- [ ] **Step 6: `system-prompt.spec.ts` bővítése**

Importáld be az `ESCALATION_PROMPT_ADDITION`-t is, és adj hozzá egy új, önálló `describe`-ot:

````ts
describe('ESCALATION_PROMPT_ADDITION', () => {
  it('instructs the agent to escalate unsolvable in-scope requests', () => {
    expect(ESCALATION_PROMPT_ADDITION).toContain('escalateToStaff')
    expect(ESCALATION_PROMPT_ADDITION).toContain('ügyintézőhöz')
  })

  it('is a verbatim copy of the corresponding ```xml block in docs/system-prompt.md', () => {
    const docs = readFileSync(DOCS_PATH, 'utf-8')
    const match = docs.match(
      /## Eszkaláció-képesség kiegészítés[\s\S]*?```xml\n([\s\S]*?)```/,
    )
    if (!match) {
      throw new Error(
        'No escalation ```xml block found under the "Eszkaláció-képesség kiegészítés" heading in docs/system-prompt.md',
      )
    }
    expect(ESCALATION_PROMPT_ADDITION).toBe(match[1].replace(/\n$/, ''))
  })
})
````

(`DOCS_PATH` már definiálva van a fájl tetején a meglévő verbátim teszthez — használd ugyanazt a konstanst.)

- [ ] **Step 7: `stream-agent.ts` bővítése**

A jelenlegi:

```ts
export interface StreamAgentOptions {
  salutation?: string
  orderActions?: OrderActions
}
```

```ts
export function streamAgentResponse(
  messages: ModelMessage[],
  options: StreamAgentOptions = {},
) {
  const trace: StreamAgentTrace = { generatedSql: [], retrieval: [] }
  const tools = {
    ...buildAgentTools(trace),
    ...(options.orderActions ? buildOrderTools(options.orderActions) : {}),
  }
  const stream = streamText({
    model: anthropic(AGENT_MODEL),
    system: buildSystemPrompt(
      options.salutation,
      Boolean(options.orderActions),
    ),
    messages,
    stopWhen: stepCountIs(MAX_TOOL_ROUNDS),
    tools,
  })
  return { stream, trace }
}
```

Módosítsd a teljes fájlt így:

```ts
import { anthropic } from '@ai-sdk/anthropic'
import { streamText, stepCountIs, type ModelMessage } from 'ai'
import { AGENT_MODEL, MAX_TOOL_ROUNDS, buildAgentTools } from './agent-tools.js'
import { buildOrderTools, type OrderActions } from './order-tools.js'
import {
  buildEscalationTools,
  type EscalationActions,
} from './escalation-tools.js'
import { buildSystemPrompt } from './system-prompt.js'
import type { RetrievalTrace } from './logger.js'

export interface StreamAgentOptions {
  salutation?: string
  orderActions?: OrderActions
  escalationActions?: EscalationActions
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
  const tools = {
    ...buildAgentTools(trace),
    ...(options.orderActions ? buildOrderTools(options.orderActions) : {}),
    ...(options.escalationActions
      ? buildEscalationTools(options.escalationActions)
      : {}),
  }
  const stream = streamText({
    model: anthropic(AGENT_MODEL),
    system: buildSystemPrompt(
      options.salutation,
      Boolean(options.orderActions),
      Boolean(options.escalationActions),
    ),
    messages,
    stopWhen: stepCountIs(MAX_TOOL_ROUNDS),
    tools,
  })
  return { stream, trace }
}
```

- [ ] **Step 8: `stream-agent.spec.ts` bővítése**

A meglévő `orderActions`-t tesztelő esetek mintájára (`'does not include order tools when orderActions is not provided'`, `'includes order tools when orderActions is provided'`), adj hozzá analóg teszteket `escalationActions`-re:

```ts
it('does not include escalation tools when escalationActions is not provided', () => {
  streamAgentResponse([{ role: 'user' as const, content: 'Szia' }])
  const call = vi.mocked(streamText).mock.calls[0][0]
  expect(call.tools).not.toHaveProperty('escalateToStaff')
})

it('includes escalation tools when escalationActions is provided', () => {
  streamAgentResponse([{ role: 'user' as const, content: 'Szia' }], {
    escalationActions: { escalate: vi.fn() },
  })
  const call = vi.mocked(streamText).mock.calls[0][0]
  expect(call.tools).toHaveProperty('escalateToStaff')
})

it('mentions escalateToStaff in the system prompt only when escalationActions is provided', () => {
  streamAgentResponse([{ role: 'user' as const, content: 'Szia' }])
  const without = vi.mocked(streamText).mock.calls[0][0]
  expect(without.system).not.toContain('escalateToStaff')

  vi.clearAllMocks()
  streamAgentResponse([{ role: 'user' as const, content: 'Szia' }], {
    escalationActions: { escalate: vi.fn() },
  })
  const withEsc = vi.mocked(streamText).mock.calls[0][0]
  expect(withEsc.system).toContain('escalateToStaff')
})
```

- [ ] **Step 9: `packages/core/src/index.ts` bővítése**

Add hozzá: `export * from './lib/escalation-tools.js'`

- [ ] **Step 10: tesztek + build futtatása**

Run: `pnpm exec nx run-many -t lint,test,build -p core`
Expected: minden zöld.

- [ ] **Step 11: Commit**

```bash
git add packages/core/src/lib/escalation-tools.ts packages/core/src/lib/escalation-tools.spec.ts packages/core/src/lib/system-prompt.ts packages/core/src/lib/system-prompt.spec.ts packages/core/src/lib/stream-agent.ts packages/core/src/lib/stream-agent.spec.ts packages/core/src/index.ts docs/system-prompt.md
git commit -m "feat: add escalation tool and wire it into the streaming agent"
```

---

## Task 4: `apps/server` — determinisztikus eszkalációs e-mail

**Files:**

- Create: `apps/server/src/lib/escalation-emails.ts`
- Test: `apps/server/src/lib/escalation-emails.spec.ts`

**Interfaces:**

- Consumes: `sendSimulatedEmail` (`@plantbase/core`, a C al-projektből, már létezik); `prisma` (`@plantbase/db`-ből).
- Produces:
  ```ts
  function notifyEscalation(
    escalationId: number,
    accountId: number,
    summary: string,
  ): void
  ```
  Ezt fogja Task 6 (`escalations-store.ts`) importálni és hívni.

**FONTOS (Global Constraint, lásd spec 2.5):** ez a függvény NEM hív LLM-et. A tárgy/törzs szerver-oldalon, fix sablonnal készül — ne vezess be egy `composeEscalationEmail`-szerű, `generateObject`-et hívó lépést, ez szándékos architektúrai döntés, nem hiányzó funkció.

- [ ] **Step 1: `escalation-emails.ts` megírása**

```ts
import { prisma } from '@plantbase/db'
import { sendSimulatedEmail } from '@plantbase/core'

const STAFF_EMAIL_ADDRESS = 'ugyfelszolgalat@plantbase.hu'
const STAFF_RECIPIENT_LABEL = 'ügyfélszolgálat'

/**
 * Fire-and-forget: sosem dob, sosem várja meg a hívó. Minden hiba (fiók-
 * lookup, fájlrendszer) csak logolódik -- az eszkaláció-létrehozást ez nem
 * befolyásolhatja. A tartalom SZÁNDÉKOSAN determinisztikus (nincs LLM-hívás)
 * -- lásd a fájl szintjén a modult importáló task leírását.
 */
export function notifyEscalation(
  escalationId: number,
  accountId: number,
  summary: string,
): void {
  void (async () => {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    })
    if (!account) return

    const subject = `Eszkaláció #${escalationId} — ${account.fullName}`
    const body = `Ügyfél: ${account.fullName} (${account.email})
Megszólítás: ${account.salutation}
Eszkaláció-azonosító: #${escalationId}

Az agent összefoglalója (nem ellenőrzött, az agent saját megfogalmazása az ügyfél kérése alapján):
${summary}`

    await sendSimulatedEmail({
      recipientLabel: STAFF_RECIPIENT_LABEL,
      recipientAddress: STAFF_EMAIL_ADDRESS,
      subject,
      body,
    })
  })().catch((err: unknown) => {
    console.error('Eszkalációs e-mail küldése sikertelen:', err)
  })
}
```

- [ ] **Step 2: teszt írása**

Az `order-emails.spec.ts` mintáját követve (Prisma mockolva, `@plantbase/core` mockolva, egy `flushMicrotasks` segédfüggvénnyel a fire-and-forget lánc kivárásához):

```ts
import { prisma } from '@plantbase/db'
import { sendSimulatedEmail } from '@plantbase/core'
import { notifyEscalation } from './escalation-emails.js'

vi.mock('@plantbase/db', () => ({
  prisma: { account: { findUnique: vi.fn() } },
}))
vi.mock('@plantbase/core', () => ({
  sendSimulatedEmail: vi.fn(),
}))

const account = {
  id: 5,
  fullName: 'Kovács Béla',
  salutation: 'Uram',
  email: 'bela@example.com',
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}

describe('notifyEscalation', () => {
  beforeEach(() => vi.clearAllMocks())

  it('looks up the account and sends a deterministic email, no LLM call', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(account as never)
    vi.mocked(sendSimulatedEmail).mockResolvedValue({ filePath: '/x' })

    notifyEscalation(
      42,
      5,
      'Az ügyfél egy funkciót kér, ami nincs a katalógusban.',
    )
    await flushMicrotasks()

    expect(prisma.account.findUnique).toHaveBeenCalledWith({
      where: { id: 5 },
    })
    expect(sendSimulatedEmail).toHaveBeenCalledWith({
      recipientLabel: 'ügyfélszolgálat',
      recipientAddress: 'ugyfelszolgalat@plantbase.hu',
      subject: expect.stringContaining('#42'),
      body: expect.stringContaining(
        'Az ügyfél egy funkciót kér, ami nincs a katalógusban.',
      ),
    })
  })

  it('email body includes the account contact info and the escalation id', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(account as never)
    vi.mocked(sendSimulatedEmail).mockResolvedValue({ filePath: '/x' })

    notifyEscalation(42, 5, 'Összefoglaló.')
    await flushMicrotasks()

    const call = vi.mocked(sendSimulatedEmail).mock.calls[0][0]
    expect(call.body).toContain('Kovács Béla')
    expect(call.body).toContain('bela@example.com')
    expect(call.body).toContain('#42')
  })

  it('does nothing if the account is not found', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(null)

    notifyEscalation(42, 999, 'Összefoglaló.')
    await flushMicrotasks()

    expect(sendSimulatedEmail).not.toHaveBeenCalled()
  })

  it('never throws back to the caller when sendSimulatedEmail rejects', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(account as never)
    vi.mocked(sendSimulatedEmail).mockRejectedValue(new Error('disk full'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => notifyEscalation(42, 5, 'Összefoglaló.')).not.toThrow()
    await flushMicrotasks()

    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })
})
```

- [ ] **Step 3: tesztek + build futtatása**

Run: `pnpm exec nx run-many -t lint,test,build -p server`
Expected: minden zöld.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/lib/escalation-emails.ts apps/server/src/lib/escalation-emails.spec.ts
git commit -m "feat: add deterministic escalation notification email"
```

---

## Task 5: `apps/server` — `escalations-store.ts`

**Files:**

- Create: `apps/server/src/lib/escalations-store.ts`
- Test: `apps/server/src/lib/escalations-store.spec.ts`

**Interfaces:**

- Consumes: `notifyEscalation` (`./escalation-emails.js`, Task 4); `EscalationActions` (`@plantbase/core`, Task 3); `prisma` (`@plantbase/db`).
- Produces:

  ```ts
  function buildEscalationActionsForAccount(
    accountId: number,
  ): EscalationActions
  interface EscalationDetail {
    id: number
    accountId: number
    accountName: string
    summary: string
    createdAt: string
  }
  function listEscalationsForStaff(): Promise<EscalationDetail[]>
  ```

  Ezt fogja Task 6 (`chat.ts` + `staff-escalations.ts` route) importálni.

- [ ] **Step 1: `escalations-store.ts` megírása**

```ts
import { prisma } from '@plantbase/db'
import type { EscalationActions } from '@plantbase/core'

export interface EscalationDetail {
  id: number
  accountId: number
  accountName: string
  summary: string
  createdAt: string
}

export function buildEscalationActionsForAccount(
  accountId: number,
): EscalationActions {
  return {
    async escalate(summary: string) {
      const created = await prisma.escalation.create({
        data: { accountId, summary },
      })
      notifyEscalation(created.id, accountId, summary)
      return { escalationId: created.id }
    },
  }
}

export async function listEscalationsForStaff(): Promise<EscalationDetail[]> {
  const escalations = await prisma.escalation.findMany({
    include: { account: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return escalations.map((e) => ({
    id: e.id,
    accountId: e.accountId,
    accountName: e.account.fullName,
    summary: e.summary,
    createdAt: e.createdAt.toISOString(),
  }))
}
```

Hiányzik egy import: `notifyEscalation`. Add hozzá a fájl tetejére:

```ts
import { notifyEscalation } from './escalation-emails.js'
```

- [ ] **Step 2: teszt írása**

Az `orders-store.spec.ts` Prisma-mock mintáját követve (`vi.mock('@plantbase/db', ...)`), mockold a `./escalation-emails.js`-t is:

```ts
vi.mock('./escalation-emails.js', () => ({ notifyEscalation: vi.fn() }))
```

Tesztek:

- `buildEscalationActionsForAccount(accountId).escalate(summary)` — meghívja `prisma.escalation.create`-et `{data: {accountId, summary}}`-vel, meghívja `notifyEscalation`-t a létrehozott `id`-vel/`accountId`-vel/`summary`-vel, és visszaadja `{escalationId: <id>}`-t.
- `listEscalationsForStaff()` — meghívja `prisma.escalation.findMany`-t `include: {account: true}`, `orderBy: {createdAt: 'desc'}`, `take: 100` opciókkal, és a visszaadott sorokat helyesen alakítja `EscalationDetail[]`-lé (`accountName` az `account.fullName`-ből, `createdAt` ISO-stringgé alakítva).

Nézd meg a valódi `orders-store.spec.ts`-t a pontos mock-adatszerkezet (`vi.mocked(prisma.escalation.create).mockResolvedValue(...)` stílus) mintájáért, és ahhoz igazodj.

- [ ] **Step 3: tesztek + build futtatása**

Run: `pnpm exec nx run-many -t lint,test,build -p server`
Expected: minden zöld.

- [ ] **Step 4: Commit**

```bash
git add apps/server/src/lib/escalations-store.ts apps/server/src/lib/escalations-store.spec.ts
git commit -m "feat: add escalations store with account-scoped creation and audit listing"
```

---

## Task 6: `apps/server` — staff-végpont + `chat.ts` bekötés

**Files:**

- Create: `apps/server/src/routes/staff-escalations.ts`
- Test: `apps/server/src/routes/staff-escalations.spec.ts`
- Modify: `apps/server/src/routes/chat.ts`
- Modify: `apps/server/src/app.ts`

**Interfaces:**

- Consumes: `listEscalationsForStaff`, `buildEscalationActionsForAccount` (`../lib/escalations-store.js`, Task 5); `requireAccount`, `requireRole` (meglévő middleware-ek).

- [ ] **Step 1: `staff-escalations.ts` route megírása**

```ts
import { Router } from 'express'
import { requireAccount } from '../middleware/session.js'
import { requireRole } from '../middleware/role.js'
import { listEscalationsForStaff } from '../lib/escalations-store.js'

export const staffEscalationsRouter: Router = Router()

staffEscalationsRouter.get(
  '/api/staff/escalations',
  requireAccount,
  requireRole('staff', 'admin'),
  async (_req, res) => {
    const escalations = await listEscalationsForStaff()
    res.status(200).json({ escalations })
  },
)
```

- [ ] **Step 2: teszt írása**

A `staff-orders.spec.ts` supertest-mintáját követve, ellenőrizd:

- 401, ha nincs bejelentkezve.
- 403, ha `customer` szerepkörű a bejelentkezett fiók.
- 200 + a helyes JSON-alak, ha `staff` vagy `admin`.

Mockold a `../lib/escalations-store.js`-t (`listEscalationsForStaff: vi.fn()`), és a session/auth-mockolást a `staff-orders.spec.ts`-ből vedd át pontosan.

- [ ] **Step 3: `chat.ts` bővítése**

A jelenlegi `chat.ts`:

```ts
import { Router } from 'express'
import { z } from 'zod'
import { streamAgentResponse } from '@plantbase/core'
import { convertToModelMessages, type UIMessage } from 'ai'
import { requireAccount } from '../middleware/session.js'
import { buildOrderActionsForAccount } from '../lib/orders-store.js'

const ChatRequestSchema = z.object({
  messages: z.array(z.unknown()),
})

export const chatRouter: Router = Router()

chatRouter.post('/api/chat', requireAccount, async (req, res, next) => {
  const parsed = ChatRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Érvénytelen kérés.' })
    return
  }

  const uiMessages = parsed.data.messages as UIMessage[]
  const modelMessages = await convertToModelMessages(uiMessages)
  const { stream } = streamAgentResponse(modelMessages, {
    salutation: req.account?.salutation,
    orderActions: req.account
      ? buildOrderActionsForAccount(req.account.id)
      : undefined,
  })
  void stream.pipeUIMessageStreamToResponse(res).catch(next)
})
```

Módosítsd: adj hozzá egy `buildEscalationActionsForAccount` importot, és egy `escalationActions` mezőt a `streamAgentResponse`-nak átadott objektumhoz, pontosan az `orderActions` mintájára:

```ts
import { Router } from 'express'
import { z } from 'zod'
import { streamAgentResponse } from '@plantbase/core'
import { convertToModelMessages, type UIMessage } from 'ai'
import { requireAccount } from '../middleware/session.js'
import { buildOrderActionsForAccount } from '../lib/orders-store.js'
import { buildEscalationActionsForAccount } from '../lib/escalations-store.js'

const ChatRequestSchema = z.object({
  messages: z.array(z.unknown()),
})

export const chatRouter: Router = Router()

chatRouter.post('/api/chat', requireAccount, async (req, res, next) => {
  const parsed = ChatRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Érvénytelen kérés.' })
    return
  }

  const uiMessages = parsed.data.messages as UIMessage[]
  const modelMessages = await convertToModelMessages(uiMessages)
  const { stream } = streamAgentResponse(modelMessages, {
    salutation: req.account?.salutation,
    orderActions: req.account
      ? buildOrderActionsForAccount(req.account.id)
      : undefined,
    escalationActions: req.account
      ? buildEscalationActionsForAccount(req.account.id)
      : undefined,
  })
  void stream.pipeUIMessageStreamToResponse(res).catch(next)
})
```

`chat.spec.ts` (ha mockolja a `../lib/orders-store.js`-t) valószínűleg a `../lib/escalations-store.js`-t is mockolnia kell majd hasonlóan — ellenőrizd a valódi fájlt, és ha a meglévő tesztek emiatt elhasalnak (mert az új import valódi modult próbál betölteni mock nélkül), egészítsd ki a mock-listát. Ez NEM új teszt-eset, csak a meglévők zöldön-tartása.

- [ ] **Step 4: `app.ts` bővítése**

A jelenlegi router-regisztráció (`authRouter`, `chatRouter`, `debugRouter`, `staffOrdersRouter`, majd `errorHandler`) kapjon egy új sort a `staffOrdersRouter` UTÁN, az `errorHandler` ELŐTT:

```ts
import { staffEscalationsRouter } from './routes/staff-escalations.js'
```

és az `app.use(staffOrdersRouter)` sor UTÁN:

```ts
app.use(staffEscalationsRouter)
```

- [ ] **Step 5: tesztek + build futtatása**

Run: `pnpm exec nx run-many -t lint,test,build -p server`
Expected: minden zöld.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/staff-escalations.ts apps/server/src/routes/staff-escalations.spec.ts apps/server/src/routes/chat.ts apps/server/src/app.ts
git commit -m "feat: add staff escalations endpoint and wire escalation tool into chat"
```

---

## Task 7: `apps/web` — staff-eszkaláció lista

**Files:**

- Create: `apps/web/src/lib/escalations-api-client.ts`
- Create: `apps/web/src/pages/staff-escalations-page.tsx`

**Interfaces:**

- Consumes: `GET /api/staff/escalations` (Task 6).
- Produces: `StaffEscalationsPage` React komponens, amit Task 8 (`app.tsx`) fog importálni.

- [ ] **Step 1: `escalations-api-client.ts` megírása**

```ts
export interface StaffEscalation {
  id: number
  accountId: number
  accountName: string
  summary: string
  createdAt: string
}

async function parseJsonOrThrow(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message =
      (body as { error?: string }).error ?? 'Ismeretlen hiba történt.'
    throw new Error(message)
  }
  return body
}

export async function listStaffEscalations(): Promise<StaffEscalation[]> {
  const response = await fetch('/api/staff/escalations', {
    credentials: 'include',
  })
  const body = (await parseJsonOrThrow(response)) as {
    escalations: StaffEscalation[]
  }
  return body.escalations
}
```

- [ ] **Step 2: `staff-escalations-page.tsx` megírása**

A `staff-orders-page.tsx` szerkezetét/stílusát követve (ugyanazok az UI-primitívek: `Button`, `Card`/`CardContent`/`CardHeader`), de EGYSZERŰBB — nincs szűrő, nincs részlet-nézet (csak lista, create-only adat):

```tsx
import { useEffect, useState } from 'react'
import {
  listStaffEscalations,
  type StaffEscalation,
} from '../lib/escalations-api-client.js'
import { logout } from '../lib/api-client.js'
import { useAuth } from '../lib/auth-context.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent, CardHeader } from '../components/ui/card.js'

export function StaffEscalationsPage() {
  const { account, refresh } = useAuth()
  const [escalations, setEscalations] = useState<StaffEscalation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        setEscalations(await listStaffEscalations())
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Ismeretlen hiba történt.',
        )
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  async function handleLogout() {
    await logout()
    await refresh()
  }

  return (
    <div className="mx-auto max-w-4xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">
          Eszkalációk ({account?.salutation})
        </h1>
        <Button variant="outline" size="sm" onClick={handleLogout}>
          Kilépés
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p>Betöltés...</p>
      ) : (
        <Card>
          <CardHeader>
            <span className="text-sm text-gray-500">
              {escalations.length} eszkaláció
            </span>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="pb-2">#</th>
                  <th className="pb-2">Ügyfél</th>
                  <th className="pb-2">Összefoglaló</th>
                  <th className="pb-2">Időpont</th>
                </tr>
              </thead>
              <tbody>
                {escalations.map((esc) => (
                  <tr key={esc.id} className="border-t border-gray-100">
                    <td className="py-2">{esc.id}</td>
                    <td className="py-2">{esc.accountName}</td>
                    <td className="py-2">{esc.summary}</td>
                    <td className="py-2">
                      {new Date(esc.createdAt).toLocaleString('hu-HU')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 3: lint + build futtatása**

Run: `pnpm exec nx run-many -t lint,build -p web`
Expected: hiba nélkül. (Nincs automatizált teszt ehhez a fájlpárhoz — a repo precedense szerint, lásd B/C ledger, a staff-webfelület manuális ellenőrzéssel záródik, az utolsó tasknál.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/escalations-api-client.ts apps/web/src/pages/staff-escalations-page.tsx
git commit -m "feat: add staff escalations list page"
```

---

## Task 8: `apps/web` — navigáció staff Rendelések/Eszkalációk között

**Files:**

- Modify: `apps/web/src/app.tsx`

**Interfaces:**

- Consumes: `StaffOrdersPage` (meglévő), `StaffEscalationsPage` (Task 7).

**FONTOS:** ez az egyetlen task, ami `app.tsx`-et módosítja ebben a tervben — nincs más task, amivel ütközhetne.

- [ ] **Step 1: `app.tsx` bővítése**

A jelenlegi:

```tsx
import { useState } from 'react'
import { AuthProvider, useAuth } from './lib/auth-context.js'
import { RegisterPage } from './pages/register-page.js'
import { LoginPage } from './pages/login-page.js'
import { ChatPage } from './pages/chat-page.js'
import { StaffOrdersPage } from './pages/staff-orders-page.js'

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

  if (account.role === 'staff' || account.role === 'admin') {
    return <StaffOrdersPage />
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

Módosítsd úgy, hogy a staff-ág egy kis fül-váltóval válasszon a két staff-oldal között:

```tsx
import { useState } from 'react'
import { AuthProvider, useAuth } from './lib/auth-context.js'
import { RegisterPage } from './pages/register-page.js'
import { LoginPage } from './pages/login-page.js'
import { ChatPage } from './pages/chat-page.js'
import { StaffOrdersPage } from './pages/staff-orders-page.js'
import { StaffEscalationsPage } from './pages/staff-escalations-page.js'
import { Button } from './components/ui/button.js'

function StaffArea() {
  const [tab, setTab] = useState<'orders' | 'escalations'>('orders')

  return (
    <div>
      <div className="mx-auto flex max-w-4xl gap-2 px-4 pt-4">
        <Button
          variant={tab === 'orders' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('orders')}
        >
          Rendelések
        </Button>
        <Button
          variant={tab === 'escalations' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('escalations')}
        >
          Eszkalációk
        </Button>
      </div>
      {tab === 'orders' ? <StaffOrdersPage /> : <StaffEscalationsPage />}
    </div>
  )
}

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

  if (account.role === 'staff' || account.role === 'admin') {
    return <StaffArea />
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

(Az import-útvonal `./components/ui/button.js` már ellenőrzött és helyes: `app.tsx` az `apps/web/src/` gyökerén van, a `Button` komponens pedig `apps/web/src/components/ui/button.tsx`-ben — ugyanaz a relatív mélység, mint fentebb írva.)

- [ ] **Step 2: lint + build futtatása**

Run: `pnpm exec nx run-many -t lint,build -p web`
Expected: hiba nélkül.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app.tsx
git commit -m "feat: add staff tab switcher between orders and escalations"
```

---

## Task 9: teljes workspace ellenőrzés + manuális E2E

**Files:** nincs kódváltozás — csak ellenőrzés (B/C Task 13/6 mintájára).

- [ ] **Step 1: Teljes workspace build/lint/teszt**

```bash
pnpm exec nx run-many -t lint,test,build -p core,db,server,web,cli
```

Expected: minden zöld, KIVÉVE a már ismert, korábbi al-projektek előtt is meglévő hibák (a `docs/superpowers/plans/2026-08-18-order-subsystem.md` és `2026-08-19-email-simulation.md` ledger-eiben dokumentáltak — ezek nem ehhez a munkához tartoznak, ne javítsd őket).

- [ ] **Step 2: Manuális E2E — off-topic elutasítás**

```bash
pnpm exec nx run cli:build
node apps/cli/dist/main.js ask "Milyen az időjárás holnap?"
```

Ellenőrizd, hogy az agent udvariasan jelzi, miben tud segíteni, NEM próbál választ adni az időjárásra. Próbáld ki ugyanezt a web-chaten keresztül is (bejelentkezett `customer` fiókkal), ugyanazt az eredményt várva.

- [ ] **Step 3: Manuális E2E — eszkaláció**

```bash
pnpm exec nx run server:serve
pnpm exec nx run web:serve
```

Bejelentkezett `customer` fiókkal, a chaten keresztül kérj valami olyat, amire az agentnek nincs eszköze (pl. "szeretnék beszélni valakivel telefonon" vagy "módosítsd a fiókom jelszavát most azonnal, ne kérdezz vissza"). Ellenőrizd:

- Az agent válasza udvariasan jelzi, hogy ügyintézőhöz továbbítja az ügyet.
- Adatbázisban új `escalations` sor jött létre (`pnpm --filter @plantbase/db exec tsx -e "..."`, importálva `prisma`-t `./src/lib/client.js`-ből).
- Az `emails/` könyvtárban rövid időn belül megjelenik egy `email_ugyfelszolgalat_<dátum>_<idő>.md` fájl, aminek tartalma tartalmazza az ügyfél nevét/e-mail-jét és az agent összefoglalóját.

- [ ] **Step 4: Manuális E2E — staff-lista**

Jelentkezz be `staff@plantbase.hu` / `Staff1234`-gyel. Ellenőrizd, hogy látod a "Rendelések"/"Eszkalációk" fül-váltót, és az "Eszkalációk" fülre kattintva megjelenik a Step 3-ban létrehozott eszkaláció a listában, a helyes ügyfél-névvel és összefoglalóval.

- [ ] **Step 5: Manuális E2E — CLI-regresszió (nincs eszkaláció-képesség)**

```bash
node apps/cli/dist/main.js ask "Szeretnék beszélni egy ügyintézővel telefonon."
```

Ellenőrizd, hogy az agent NEM hív `escalateToStaff`-ot (nincs a CLI tool-készletében — ellenőrizd `packages/core/src/lib/agent-tools.ts`-ben, hogy nincs escalation-eszköz), és nem jön létre új `escalations` DB-sor vagy `.md` fájl ennek hatására (ellenőrizd a sor-számot előtte/utána, ahogy a korábbi al-projektek CLI-regressziós ellenőrzései tették).

- [ ] **Step 6: Eredmény rögzítése**

Ha bármelyik lépés hibát mutat, a hibát az érintett Task fájljaiban oldd meg, majd ismételd meg ezt a Task 9-et.

Ha minden lépés sikeres, ez a Task 9 zárja a D al-projektet — nincs commit (nincs kódváltozás), de jelezd a felhasználónak, hogy a D al-projekt kész, és a `docs/extension-for-customers.md` felbontásában az E (metrikák) és F (adatvédelem) al-projektek a következő lépések.
