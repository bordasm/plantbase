# E-mail-szimuláció (C al-projekt) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendelés-létrehozáskor és -státuszváltáskor (ha az ügyfél kért e-mail-értesítést) az agent LLM-mel összeállított, udvarias magyar e-mailt "küld" — valójában egy `.md` fájlt ír az `/emails` könyvtárba, a doksi névkonvenciója szerint.

**Architecture:** `packages/core` kap egy `lib/email/` modult (fájlnév-generálás + `.md`-írás, LLM-alapú tartalom-összeállítás determinisztikus sablon-fallback-kel) — mindkettő `fs`/LLM-hozzáférés, nem DB, tehát nem sérti a "`packages/core` sosem függ `packages/db`-től" szabályt. `apps/server`-ben egy vékony `order-emails.ts` wrapper köti össze a fiók-lookupot (Prisma) a `packages/core` funkciókkal, és az `orders-store.ts` három érintett függvénye (create/cancel/updateStatus) a tranzakció commit-ja UTÁN, fire-and-forget módon hívja meg — a rendelés-művelet válasza sosem várja meg az e-mailt, és egy e-mail-hiba sosem buktatja el a rendelés-műveletet.

**Tech Stack:** Vercel AI SDK 7 (`generateObject` + Zod-séma a strukturált `{subject, body}` kimenethez, ugyanaz az `anthropic(AGENT_MODEL)` modell, amit a chat-agent is használ), Node `node:fs/promises` + `node:path` + `node:url`, Vitest, Prettier (`semi:false`).

**Spec:** `docs/superpowers/specs/2026-08-19-email-simulation-design.md`

## Global Constraints

- `packages/core` sosem függhet `packages/db`-től (lint által kikényszerítve) — az e-mail-modul kizárólag plain adatot kap paraméterként, sosem Prisma-objektumot közvetlenül.
- Prettier: `semi: false` (nincs pontosvessző) mindenhol.
- Az e-mail-küldés (LLM-hívás + fájlírás) SOSEM blokkolja és SOSEM buktatja el a rendelés-műveletet (fire-and-forget, minden hiba csak logolódik).
- Triggerelési feltételek pontosan (lásd spec 2.4):
  - `createOrder`: ha `input.email === true` → esemény "created".
  - `cancelOrder`: ha a lemondott rendelés `email === true` → esemény "cancelled".
  - `updateOrderStatus`: csak ha `existing.status !== updated.status` ÉS `updated.email === true` → esemény "status_changed". Csak `payed`-et módosító PATCH NEM triggerel.
  - `correctOrder`: sosem triggerel.
  - A címzett mindig a rendelés tulajdonosa (`order.accountId`), sosem a műveletet végző fiók.
- Fájlnév: `email_<ttt>_<YYYYMMDD>_<hhmm>.md`, `ttt` = ékezet nélküli, `_`-lal elválasztott, kisbetűs slug a címzett nevéből (a doksi két példája: `Kovács Béla` → `kovacs_bela`, `ügyfélszolgálat` → `ugyfelszolgalat`). Ütközésnél (`_2`, `_3`, ...) utótag, sosem felülírás.
- LLM-hiba/timeout esetén determinisztikus magyar sablon-fallback — az e-mail mindig elkészül.

---

## Task 1: `packages/core` — szimulált e-mail-írás (`send-simulated-email.ts`)

**Files:**

- Create: `packages/core/src/lib/email/send-simulated-email.ts`
- Test: `packages/core/src/lib/email/send-simulated-email.spec.ts`
- Modify: `packages/core/src/index.ts` (barrel export)
- Modify: `.gitignore` (repo gyökér)

**Interfaces:**

- Produces: `sendSimulatedEmail(input: SimulatedEmailInput): Promise<SimulatedEmailResult>`, ahol
  ```ts
  interface SimulatedEmailInput {
    recipientLabel: string // a névből képzett fájlnév-slughoz (pl. "Kovács Béla")
    recipientAddress: string // a fájl tartalmában megjelenő "Címzett:" mező
    subject: string
    body: string
    emailsDir?: string // teszthez: az emails/ könyvtár felülírható; alapértelmezett: repo-gyökér/emails
  }
  interface SimulatedEmailResult {
    filePath: string
  }
  ```
- Consumes: semmit (elsőként épülő, önálló modul).

- [ ] **Step 1: `send-simulated-email.ts` megírása**

```ts
import { mkdir, writeFile, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// packages/core/src/lib/email/ (vagy dist/lib/email/ build után, ugyanolyan
// mélységben) -> 5 szint fel a repo gyökeréig: email -> lib -> src(dist) ->
// core -> packages -> repo-gyökér.
const DEFAULT_EMAILS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../emails',
)

export interface SimulatedEmailInput {
  recipientLabel: string
  recipientAddress: string
  subject: string
  body: string
  emailsDir?: string
}

export interface SimulatedEmailResult {
  filePath: string
}

function slugify(label: string): string {
  const normalized = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  const slug = normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return slug || 'ismeretlen'
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function formatFileDateTime(date: Date): string {
  const datePart = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
  const timePart = `${pad(date.getHours())}${pad(date.getMinutes())}`
  return `${datePart}_${timePart}`
}

function formatHumanDateTime(date: Date): string {
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}. ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function resolveAvailableFilePath(
  emailsDir: string,
  baseName: string,
): Promise<string> {
  let candidate = join(emailsDir, `${baseName}.md`)
  let counter = 2
  while (await fileExists(candidate)) {
    candidate = join(emailsDir, `${baseName}_${counter}.md`)
    counter++
  }
  return candidate
}

export async function sendSimulatedEmail(
  input: SimulatedEmailInput,
): Promise<SimulatedEmailResult> {
  const emailsDir = input.emailsDir ?? DEFAULT_EMAILS_DIR
  const now = new Date()
  const slug = slugify(input.recipientLabel)
  const baseName = `email_${slug}_${formatFileDateTime(now)}`

  await mkdir(emailsDir, { recursive: true })
  const filePath = await resolveAvailableFilePath(emailsDir, baseName)

  const content = `# ${input.subject}

**Címzett:** ${input.recipientAddress}
**Dátum:** ${formatHumanDateTime(now)}

${input.body}
`
  await writeFile(filePath, content, 'utf-8')
  return { filePath }
}
```

- [ ] **Step 2: teszt írása**

```ts
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sendSimulatedEmail } from './send-simulated-email.js'

describe('sendSimulatedEmail', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'plantbase-email-test-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('creates a filename matching the spec examples (customer)', async () => {
    vi.setSystemTime(new Date(2026, 7, 17, 19, 17)) // 2026.08.17. 19:17
    const { filePath } = await sendSimulatedEmail({
      recipientLabel: 'Kovács Béla',
      recipientAddress: 'bela@example.com',
      subject: 'Rendelés visszaigazolás',
      body: 'Teszt.',
      emailsDir: dir,
    })
    expect(filePath).toBe(join(dir, 'email_kovacs_bela_20260817_1917.md'))
    vi.useRealTimers()
  })

  it('creates a filename matching the spec examples (ügyfélszolgálat)', async () => {
    vi.setSystemTime(new Date(2026, 7, 17, 19, 16))
    const { filePath } = await sendSimulatedEmail({
      recipientLabel: 'ügyfélszolgálat',
      recipientAddress: 'ugyfelszolgalat@plantbase.hu',
      subject: 'Eszkaláció',
      body: 'Teszt.',
      emailsDir: dir,
    })
    expect(filePath).toBe(join(dir, 'email_ugyfelszolgalat_20260817_1916.md'))
    vi.useRealTimers()
  })

  it('strips consecutive diacritics and punctuation', async () => {
    const { filePath } = await sendSimulatedEmail({
      recipientLabel: "Őri Ünő-Áron O'Brien",
      recipientAddress: 'x@example.com',
      subject: 'S',
      body: 'B',
      emailsDir: dir,
    })
    expect(filePath).toMatch(/email_ori_uno_aron_o_brien_\d{8}_\d{4}\.md$/)
  })

  it('appends a numeric suffix on filename collision instead of overwriting', async () => {
    vi.setSystemTime(new Date(2026, 7, 17, 19, 17))
    const first = await sendSimulatedEmail({
      recipientLabel: 'Kovács Béla',
      recipientAddress: 'bela@example.com',
      subject: 'Első',
      body: 'Első tartalom.',
      emailsDir: dir,
    })
    const second = await sendSimulatedEmail({
      recipientLabel: 'Kovács Béla',
      recipientAddress: 'bela@example.com',
      subject: 'Második',
      body: 'Második tartalom.',
      emailsDir: dir,
    })
    expect(second.filePath).not.toBe(first.filePath)
    expect(second.filePath).toBe(
      join(dir, 'email_kovacs_bela_20260817_1917_2.md'),
    )
    const firstContent = await readFile(first.filePath, 'utf-8')
    expect(firstContent).toContain('Első tartalom.')
    vi.useRealTimers()
  })

  it('writes the expected markdown structure', async () => {
    const { filePath } = await sendSimulatedEmail({
      recipientLabel: 'Teszt Elek',
      recipientAddress: 'teszt@example.com',
      subject: 'Tárgy sor',
      body: 'Törzs szöveg.',
      emailsDir: dir,
    })
    const content = await readFile(filePath, 'utf-8')
    expect(content).toContain('# Tárgy sor')
    expect(content).toContain('**Címzett:** teszt@example.com')
    expect(content).toContain('Törzs szöveg.')
  })

  it('creates the emails directory if it does not exist yet', async () => {
    const nested = join(dir, 'nested', 'path')
    const { filePath } = await sendSimulatedEmail({
      recipientLabel: 'Teszt',
      recipientAddress: 'teszt@example.com',
      subject: 'S',
      body: 'B',
      emailsDir: nested,
    })
    await expect(readFile(filePath, 'utf-8')).resolves.toContain('B')
  })

  it('resolves the default emailsDir to the real repo-root emails/ directory', async () => {
    // Nincs emailsDir megadva -- a teszt-fájl UGYANABBÓL a könyvtárból számolja
    // ki a várt repo-gyökér emails/ útvonalat (a saját import.meta.url-jéből,
    // ugyanazzal az 5-szintes felfelé lépéssel, mint az implementáció), majd
    // ellenőrzi, hogy a ténylegesen létrehozott fájl valóban ott van -- ez egy
    // független (nem tautologikus) ellenőrzés, mert a várt útvonalat itt,
    // külön számoljuk ki, nem az implementációból importáljuk.
    const expectedRepoRootEmailsDir = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../../emails',
    )
    const { filePath } = await sendSimulatedEmail({
      recipientLabel: 'Repo Root Teszt',
      recipientAddress: 'x@example.com',
      subject: 'S',
      body: 'B',
    })
    try {
      expect(filePath.startsWith(expectedRepoRootEmailsDir)).toBe(true)
    } finally {
      await rm(filePath, { force: true })
    }
  })
})
```

Ha ez a teszt fut le elsőként a jelen futtatási környezetben, és a valódi repo-gyökér `emails/` mappa korábban üres volt (csak `.gitkeep`), fusson le kézzel is egyszer, és nézd meg, hogy a fájl ténylegesen a helyes mappában jött-e létre, mielőtt a `try`/`finally` törli — ez az egyetlen teszt-eset, ami a valódi `emails/` mappát érinti (a többi mind `emailsDir` override-dal, ideiglenes könyvtárban fut).

- [ ] **Step 3: `packages/core/src/index.ts` bővítése**

Add hozzá egy sort: `export * from './lib/email/send-simulated-email.js'`

- [ ] **Step 4: `.gitignore` bővítése**

A repo gyökerén levő `.gitignore`-hoz add hozzá (a fájl végére, egy rövid megjegyzéssel):

```gitignore
# Szimulált e-mail-kimenet (C al-projekt) -- generált tartalom, nem verziókezelt
emails/*.md
```

(A meglévő `emails/.gitkeep` így is követve marad, mert az nem `.md`.)

- [ ] **Step 5: tesztek + build futtatása**

Run: `pnpm exec nx run-many -t lint,test,build -p core`
Expected: minden zöld, a `send-simulated-email.spec.ts` minden teszt-esete átmegy.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/lib/email/send-simulated-email.ts packages/core/src/lib/email/send-simulated-email.spec.ts packages/core/src/index.ts .gitignore
git commit -m "feat: add simulated email file writer with collision-safe naming"
```

---

## Task 2: `packages/core` — LLM-alapú e-mail-tartalom összeállítás (`compose-order-email.ts`)

**Files:**

- Create: `packages/core/src/lib/email/compose-order-email.ts`
- Test: `packages/core/src/lib/email/compose-order-email.spec.ts`
- Modify: `packages/core/src/index.ts` (barrel export)

**Interfaces:**

- Consumes: `AGENT_MODEL` (`./agent-tools.js`, már létező export, jelenlegi érték: `'claude-sonnet-5'`).
- Produces:

  ```ts
  interface OrderEmailData {
    orderId: number
    status: string
    orderDesc: string | null
    price: number | null
  }
  interface OrderEmailAccount {
    fullName: string
    salutation: string
  }
  type OrderEmailEventType = 'created' | 'cancelled' | 'status_changed'
  interface ComposedEmail {
    subject: string
    body: string
  }
  composeOrderEmail(order: OrderEmailData, account: OrderEmailAccount, eventType: OrderEmailEventType): Promise<ComposedEmail>
  ```

  Ezt fogja a Task 4 (`apps/server/src/lib/order-emails.ts`) importálni.

- [ ] **Step 1: `compose-order-email.ts` megírása**

```ts
import { anthropic } from '@ai-sdk/anthropic'
import { generateObject } from 'ai'
import { z } from 'zod'
import { AGENT_MODEL } from './agent-tools.js'

export interface OrderEmailData {
  orderId: number
  status: string
  orderDesc: string | null
  price: number | null
}

export interface OrderEmailAccount {
  fullName: string
  salutation: string
}

export type OrderEmailEventType = 'created' | 'cancelled' | 'status_changed'

export interface ComposedEmail {
  subject: string
  body: string
}

const EMAIL_TIMEOUT_MS = 15_000

const EmailContentSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
})

const EMAIL_SYSTEM_PROMPT = `Te a Plantbase növény-webáruház rendszere vagy, és rendelés-értesítő e-maileket írsz az ügyfeleknek.
Magyar nyelven, udvariasan és tömören fogalmazz (2-4 rövid bekezdés).
Szólítsd meg az ügyfelet a megadott megszólítással.
Említsd meg a rendelésszámot és az aktuális státuszt.
Ne találj ki olyan adatot, amit nem kaptál meg a felhasználói üzenetben.`

function eventDescription(eventType: OrderEmailEventType): string {
  switch (eventType) {
    case 'created':
      return 'A rendelés most jött létre.'
    case 'cancelled':
      return 'A rendelést az ügyfél lemondta.'
    case 'status_changed':
      return 'A rendelés státusza megváltozott.'
  }
}

function fallbackTemplate(
  order: OrderEmailData,
  account: OrderEmailAccount,
  eventType: OrderEmailEventType,
): ComposedEmail {
  const subject = `Plantbase rendelés #${order.orderId} — ${order.status}`
  const descLine = order.orderDesc ? `Rendelés: ${order.orderDesc}. ` : ''
  const priceLine = order.price !== null ? `Ár: ${order.price} Ft.` : ''
  const body = `Kedves ${account.salutation}!

${eventDescription(eventType)} A(z) #${order.orderId} számú rendelés jelenlegi státusza: ${order.status}.
${descLine}${priceLine}

Üdvözlettel,
Plantbase`
  return { subject, body }
}

function buildPrompt(
  order: OrderEmailData,
  account: OrderEmailAccount,
  eventType: OrderEmailEventType,
): string {
  return `Esemény: ${eventDescription(eventType)}
Rendelésszám: ${order.orderId}
Jelenlegi státusz: ${order.status}
Leírás: ${order.orderDesc ?? '(nincs megadva)'}
Ár: ${order.price !== null ? `${order.price} Ft` : '(nincs megadva)'}
Ügyfél neve: ${account.fullName}
Megszólítás: ${account.salutation}`
}

export async function composeOrderEmail(
  order: OrderEmailData,
  account: OrderEmailAccount,
  eventType: OrderEmailEventType,
): Promise<ComposedEmail> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), EMAIL_TIMEOUT_MS)
  try {
    const { object } = await generateObject({
      model: anthropic(AGENT_MODEL),
      system: EMAIL_SYSTEM_PROMPT,
      schema: EmailContentSchema,
      abortSignal: controller.signal,
      prompt: buildPrompt(order, account, eventType),
    })
    return object
  } catch {
    return fallbackTemplate(order, account, eventType)
  } finally {
    clearTimeout(timeout)
  }
}
```

- [ ] **Step 2: teszt írása**

Kövesd a `packages/core/src/lib/stream-agent.spec.ts`-ben már meglévő mock-mintát (`vi.mock('ai', ...)` + `vi.mock('@ai-sdk/anthropic', ...)`), de itt `generateObject`-et kell mockolni `streamText` helyett:

```ts
import { generateObject } from 'ai'
import { composeOrderEmail } from './compose-order-email.js'

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>()
  return { ...actual, generateObject: vi.fn() }
})
vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: (m: string) => ({ model: m }),
}))

const order = {
  orderId: 42,
  status: 'új',
  orderDesc: 'Aranylabda kaktusz',
  price: 3500,
}
const account = { fullName: 'Kovács Béla', salutation: 'Uram' }

describe('composeOrderEmail', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns the LLM-generated subject and body on success', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { subject: 'Rendelés visszaigazolás', body: 'Kedves Uram!' },
    } as never)

    const result = await composeOrderEmail(order, account, 'created')

    expect(result).toEqual({
      subject: 'Rendelés visszaigazolás',
      body: 'Kedves Uram!',
    })
  })

  it('passes the order/account/event details in the prompt', async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { subject: 'S', body: 'B' },
    } as never)

    await composeOrderEmail(order, account, 'status_changed')

    const call = vi.mocked(generateObject).mock.calls[0][0]
    expect(call.prompt).toContain('42')
    expect(call.prompt).toContain('Kovács Béla')
    expect(call.prompt).toContain('Uram')
  })

  it('falls back to a deterministic Hungarian template when the LLM call fails', async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error('timeout'))

    const result = await composeOrderEmail(order, account, 'cancelled')

    expect(result.subject).toContain('#42')
    expect(result.body).toContain('Uram')
    expect(result.body).toContain('lemondta')
  })

  it('fallback template includes price and description when present', async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error('fail'))

    const result = await composeOrderEmail(order, account, 'created')

    expect(result.body).toContain('Aranylabda kaktusz')
    expect(result.body).toContain('3500')
  })

  it('fallback template handles missing description/price gracefully', async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error('fail'))

    const result = await composeOrderEmail(
      { orderId: 7, status: 'folyamatban', orderDesc: null, price: null },
      account,
      'status_changed',
    )

    expect(result.subject).toContain('#7')
    expect(result.body).not.toContain('null')
  })
})
```

- [ ] **Step 3: `packages/core/src/index.ts` bővítése**

Add hozzá: `export * from './lib/email/compose-order-email.js'`

- [ ] **Step 4: tesztek + build futtatása**

Run: `pnpm exec nx run-many -t lint,test,build -p core`
Expected: minden zöld.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/lib/email/compose-order-email.ts packages/core/src/lib/email/compose-order-email.spec.ts packages/core/src/index.ts
git commit -m "feat: compose order notification emails via LLM with template fallback"
```

---

## Task 3: rendszerprompt bővítés — "e-mail is érkezik" említés

**Files:**

- Modify: `packages/core/src/lib/system-prompt.ts`
- Modify: `docs/system-prompt.md`
- Modify: `packages/core/src/lib/system-prompt.spec.ts`

**Interfaces:** nincs — csak prompt-szöveg.

- [ ] **Step 1: `ORDER_PROMPT_ADDITION` bővítése**

A `packages/core/src/lib/system-prompt.ts`-ben az `<order_behavior>` szekció JELENLEGI, 3 pontos listája (a `packages/db` már mergelt B al-projektjéből):

```
- Ha az ügyfél rendelést szeretne indítani, ELŐSZÖR kérdezz vissza: valóban szeretne-e rendelést indítani. Csak megerősítés után kérdezz rá, hogy szeretne-e e-mail-értesítést kapni a rendelésről. Csak ezután hívd a createOrder tool-t.
- Rendelés-lekérdezésnél: ha a getOrderByNumber vagy listMyOrders eredménye egyetlen rendelést ad vissza, mondd el az adatait. Ha több rendelés van, kérdezd meg, melyikről kér információt. Ha a listMyOrders "tooMany": true-t ad, kérd meg az ügyfelet, hogy szűkítse a kérést (pl. rendelésszám megadásával).
- A "teljesítve" státuszt és a rendelési adatok javítását kizárólag ügyintéző végezheti — ha az ügyfél ezt kéri a chaten, udvariasan jelezd, hogy ehhez ügyintézőnek kell fordulnia.
```

Egészítsd ki EGY új sorral, közvetlenül az első pont UTÁN (a `createOrder`/`cancelOrder`-re vonatkozó instrukciók mellé, mielőtt a lekérdezés-kezelésre térne a lista):

```
- Sikeres createOrder vagy cancelOrder hívás után, ha az ügyfél a beszélgetés során kért e-mail-értesítést, a válaszodban említsd meg röviden, hogy erről hamarosan e-mail-értesítést is kap.
```

- [ ] **Step 2: `docs/system-prompt.md` verbátim tükrözése**

A `docs/system-prompt.md`-ben a `<order_behavior>` blokk (65-70. sor környékén) UGYANEZT a szöveget kapja, UGYANOTT beszúrva — a fájl `xml` blokkja szó szerint kell hogy egyezzen a `packages/core/src/lib/system-prompt.ts` `ORDER_PROMPT_ADDITION` konstansával (ezt a `system-prompt.spec.ts` egy szigorú `toBe()` egyezés-teszttel ellenőrzi).

- [ ] **Step 3: `system-prompt.spec.ts` bővítése**

**Fontos, ellenőrzött tény:** a jelenlegi `system-prompt.spec.ts`-ben a `describe('SYSTEM_PROMPT', ...)` blokk verbátim-egyezés tesztje (`extractXmlBlock` + `toBe`) KIZÁRÓLAG az első `xml` blokkot (a `SYSTEM_PROMPT`-ot) hasonlítja össze `docs/system-prompt.md`-vel — az `ORDER_PROMPT_ADDITION`-re (a doksi MÁSODIK, "Rendelés-képesség kiegészítés" szekció alatti `xml` blokkjára) jelenleg NINCS hasonló automatikus verbátim-ellenőrzés. Ez egy már meglévő tesztlefedettségi rés, NEM ennek a tasknak a hatásköre kijavítani — csak ne állítsd tévesen, hogy a meglévő teszt lefedi az új sort.

Importáld be az `ORDER_PROMPT_ADDITION`-t is (ha még nincs importálva) a fájl tetején: `import { SYSTEM_PROMPT, ORDER_PROMPT_ADDITION } from './system-prompt.js'`, és adj hozzá egy új, önálló `describe`-ot a fájl végére:

```ts
describe('ORDER_PROMPT_ADDITION', () => {
  it('instructs the agent to mention the upcoming notification email', () => {
    expect(ORDER_PROMPT_ADDITION).toContain('e-mail-értesítést is kap')
  })
})
```

- [ ] **Step 4: tesztek futtatása**

Run: `pnpm exec nx run test core`
Expected: minden zöld, beleértve a verbátim-egyezés tesztet.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/lib/system-prompt.ts packages/core/src/lib/system-prompt.spec.ts docs/system-prompt.md
git commit -m "feat: mention upcoming notification email in the agent's order responses"
```

---

## Task 4: `apps/server` — `notifyOrderEvent` wrapper

**Files:**

- Create: `apps/server/src/lib/order-emails.ts`
- Test: `apps/server/src/lib/order-emails.spec.ts`

**Interfaces:**

- Consumes: `composeOrderEmail`, `sendSimulatedEmail`, `OrderEmailData`, `OrderEmailEventType` (mind `@plantbase/core`-ból, Task 1+2 hozza létre — az `order` paraméter típusát a Task 2-ben már létrehozott `OrderEmailData` adja, NEM egy új, párhuzamos interfész, hogy a két csomag típusa sosem csúszhasson szét); `prisma` (`@plantbase/db`-ből).
- Produces:

  ```ts
  function notifyOrderEvent(
    order: OrderEmailData,
    accountId: number,
    eventType: OrderEmailEventType,
  ): void
  ```

  Ezt fogja a Task 5 (`orders-store.ts`) importálni és hívni.

- [ ] **Step 1: `order-emails.ts` megírása**

```ts
import { prisma } from '@plantbase/db'
import {
  composeOrderEmail,
  sendSimulatedEmail,
  type OrderEmailData,
  type OrderEmailEventType,
} from '@plantbase/core'

/**
 * Fire-and-forget: sosem dob, sosem várja meg a hívó. Minden hiba (LLM,
 * fiók-lookup, fájlrendszer) csak logolódik -- a rendelés-műveletet ez
 * nem befolyásolhatja.
 */
export function notifyOrderEvent(
  order: OrderEmailData,
  accountId: number,
  eventType: OrderEmailEventType,
): void {
  void (async () => {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    })
    if (!account) return
    const { subject, body } = await composeOrderEmail(
      order,
      { fullName: account.fullName, salutation: account.salutation },
      eventType,
    )
    await sendSimulatedEmail({
      recipientLabel: account.fullName,
      recipientAddress: account.email,
      subject,
      body,
    })
  })().catch((err: unknown) => {
    console.error('Rendelés-értesítő e-mail küldése sikertelen:', err)
  })
}
```

- [ ] **Step 2: teszt írása**

Kövesd a repóban már meglévő Prisma-mock mintát (`apps/server/src/lib/orders-store.spec.ts`-ben, `vi.mock('@plantbase/db', ...)`). Mivel `notifyOrderEvent` szándékosan `void`-ot ad vissza és a belső munka a háttérben fut, a teszteknek meg kell várniuk a mikrotaszk-sort (`await vi.waitFor(...)` vagy egy rövid `await new Promise((r) => setImmediate(r))`), mielőtt a mock-hívásokat ellenőriznék.

```ts
import { prisma } from '@plantbase/db'
import { composeOrderEmail, sendSimulatedEmail } from '@plantbase/core'
import { notifyOrderEvent } from './order-emails.js'

vi.mock('@plantbase/db', () => ({
  prisma: { account: { findUnique: vi.fn() } },
}))
vi.mock('@plantbase/core', () => ({
  composeOrderEmail: vi.fn(),
  sendSimulatedEmail: vi.fn(),
}))

const order = { orderId: 1, status: 'új', orderDesc: 'Teszt', price: 1000 }
const account = {
  id: 5,
  fullName: 'Kovács Béla',
  salutation: 'Uram',
  email: 'bela@example.com',
}

async function flushMicrotasks(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}

describe('notifyOrderEvent', () => {
  beforeEach(() => vi.clearAllMocks())

  it('looks up the account, composes, and sends the email', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(account as never)
    vi.mocked(composeOrderEmail).mockResolvedValue({
      subject: 'S',
      body: 'B',
    })
    vi.mocked(sendSimulatedEmail).mockResolvedValue({ filePath: '/x' })

    notifyOrderEvent(order, 5, 'created')
    await flushMicrotasks()

    expect(prisma.account.findUnique).toHaveBeenCalledWith({
      where: { id: 5 },
    })
    expect(composeOrderEmail).toHaveBeenCalledWith(
      order,
      { fullName: 'Kovács Béla', salutation: 'Uram' },
      'created',
    )
    expect(sendSimulatedEmail).toHaveBeenCalledWith({
      recipientLabel: 'Kovács Béla',
      recipientAddress: 'bela@example.com',
      subject: 'S',
      body: 'B',
    })
  })

  it('does nothing if the account is not found', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(null)

    notifyOrderEvent(order, 999, 'created')
    await flushMicrotasks()

    expect(composeOrderEmail).not.toHaveBeenCalled()
    expect(sendSimulatedEmail).not.toHaveBeenCalled()
  })

  it('never throws back to the caller when composeOrderEmail rejects', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(account as never)
    vi.mocked(composeOrderEmail).mockRejectedValue(new Error('boom'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => notifyOrderEvent(order, 5, 'created')).not.toThrow()
    await flushMicrotasks()

    expect(sendSimulatedEmail).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('never throws back to the caller when sendSimulatedEmail rejects', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(account as never)
    vi.mocked(composeOrderEmail).mockResolvedValue({ subject: 'S', body: 'B' })
    vi.mocked(sendSimulatedEmail).mockRejectedValue(new Error('disk full'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => notifyOrderEvent(order, 5, 'created')).not.toThrow()
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
git add apps/server/src/lib/order-emails.ts apps/server/src/lib/order-emails.spec.ts
git commit -m "feat: add fire-and-forget order-email notification wrapper"
```

---

## Task 5: `orders-store.ts` bekötés — trigger-hívások

**Files:**

- Modify: `apps/server/src/lib/orders-store.ts`
- Modify: `apps/server/src/lib/orders-store.spec.ts`

**Interfaces:**

- Consumes: `notifyOrderEvent` (`./order-emails.js`, Task 4).

**FONTOS:** ez a task a `createOrder`, `cancelOrder`, `updateOrderStatus` függvényeket módosítja — a `correctOrder` és minden más rész (típusok, `runSerializable`, `isNoOpPatch`, `toSummary`, `toStaffDetail`, staff-only lekérdező függvények) VÁLTOZATLAN marad. Az alábbi a fájl TELJES, várt végállapota — használd referenciának, de a tényleges módosítás előtt olvasd be a jelenlegi fájlt, és ellenőrizd, hogy nem tér-e el (ha igen, a jelenlegi fájl a mérvadó, ezt a diffet ahhoz igazítsd).

- [ ] **Step 1: `createOrder` bővítése**

A jelenlegi `createOrder` a tranzakció után csak `return { orderId: order.orderId }`-et ad vissza. Egészítsd ki a `return` ELŐTT:

```ts
    async createOrder(input: CreateOrderInput) {
      const order = (await prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            accountId,
            status: 'új',
            orderDesc: input.orderDesc ?? null,
            price: input.price ?? null,
            email: input.email,
            category: input.category ?? null,
            location: input.location ?? null,
            light: input.light ?? null,
            watering: input.watering ?? null,
            currentHeightCm: input.currentHeightCm ?? null,
            maxHeightCm: input.maxHeightCm ?? null,
            currentPotCm: input.currentPotCm ?? null,
            petSafe: input.petSafe ?? null,
            kidSafe: input.kidSafe ?? null,
            airPurifying: input.airPurifying ?? null,
          },
        })
        await tx.orderAuditLog.create({
          data: {
            orderId: created.orderId,
            accountId,
            action: 'created',
            newData: created,
          },
        })
        return created
      })) as OrderRow
      if (order.email) {
        notifyOrderEvent(
          {
            orderId: order.orderId,
            status: order.status,
            orderDesc: order.orderDesc,
            price: order.price === null ? null : Number(order.price),
          },
          accountId,
          'created',
        )
      }
      return { orderId: order.orderId }
    },
```

- [ ] **Step 2: `cancelOrder` bővítése**

A jelenlegi `cancelOrder` a `runSerializable` callback-jét `void`-ként futtatja (nem ad vissza semmit belőle), és utána `return { ok: true }`. Módosítsd úgy, hogy a callback adja vissza a frissített sort, ezt fogd fel, és ha `email: true`, triggerelj:

```ts
    async cancelOrder(orderId: number) {
      try {
        const cancelled = await runSerializable(async (tx) => {
          const existing = (await tx.order.findUnique({
            where: { orderId },
          })) as OrderRow | null
          if (!existing || existing.accountId !== accountId) {
            throw new OrderActionRefusal('Nem található ilyen rendelés.')
          }
          if (!CANCELLABLE_STATUSES.includes(existing.status)) {
            throw new OrderActionRefusal('Ez a rendelés már nem mondható le.')
          }
          const updated = (await tx.order.update({
            where: { orderId },
            data: { status: 'lemondva' },
          })) as OrderRow
          await tx.orderAuditLog.create({
            data: {
              orderId,
              accountId,
              action: 'cancelled',
              previousData: toJsonSnapshot(existing),
              newData: updated,
            },
          })
          return updated
        })
        if (cancelled.email) {
          notifyOrderEvent(
            {
              orderId: cancelled.orderId,
              status: cancelled.status,
              orderDesc: cancelled.orderDesc,
              price: cancelled.price === null ? null : Number(cancelled.price),
            },
            accountId,
            'cancelled',
          )
        }
        return { ok: true }
      } catch (err) {
        if (err instanceof OrderActionRefusal) {
          return { ok: false, reason: err.reason }
        }
        throw err
      }
    },
```

(A `tx.order.update` sor kapott egy `as OrderRow` castot, mert most már a callback-ből visszaadott értékként típusra van szükség — korábban ez a sor cast nélkül, void-ként futott.)

- [ ] **Step 3: `updateOrderStatus` bővítése**

A jelenlegi verzió a `runSerializable` callback-jéből vagy `existing`-et (no-op eset), vagy `result`-ot (valódi írás) ad vissza, `OrderRow`-ra castolva. Módosítsd úgy, hogy a callback MINDKETTŐT (`existing` ÉS a végleges állapot) visszaadja, hogy a hívó össze tudja hasonlítani a régi/új státuszt:

```ts
export async function updateOrderStatus(
  actorAccountId: number,
  orderId: number,
  patch: { status?: string; payed?: boolean },
): Promise<StaffOrderDetail | null> {
  try {
    const { existing, result } = await runSerializable(async (tx) => {
      const existing = (await tx.order.findUnique({
        where: { orderId },
      })) as OrderRow | null
      if (!existing) throw new OrderNotFoundForUpdate()
      // Üres mentés: nincs mit írni, és félrevezető audit-sort sem hagyunk.
      if (isNoOpPatch(existing, patch)) return { existing, result: existing }
      const result = (await tx.order.update({
        where: { orderId },
        data: patch,
      })) as OrderRow
      await tx.orderAuditLog.create({
        data: {
          orderId,
          accountId: actorAccountId,
          action: 'status_changed',
          previousData: toJsonSnapshot(existing),
          newData: result,
        },
      })
      return { existing, result }
    })
    if (existing.status !== result.status && result.email) {
      notifyOrderEvent(
        {
          orderId: result.orderId,
          status: result.status,
          orderDesc: result.orderDesc,
          price: result.price === null ? null : Number(result.price),
        },
        result.accountId,
        'status_changed',
      )
    }
    return toStaffDetail(result)
  } catch (err) {
    if (err instanceof OrderNotFoundForUpdate) return null
    throw err
  }
}
```

Fontos: az e-mail címzettje `result.accountId` (a rendelés tulajdonosa), NEM `actorAccountId` (a műveletet végző staff/admin fiók).

- [ ] **Step 4: import bővítése**

A fájl tetején, a meglévő importok közé:

```ts
import { notifyOrderEvent } from './order-emails.js'
```

- [ ] **Step 5: `orders-store.spec.ts` bővítése**

A meglévő Prisma-mock mintát követve, mockold a `./order-emails.js`-t is:

```ts
vi.mock('./order-emails.js', () => ({ notifyOrderEvent: vi.fn() }))
```

Adj hozzá teszteket (a meglévő `describe` blokkokon belül, a megfelelő függvénynél):

- `createOrder` — `email: true` inputtal triggerel (`notifyOrderEvent` hívva `'created'`-del), `email: false`-szal NEM.
- `cancelOrder` — sikeres lemondás `email: true` rendelésen triggerel (`'cancelled'`-del), `email: false`-on NEM, és egy visszautasított (`ok: false`) lemondás SOSEM triggerel.
- `updateOrderStatus` — valódi státuszváltás (`status: 'folyamatban'` → `'teljesítve'`) `email: true` rendelésen triggerel (`'status_changed'`-del, és a hívás második paramétere a rendelés `accountId`-ja, NEM az `actorAccountId`); csak `payed`-et módosító patch (a `status` változatlan) NEM triggerel; `email: false` rendelésen NEM triggerel.
- `correctOrder` — semmilyen hívás után SEM triggerel (`notifyOrderEvent` egyáltalán nincs hívva ebben a teszt-blokkban).

- [ ] **Step 6: tesztek + build futtatása**

Run: `pnpm exec nx run-many -t lint,test,build -p server`
Expected: minden zöld.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/lib/orders-store.ts apps/server/src/lib/orders-store.spec.ts
git commit -m "feat: trigger order-notification emails on create, cancel, and real status changes"
```

---

## Task 6: teljes workspace ellenőrzés + manuális E2E

**Files:** nincs kódváltozás — csak ellenőrzés (B Task 13 mintájára).

- [ ] **Step 1: Teljes workspace build/lint/teszt**

```bash
pnpm exec nx run-many -t lint,test,build -p core,db,server,web,cli
```

Expected: minden zöld, KIVÉVE a már ismert, korábbi al-projektek előtt is meglévő hibák (ha vannak — ellenőrizd a `docs/superpowers/plans/2026-08-18-order-subsystem.md`-ben és a B ledger-ben dokumentáltakat; ezek nem ehhez a munkához tartoznak, ne javítsd őket).

- [ ] **Step 2: Manuális E2E — rendelés-létrehozás e-mail-lel**

```bash
pnpm exec nx run server:serve
pnpm exec nx run web:serve
```

Böngészőben (`http://localhost:4200`) vagy curl+cookie-jar-ral (nincs böngésző-automatizálás ebben a környezetben — kövesd a B Task 13 mintáját): jelentkezz be egy `customer` fiókkal, indíts egy rendelést a chaten keresztül, e-mail-értesítést KÉRVE. Ellenőrizd:

- Az agent válasza megemlíti, hogy e-mail-értesítés is érkezik (Task 3).
- Az `emails/` könyvtárban rövid időn belül megjelenik egy `email_<ügyfél-neve-slug>_<dátum>_<idő>.md` fájl, értelmes, magyar, udvarias tartalommal, ami tartalmazza a rendelésszámot és a "új" státuszt.

- [ ] **Step 3: Manuális E2E — lemondás e-mail-lel**

Mondd le ugyanazt a rendelést a chaten keresztül. Ellenőrizd, hogy egy ÚJABB `.md` fájl jön létre (más `datetime`-mal, vagy ugyanabban a percben `_2` utótaggal), "lemondva" státusszal.

- [ ] **Step 4: Manuális E2E — staff státuszváltás e-mail-lel**

Jelentkezz be staff fiókkal, hozz létre (customer fiókkal) egy új, e-mailt kérő rendelést, majd staff felületen váltsd `teljesítve`-re. Ellenőrizd, hogy egy `.md` fájl jön létre "teljesítve" státusszal. Ezután CSAK a `payed` checkbox-ot változtasd meg (státusz already `teljesítve`, nem változik) — ellenőrizd, hogy EZ NEM hoz létre új e-mail-fájlt.

- [ ] **Step 5: Manuális E2E — nincs e-mail-kérés esetén nincs levél**

Hozz létre egy rendelést, ahol az e-mail-kérdésre "nem"-mel válaszolsz. Ellenőrizd, hogy sem a létrehozáskor, sem egy azt követő lemondáskor NEM jön létre `.md` fájl ehhez a rendeléshez.

- [ ] **Step 6: Eredmény rögzítése**

Ha bármelyik lépés hibát mutat, a hibát az érintett Task fájljaiban oldd meg, majd ismételd meg ezt a Task 6-ot.

Ha minden lépés sikeres, ez a Task 6 zárja a C al-projektet — nincs commit (nincs kódváltozás), de jelezd a felhasználónak, hogy a C al-projekt kész, és a `docs/extension-for-customers.md` felbontásában a D al-projekt (eszkaláció/off-topic kezelés, a jelen C-ben létrehozott `sendSimulatedEmail` újrahasználásával) a következő lépés.
