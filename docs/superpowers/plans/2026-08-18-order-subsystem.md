# Rendelés-alrendszer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendelés-alrendszer a meglévő Plantbase agent és web UI fölé: az ügyfél a chaten keresztül rendelést indíthat/lemondhat/lekérdezhet, ügyintéző/üzemeltető pedig egy minimális webes felületen kezelheti a rendeléseket (státusz-váltás, javítás, audit-napló), a `packages/core` továbbra sem függ `packages/db`-től.

**Architecture:** Az `orders`/`order_audit_log` táblák Prisma-modellként jönnek létre. `packages/core` egy dependency-injected `OrderActions` interfészen keresztül kap írási képességet — a valódi, Prisma-alapú implementációt `apps/server` konstruálja, a bejelentkezett ügyfél `account_id`-jához zárva; a CLI-nek (nincs bejelentkezett fiók) ezek a tool-ok nincsenek regisztrálva. Az ügyfél a `/api/chat`-en keresztül, kizárólag a chat-agent tool-hívásaival ér el rendelés-műveleteket; nincs külön ügyfél-oldali REST végpont. Az ügyintéző/üzemeltető külön, szerepkör-védett REST végpontokon és egy minimális `apps/web` felületen dolgozik, nem a chaten.

**Tech Stack:** ugyanaz, mint az A al-projektben (Express 5, React 19, Vite 8, Tailwind 4, Vercel AI SDK 7 (`ai@^7.0.66`), Prisma 6.19.2, Vitest, supertest) — nincs új technológiai réteg.

**Spec:** `docs/superpowers/specs/2026-08-18-order-subsystem-design.md`

## Global Constraints

- `packages/core` SOSEM függhet `packages/db`-től (öröklött A-ból, lint kikényszeríti).
- A rendelés-írás tool-jai (`createOrder`, `cancelOrder`, `listMyOrders`, `getOrderByNumber`) SOSEM kapnak `account_id`-t paraméterként az LLM-től — a szerver mindig a saját session-jéből (`req.account.id`) zárja be az `OrderActions` closure-ben.
- A CLI-nek (`askAgent`) SOSEM adjuk át az `OrderActions`-t — a rendelési tool-ok kizárólag a streamelő, web-alapú útvonalon (`streamAgentResponse`) érhetők el.
- `category`/`location`/`light`/`watering` értékkészlete: szobanövény/kerti/pozsgás/kaktusz/fűszer/fa-cserje/lógó/virágzó · beltéri/kültéri/mindkettő · árnyék/alacsony/közepes/erős/direkt nap · ritka/közepes/gyakori/állandóan nedves — ugyanaz, mint a `products` táblánál.
- Rendelés-státuszok: `új` (alapértelmezett, agent hozza létre) → `folyamatban`/`lemondva`/`teljesítve` — az ügyfél kizárólag a saját `új`/`folyamatban` rendelését mondhatja le (`lemondva`); minden más átmenetet (`folyamatban`, `teljesítve`) kizárólag `staff`/`admin` végezhet a staff-felületen.
- Minden rendelés-változás (`created`/`status_changed`/`corrected`/`cancelled`) `order_audit_log` bejegyzést ír, a `previous_data`/`new_data` a rendelés teljes állapotát tárolja JSON-ként. A napló csak `staff`/`admin` szerepkörrel érhető el.
- **A `knowledge_chunks` táblán hand-authored HNSW index van, amit Prisma nem ismer fel** (lásd `schema.prisma` meglévő kommentje) — EZ MINDEN jövőbeli `prisma migrate dev` futásnál drift-ként detektálható és `DROP INDEX`-et javasolhat. A generált migráció fájlját mindig ellenőrizd, és ha van benne `DROP INDEX "knowledge_chunks_embedding_idx"`, távolítsd el commit előtt (A al-projekt Task 1-ében pontosan ez történt, és élesben eldobta az indexet, amíg ki nem javították).
- Prettier: `semi: false`, nincs `console.log` termékkódban (kivéve a meglévő `errorHandler` mintája, ami szándékos).
- Conventional Commits (`feat:`, `fix:`, `test:`, `chore:`), egy lépés = egy commit.
- A staff webfelület automatizált teszt nélkül marad (A-ban lefektetett precedens).

---

## Task 1: Prisma séma — `orders` + `order_audit_log` tábla

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_add_orders/migration.sql` (Prisma generálja)

**Interfaces:**
- Produces: Prisma modellek `Order` (`orderId`, `accountId`, `status`, `orderDesc`, `price`, `payed`, `email`, `category`, `location`, `light`, `watering`, `currentHeightCm`, `maxHeightCm`, `currentPotCm`, `petSafe`, `kidSafe`, `airPurifying`, `createdAt`, `updatedAt`) és `OrderAuditLog` (`id`, `orderId`, `accountId`, `action`, `previousData`, `newData`, `createdAt`), táblanevek `orders`/`order_audit_log`. Ezeket a `@plantbase/db` csomag `prisma` kliense exportálja, Task 4 ezen keresztül éri el.

- [ ] **Step 1: Postgres fut-e — ellenőrzés**

Run: `docker ps` (VAGY `docker compose ps`, ha nem futna semmi Postgres-image)
Expected: van egy futó `pgvector/pgvector:pg16` image alapú konténer. Ha nincs: `docker compose up -d`.

- [ ] **Step 2: Modellek hozzáadása a séma-fájlhoz**

Szerkeszd a `packages/db/prisma/schema.prisma`-t. Az `Account` modellben a meglévő `sessions Session[]` sor UTÁN (tehát még a `@@map("accounts")` sor ELŐTT) illeszd be a két új relation-mezőt:

```prisma
  orders               Order[]
  orderAuditLogEntries OrderAuditLog[]
```

A `Session` modell UTÁN illeszd be:

```prisma
model Order {
  orderId           Int             @id @default(autoincrement()) @map("order_id")
  accountId         Int             @map("account_id")
  account           Account         @relation(fields: [accountId], references: [id])
  status            String          @default("új") // új | folyamatban | lemondva | teljesítve
  orderDesc         String?         @map("order_desc")
  price             Decimal?        @db.Decimal(10, 2)
  payed             Boolean         @default(false) // csak staff/admin állítja
  email             Boolean // kér-e e-mail-értesítést a rendelésről
  category          String? // szobanövény | kerti | pozsgás | kaktusz | fűszer | fa-cserje | lógó | virágzó
  location          String? // beltéri | kültéri | mindkettő
  light             String? // árnyék | alacsony | közepes | erős | direkt nap
  watering          String? // ritka | közepes | gyakori | állandóan nedves
  currentHeightCm   Int?            @map("current_height_cm")
  maxHeightCm       Int?            @map("max_height_cm")
  currentPotCm      Int?            @map("current_pot_cm")
  petSafe           Boolean?        @map("pet_safe")
  kidSafe           Boolean?        @map("kid_safe")
  airPurifying      Boolean?        @map("air_purifying")
  createdAt         DateTime        @default(now()) @map("created_at")
  updatedAt         DateTime        @updatedAt @map("updated_at")
  auditEntries      OrderAuditLog[]

  @@map("orders")
}

model OrderAuditLog {
  id           Int      @id @default(autoincrement())
  orderId      Int      @map("order_id")
  order        Order    @relation(fields: [orderId], references: [orderId])
  accountId    Int      @map("account_id")
  account      Account  @relation(fields: [accountId], references: [id])
  action       String // created | status_changed | corrected | cancelled
  previousData Json?    @map("previous_data")
  newData      Json     @map("new_data")
  createdAt    DateTime @default(now()) @map("created_at")

  @@map("order_audit_log")
}
```

- [ ] **Step 3: Migráció generálása és alkalmazása**

Run (repo gyökérből):
```bash
pnpm --filter @plantbase/db exec prisma migrate dev --name add_orders
```
Expected: `Your database is now in sync with your schema.` és egy új `packages/db/prisma/migrations/<timestamp>_add_orders/migration.sql` fájl jön létre `CREATE TABLE "orders"` és `CREATE TABLE "order_audit_log"` utasításokkal.

**KRITIKUS ellenőrzés:** nyisd meg a frissen generált `migration.sql`-t, és ellenőrizd, hogy NEM tartalmaz `DROP INDEX "knowledge_chunks_embedding_idx"` sort (lásd a Global Constraints figyelmeztetését). Ha mégis tartalmazza:
1. Töröld ki a `-- DropIndex` kommentet és a `DROP INDEX "knowledge_chunks_embedding_idx";` sort a migráció fájlból.
2. Ellenőrizd élőben, hogy az index létezik-e még: `SELECT indexname FROM pg_indexes WHERE indexname = 'knowledge_chunks_embedding_idx';` (pl. `psql`-lel vagy egy `tsx -e` szkripttel a Prisma kliens `$queryRawUnsafe`-jén keresztül). Ha hiányzik, hozd létre újra: `CREATE INDEX "knowledge_chunks_embedding_idx" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);`

- [ ] **Step 4: Prisma Client build-ellenőrzés**

Run: `pnpm exec nx run db:build`
Expected: sikeres build (a generált `PrismaClient` már ismeri az `order`/`orderAuditLog` modelleket).

- [ ] **Step 5: Smoke-teszt — insert/read/delete egy ideiglenes rendeléssel**

Run (repo gyökérből, ideiglenes szkript, NEM kerül a repóba — előbb hozz létre egy teszt-accountot, ha még nincs egy sem):
```bash
pnpm --filter @plantbase/db exec tsx -e "
import { prisma } from './src/lib/client.js'
const account = await prisma.account.create({ data: { fullName: 'Rendelés Teszt', salutation: 'Teszt', email: 'order-smoke-test@example.com', passwordHash: 'x', role: 'customer' } })
const order = await prisma.order.create({ data: { accountId: account.id, email: true, category: 'kaktusz' } })
console.log('created order', order.orderId, 'status', order.status)
const audit = await prisma.orderAuditLog.create({ data: { orderId: order.orderId, accountId: account.id, action: 'created', newData: order } })
console.log('created audit entry', audit.id)
await prisma.orderAuditLog.deleteMany({ where: { orderId: order.orderId } })
await prisma.order.delete({ where: { orderId: order.orderId } })
await prisma.account.delete({ where: { id: account.id } })
console.log('cleanup ok')
await prisma.\$disconnect()
"
```
Expected: `created order <id> status új`, `created audit entry <id>`, `cleanup ok` — hiba nélkül.

- [ ] **Step 6: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations
git commit -m "feat: add orders and order_audit_log tables"
```

---

## Task 2: `packages/core` — rendelési agent-tool-ok (`order-tools.ts`)

**Files:**
- Create: `packages/core/src/lib/order-tools.ts`
- Create: `packages/core/src/lib/order-tools.spec.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `CreateOrderInput`, `OrderSummary`, `OrderActions` interfészek, `buildOrderTools(actions: OrderActions): ToolSet`. Task 3 (`stream-agent.ts`) és Task 4 (`orders-store.ts`, a `@plantbase/core`-ból importálva) használja.

- [ ] **Step 1: Failing test — a 4 tool delegál az `actions`-höz**

```ts
// packages/core/src/lib/order-tools.spec.ts
import { buildOrderTools, type OrderActions } from './order-tools.js'

function mockActions(): OrderActions {
  return {
    createOrder: vi.fn(),
    cancelOrder: vi.fn(),
    listMyOrders: vi.fn(),
    getOrderByNumber: vi.fn(),
  }
}

describe('buildOrderTools', () => {
  it('createOrder delegates to actions.createOrder with the given input', async () => {
    const actions = mockActions()
    vi.mocked(actions.createOrder).mockResolvedValue({ orderId: 42 })
    const tools = buildOrderTools(actions)

    const result = await tools.createOrder.execute(
      { email: true, category: 'kaktusz' },
      { toolCallId: 't1', messages: [], context: {} },
    )

    expect(actions.createOrder).toHaveBeenCalledWith({
      email: true,
      category: 'kaktusz',
    })
    expect(result).toEqual({ orderId: 42 })
  })

  it('cancelOrder delegates to actions.cancelOrder with the order id', async () => {
    const actions = mockActions()
    vi.mocked(actions.cancelOrder).mockResolvedValue({ ok: true })
    const tools = buildOrderTools(actions)

    const result = await tools.cancelOrder.execute(
      { orderId: 7 },
      { toolCallId: 't2', messages: [], context: {} },
    )

    expect(actions.cancelOrder).toHaveBeenCalledWith(7)
    expect(result).toEqual({ ok: true })
  })

  it('listMyOrders delegates to actions.listMyOrders with the scope', async () => {
    const actions = mockActions()
    vi.mocked(actions.listMyOrders).mockResolvedValue({
      orders: [],
      tooMany: false,
    })
    const tools = buildOrderTools(actions)

    const result = await tools.listMyOrders.execute(
      { scope: 'active' },
      { toolCallId: 't3', messages: [], context: {} },
    )

    expect(actions.listMyOrders).toHaveBeenCalledWith('active')
    expect(result).toEqual({ orders: [], tooMany: false })
  })

  it('getOrderByNumber delegates to actions.getOrderByNumber with the order id', async () => {
    const actions = mockActions()
    vi.mocked(actions.getOrderByNumber).mockResolvedValue(null)
    const tools = buildOrderTools(actions)

    const result = await tools.getOrderByNumber.execute(
      { orderId: 99 },
      { toolCallId: 't4', messages: [], context: {} },
    )

    expect(actions.getOrderByNumber).toHaveBeenCalledWith(99)
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Teszt futtatása — bukik**

Run: `pnpm exec nx test core`
Expected: FAIL — `Cannot find module './order-tools.js'`.

- [ ] **Step 3: Implementáció**

```ts
// packages/core/src/lib/order-tools.ts
import { tool, type ToolSet } from 'ai'
import { z } from 'zod'

export interface CreateOrderInput {
  orderDesc?: string
  price?: number
  email: boolean
  category?: string
  location?: string
  light?: string
  watering?: string
  currentHeightCm?: number
  maxHeightCm?: number
  currentPotCm?: number
  petSafe?: boolean
  kidSafe?: boolean
  airPurifying?: boolean
}

export interface OrderSummary {
  orderId: number
  status: string
  orderDesc: string | null
  price: number | null
  payed: boolean
  email: boolean
  createdAt: string
}

export interface OrderActions {
  createOrder(input: CreateOrderInput): Promise<{ orderId: number }>
  cancelOrder(
    orderId: number,
  ): Promise<{ ok: true } | { ok: false; reason: string }>
  listMyOrders(
    scope: 'all' | 'active',
  ): Promise<{ orders: OrderSummary[]; tooMany: boolean }>
  getOrderByNumber(orderId: number): Promise<OrderSummary | null>
}

const CATEGORY_VALUES = [
  'szobanövény',
  'kerti',
  'pozsgás',
  'kaktusz',
  'fűszer',
  'fa-cserje',
  'lógó',
  'virágzó',
] as const
const LOCATION_VALUES = ['beltéri', 'kültéri', 'mindkettő'] as const
const LIGHT_VALUES = [
  'árnyék',
  'alacsony',
  'közepes',
  'erős',
  'direkt nap',
] as const
const WATERING_VALUES = [
  'ritka',
  'közepes',
  'gyakori',
  'állandóan nedves',
] as const

const CreateOrderInputSchema = z.object({
  orderDesc: z
    .string()
    .optional()
    .describe('Rövid, emberi olvasásra szánt összegzés a rendelésről.'),
  price: z.number().optional().describe('A megbeszélt teljes ár (HUF).'),
  email: z
    .boolean()
    .describe(
      'Kér-e e-mail-értesítést a rendelésről az ügyfél — ezt MINDIG meg kell kérdezni létrehozás előtt.',
    ),
  category: z.enum(CATEGORY_VALUES).optional(),
  location: z.enum(LOCATION_VALUES).optional(),
  light: z.enum(LIGHT_VALUES).optional(),
  watering: z.enum(WATERING_VALUES).optional(),
  currentHeightCm: z.number().optional(),
  maxHeightCm: z.number().optional(),
  currentPotCm: z.number().optional(),
  petSafe: z.boolean().optional(),
  kidSafe: z.boolean().optional(),
  airPurifying: z.boolean().optional(),
})

export function buildOrderTools(actions: OrderActions): ToolSet {
  return {
    createOrder: tool({
      description:
        'Új rendelés létrehozása a bejelentkezett ügyfél nevében. Csak azután hívd, hogy az ügyfél megerősítette, hogy rendelést szeretne indítani, ÉS megválaszolta, kér-e e-mail-értesítést.',
      inputSchema: CreateOrderInputSchema,
      execute: async (input) => actions.createOrder(input),
    }),
    cancelOrder: tool({
      description:
        'A bejelentkezett ügyfél saját, még nem teljesített/lemondott rendelésének lemondása.',
      inputSchema: z.object({
        orderId: z.number().describe('A lemondandó rendelés száma.'),
      }),
      execute: async ({ orderId }: { orderId: number }) =>
        actions.cancelOrder(orderId),
    }),
    listMyOrders: tool({
      description:
        'A bejelentkezett ügyfél rendeléseinek listázása. "all": az összes (max 5), "active": csak az aktív (új/folyamatban) rendelések (max 5).',
      inputSchema: z.object({
        scope: z.enum(['all', 'active']),
      }),
      execute: async ({ scope }: { scope: 'all' | 'active' }) =>
        actions.listMyOrders(scope),
    }),
    getOrderByNumber: tool({
      description:
        'A bejelentkezett ügyfél egy adott számú saját rendelésének lekérdezése.',
      inputSchema: z.object({
        orderId: z.number().describe('A lekérdezendő rendelés száma.'),
      }),
      execute: async ({ orderId }: { orderId: number }) =>
        actions.getOrderByNumber(orderId),
    }),
  }
}
```

- [ ] **Step 4: Teszt futtatása — zöld**

Run: `pnpm exec nx test core`
Expected: PASS mind a 4 esetre.

- [ ] **Step 5: Export hozzáadása az `index.ts`-hez**

```ts
// packages/core/src/index.ts — a meglévő export sorok közé, olvasható helyre
export * from './lib/order-tools.js'
```

- [ ] **Step 6: Lint + build**

Run: `pnpm exec nx run-many -t lint,build -p core`
Expected: hiba nélkül.

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat: add order management agent tools"
```

---

## Task 3: `packages/core` — `streamAgentResponse` bővítése + rendszer-prompt

**Files:**
- Modify: `packages/core/src/lib/stream-agent.ts`
- Modify: `packages/core/src/lib/stream-agent.spec.ts`
- Modify: `packages/core/src/lib/system-prompt.ts`
- Modify: `docs/system-prompt.md`

**Interfaces:**
- Consumes: `buildOrderTools`, `OrderActions` (Task 2).
- Produces: `StreamAgentOptions.orderActions?: OrderActions` — ha meg van adva, a rendelési tool-ok bekerülnek a tool-készletbe és a rendszer-prompt tartalmazza a rendelési viselkedési szabályokat; ha nincs, egyik sem. Task 6 (`apps/server/src/routes/chat.ts`) ezt a paramétert adja át.

- [ ] **Step 1: Failing test — order tool-ok csak `orderActions` esetén jelennek meg**

Egészítsd ki a meglévő `packages/core/src/lib/stream-agent.spec.ts`-t (a fájl teteje és a meglévő 2 teszt VÁLTOZATLAN marad) a `describe` blokk VÉGÉRE, a meglévő 2 `it` UTÁN:

```ts
  it('does not include order tools when orderActions is not provided', () => {
    streamAgentResponse([{ role: 'user' as const, content: 'Szia' }])

    const call = vi.mocked(streamText).mock.calls[0][0]
    expect(call.tools).not.toHaveProperty('createOrder')
  })

  it('includes order tools when orderActions is provided', () => {
    const orderActions = {
      createOrder: vi.fn(),
      cancelOrder: vi.fn(),
      listMyOrders: vi.fn(),
      getOrderByNumber: vi.fn(),
    }
    streamAgentResponse([{ role: 'user' as const, content: 'Szia' }], {
      orderActions,
    })

    const call = vi.mocked(streamText).mock.calls[0][0]
    expect(call.tools).toHaveProperty('createOrder')
    expect(call.tools).toHaveProperty('cancelOrder')
    expect(call.tools).toHaveProperty('listMyOrders')
    expect(call.tools).toHaveProperty('getOrderByNumber')
  })

  it('mentions order capability in the system prompt only when orderActions is provided', () => {
    streamAgentResponse([{ role: 'user' as const, content: 'Szia' }])
    const withoutOrders = vi.mocked(streamText).mock.calls[0][0]
    expect(withoutOrders.system).not.toContain('createOrder')

    vi.clearAllMocks()
    streamAgentResponse([{ role: 'user' as const, content: 'Szia' }], {
      orderActions: {
        createOrder: vi.fn(),
        cancelOrder: vi.fn(),
        listMyOrders: vi.fn(),
        getOrderByNumber: vi.fn(),
      },
    })
    const withOrders = vi.mocked(streamText).mock.calls[0][0]
    expect(withOrders.system).toContain('createOrder')
  })
```

- [ ] **Step 2: Teszt futtatása — bukik**

Run: `pnpm exec nx test core`
Expected: FAIL — a 3 új teszt bukik (order tool-ok/prompt-szöveg még nem léteznek).

- [ ] **Step 3: `docs/system-prompt.md` bővítése — a rendelési kiegészítés dokumentálása**

A `docs/system-prompt.md` VÉGÉRE, a meglévő ```` ```xml ... ``` ```` blokk UTÁN (attól elkülönítve, saját szekcióként) illeszd be:

````markdown

## Rendelés-képesség kiegészítés (opcionális — csak a streamelő, bejelentkezett web-útvonalon)

Ezt a blokkot a `streamAgentResponse` FŰZI HOZZÁ a fenti alap system prompthoz, amikor `orderActions` meg van adva (tehát SOSEM a CLI-n). Verbátim átvétel a `packages/core/src/lib/system-prompt.ts` `ORDER_PROMPT_ADDITION` konstansába.

```xml
<order_behavior>
- Ha az ügyfél rendelést szeretne indítani, ELŐSZÖR kérdezz vissza: valóban szeretne-e rendelést indítani. Csak megerősítés után kérdezz rá, hogy szeretne-e e-mail-értesítést kapni a rendelésről. Csak ezután hívd a createOrder tool-t.
- Rendelés-lekérdezésnél: ha a getOrderByNumber vagy listMyOrders eredménye egyetlen rendelést ad vissza, mondd el az adatait. Ha több rendelés van, kérdezd meg, melyikről kér információt. Ha a listMyOrders "tooMany": true-t ad, kérd meg az ügyfelet, hogy szűkítse a kérést (pl. rendelésszám megadásával).
- A "teljesítve" státuszt és a rendelési adatok javítását kizárólag ügyintéző végezheti — ha az ügyfél ezt kéri a chaten, udvariasan jelezd, hogy ehhez ügyintézőnek kell fordulnia.
</order_behavior>

<order_tools>
- createOrder(...): új rendelés létrehozása a bejelentkezett ügyfél nevében. Csak azután hívd, hogy megerősítette a rendelési szándékot és megválaszolta az e-mail-értesítés kérdését.
- cancelOrder(orderId): a bejelentkezett ügyfél saját, még nem teljesített/lemondott rendelésének lemondása.
- listMyOrders(scope): a bejelentkezett ügyfél rendeléseinek listázása ("all" vagy "active").
- getOrderByNumber(orderId): a bejelentkezett ügyfél egy adott számú saját rendelésének lekérdezése.
</order_tools>
```
````

- [ ] **Step 4: `system-prompt.ts` bővítése — `ORDER_PROMPT_ADDITION` + `buildSystemPrompt` frissítése**

A `packages/core/src/lib/system-prompt.ts`-ben a meglévő `SYSTEM_PROMPT` konstans VÁLTOZATLAN marad. Illeszd be UTÁNA (a `buildSystemPrompt` függvény ELÉ):

```ts
export const ORDER_PROMPT_ADDITION = `<order_behavior>
- Ha az ügyfél rendelést szeretne indítani, ELŐSZÖR kérdezz vissza: valóban szeretne-e rendelést indítani. Csak megerősítés után kérdezz rá, hogy szeretne-e e-mail-értesítést kapni a rendelésről. Csak ezután hívd a createOrder tool-t.
- Rendelés-lekérdezésnél: ha a getOrderByNumber vagy listMyOrders eredménye egyetlen rendelést ad vissza, mondd el az adatait. Ha több rendelés van, kérdezd meg, melyikről kér információt. Ha a listMyOrders "tooMany": true-t ad, kérd meg az ügyfelet, hogy szűkítse a kérést (pl. rendelésszám megadásával).
- A "teljesítve" státuszt és a rendelési adatok javítását kizárólag ügyintéző végezheti — ha az ügyfél ezt kéri a chaten, udvariasan jelezd, hogy ehhez ügyintézőnek kell fordulnia.
</order_behavior>

<order_tools>
- createOrder(...): új rendelés létrehozása a bejelentkezett ügyfél nevében. Csak azután hívd, hogy megerősítette a rendelési szándékot és megválaszolta az e-mail-értesítés kérdését.
- cancelOrder(orderId): a bejelentkezett ügyfél saját, még nem teljesített/lemondott rendelésének lemondása.
- listMyOrders(scope): a bejelentkezett ügyfél rendeléseinek listázása ("all" vagy "active").
- getOrderByNumber(orderId): a bejelentkezett ügyfél egy adott számú saját rendelésének lekérdezése.
</order_tools>`
```

Módosítsd a `buildSystemPrompt` függvényt, hogy elfogadjon egy opcionális második paramétert:

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

- [ ] **Step 5: `stream-agent.ts` bővítése**

```ts
// packages/core/src/lib/stream-agent.ts
import { anthropic } from '@ai-sdk/anthropic'
import { streamText, stepCountIs, type ModelMessage } from 'ai'
import { AGENT_MODEL, MAX_TOOL_ROUNDS, buildAgentTools } from './agent-tools.js'
import { buildOrderTools, type OrderActions } from './order-tools.js'
import { buildSystemPrompt } from './system-prompt.js'
import type { RetrievalTrace } from './logger.js'

export interface StreamAgentOptions {
  salutation?: string
  orderActions?: OrderActions
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
  }
  const stream = streamText({
    model: anthropic(AGENT_MODEL),
    system: buildSystemPrompt(options.salutation, Boolean(options.orderActions)),
    messages,
    stopWhen: stepCountIs(MAX_TOOL_ROUNDS),
    tools,
  })
  return { stream, trace }
}
```

- [ ] **Step 6: Teszt futtatása — zöld**

Run: `pnpm exec nx test core`
Expected: PASS mind az 5 (2 meglévő + 3 új) `stream-agent.spec.ts` esetre, és a meglévő `system-prompt.spec.ts` 2, korábban is zöld esete változatlanul zöld (a 3. eset, a CRLF-hiba, továbbra is a már ismert, ehhez a munkához nem tartozó okból bukik — ez nem regresszió).

- [ ] **Step 7: Lint + build**

Run: `pnpm exec nx run-many -t lint,build -p core`
Expected: hiba nélkül.

- [ ] **Step 8: Commit**

```bash
git add packages/core docs/system-prompt.md
git commit -m "feat: wire order tools into the streaming agent with conditional system prompt"
```

---

## Task 4: `apps/server` — `orders-store.ts` (Prisma CRUD + audit-napló)

**Files:**
- Create: `apps/server/src/lib/orders-store.ts`
- Create: `apps/server/src/lib/orders-store.spec.ts`

**Interfaces:**
- Consumes: `prisma` (`@plantbase/db`), `CreateOrderInput`/`OrderActions`/`OrderSummary` (Task 2, `@plantbase/core`).
- Produces: `buildOrderActionsForAccount(accountId: number): OrderActions` (Task 6 használja a `chat.ts`-ben); `StaffOrderDetail` interfész, `AuditEntry` interfész, `listOrdersForStaff(status?: string): Promise<StaffOrderDetail[]>`, `getOrderForStaff(orderId: number): Promise<{ order: StaffOrderDetail; auditLog: AuditEntry[] } | null>`, `updateOrderStatus(actorAccountId: number, orderId: number, patch: { status?: string; payed?: boolean }): Promise<StaffOrderDetail | null>`, `correctOrder(actorAccountId: number, orderId: number, patch: Record<string, unknown>): Promise<StaffOrderDetail | null>` — Task 7 (`staff-orders.ts`) ezeket hívja.

- [ ] **Step 1: Failing test (Prisma mockolva) — `buildOrderActionsForAccount`**

```ts
// apps/server/src/lib/orders-store.spec.ts
import { prisma } from '@plantbase/db'
import {
  buildOrderActionsForAccount,
  listOrdersForStaff,
  getOrderForStaff,
  updateOrderStatus,
  correctOrder,
} from './orders-store.js'

vi.mock('@plantbase/db', () => ({
  prisma: {
    order: {
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    orderAuditLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        order: {
          create: vi.fn(),
          update: vi.fn(),
        },
        orderAuditLog: { create: vi.fn() },
      }),
    ),
  },
}))

const NOW = new Date('2026-08-18T10:00:00.000Z')

function fakeOrder(overrides: Record<string, unknown> = {}) {
  return {
    orderId: 1,
    accountId: 5,
    status: 'új',
    orderDesc: 'Egy kaktusz',
    price: 4990,
    payed: false,
    email: true,
    category: 'kaktusz',
    location: null,
    light: null,
    watering: null,
    currentHeightCm: null,
    maxHeightCm: null,
    currentPotCm: null,
    petSafe: null,
    kidSafe: null,
    airPurifying: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  }
}

describe('buildOrderActionsForAccount', () => {
  beforeEach(() => vi.clearAllMocks())

  it('createOrder creates an order scoped to the account and returns its id', async () => {
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        order: { create: vi.fn().mockResolvedValue(fakeOrder({ orderId: 42 })) },
        orderAuditLog: { create: vi.fn() },
      }
      return (fn as (t: typeof tx) => unknown)(tx)
    })
    const actions = buildOrderActionsForAccount(5)

    const result = await actions.createOrder({ email: true, category: 'kaktusz' })

    expect(result).toEqual({ orderId: 42 })
  })

  it('cancelOrder refuses to cancel an order belonging to another account', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(
      fakeOrder({ accountId: 999 }) as never,
    )
    const actions = buildOrderActionsForAccount(5)

    const result = await actions.cancelOrder(1)

    expect(result).toEqual({ ok: false, reason: 'Nem található ilyen rendelés.' })
  })

  it('cancelOrder refuses to cancel an already completed order', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(
      fakeOrder({ status: 'teljesítve' }) as never,
    )
    const actions = buildOrderActionsForAccount(5)

    const result = await actions.cancelOrder(1)

    expect(result).toEqual({
      ok: false,
      reason: 'Ez a rendelés már nem mondható le.',
    })
  })

  it('cancelOrder cancels an own new/in-progress order', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(fakeOrder() as never)
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        order: {
          update: vi.fn().mockResolvedValue(fakeOrder({ status: 'lemondva' })),
        },
        orderAuditLog: { create: vi.fn() },
      }
      return (fn as (t: typeof tx) => unknown)(tx)
    })
    const actions = buildOrderActionsForAccount(5)

    const result = await actions.cancelOrder(1)

    expect(result).toEqual({ ok: true })
  })

  it('listMyOrders only returns orders for the given account and caps at 5', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => fakeOrder({ orderId: i + 1 })) as never,
    )
    const actions = buildOrderActionsForAccount(5)

    const result = await actions.listMyOrders('all')

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { accountId: 5 } }),
    )
    expect(result.orders).toHaveLength(5)
    expect(result.tooMany).toBe(true)
  })

  it('listMyOrders with scope active filters by status', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([fakeOrder()] as never)
    const actions = buildOrderActionsForAccount(5)

    await actions.listMyOrders('active')

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId: 5, status: { in: ['új', 'folyamatban'] } },
      }),
    )
  })

  it('getOrderByNumber returns null for an order belonging to another account', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(
      fakeOrder({ accountId: 999 }) as never,
    )
    const actions = buildOrderActionsForAccount(5)

    const result = await actions.getOrderByNumber(1)

    expect(result).toBeNull()
  })

  it('getOrderByNumber returns the summary for the caller\'s own order', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(fakeOrder() as never)
    const actions = buildOrderActionsForAccount(5)

    const result = await actions.getOrderByNumber(1)

    expect(result).toEqual(
      expect.objectContaining({ orderId: 1, status: 'új' }),
    )
  })
})

describe('staff functions', () => {
  beforeEach(() => vi.clearAllMocks())

  it('listOrdersForStaff returns all orders when no status filter given', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([fakeOrder()] as never)

    const result = await listOrdersForStaff()

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    )
    expect(result).toHaveLength(1)
  })

  it('getOrderForStaff returns null for a nonexistent order', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(null)

    const result = await getOrderForStaff(999)

    expect(result).toBeNull()
  })

  it('getOrderForStaff returns the order and its audit log', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(fakeOrder() as never)
    vi.mocked(prisma.orderAuditLog.findMany).mockResolvedValue([
      {
        id: 1,
        orderId: 1,
        accountId: 5,
        action: 'created',
        previousData: null,
        newData: fakeOrder(),
        createdAt: NOW,
      },
    ] as never)

    const result = await getOrderForStaff(1)

    expect(result?.order.orderId).toBe(1)
    expect(result?.auditLog).toHaveLength(1)
  })

  it('updateOrderStatus writes an audit entry and returns the updated order', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(fakeOrder() as never)
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        order: {
          update: vi.fn().mockResolvedValue(fakeOrder({ status: 'teljesítve' })),
        },
        orderAuditLog: { create: vi.fn() },
      }
      return (fn as (t: typeof tx) => unknown)(tx)
    })

    const result = await updateOrderStatus(9, 1, { status: 'teljesítve' })

    expect(result?.status).toBe('teljesítve')
  })

  it('correctOrder writes an audit entry and returns the updated order', async () => {
    vi.mocked(prisma.order.findUnique).mockResolvedValue(fakeOrder() as never)
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: unknown) => {
      const tx = {
        order: {
          update: vi.fn().mockResolvedValue(fakeOrder({ orderDesc: 'Javított leírás' })),
        },
        orderAuditLog: { create: vi.fn() },
      }
      return (fn as (t: typeof tx) => unknown)(tx)
    })

    const result = await correctOrder(9, 1, { orderDesc: 'Javított leírás' })

    expect(result?.orderDesc).toBe('Javított leírás')
  })
})
```

- [ ] **Step 2: Teszt futtatása — bukik**

Run: `pnpm exec nx test server`
Expected: FAIL — a modul nem létezik.

- [ ] **Step 3: Implementáció**

```ts
// apps/server/src/lib/orders-store.ts
import { prisma } from '@plantbase/db'
import type {
  CreateOrderInput,
  OrderActions,
  OrderSummary,
} from '@plantbase/core'

const MAX_LIST_RESULTS = 5
const CANCELLABLE_STATUSES = ['új', 'folyamatban']

interface OrderRow {
  orderId: number
  accountId: number
  status: string
  orderDesc: string | null
  price: unknown
  payed: boolean
  email: boolean
  category: string | null
  location: string | null
  light: string | null
  watering: string | null
  currentHeightCm: number | null
  maxHeightCm: number | null
  currentPotCm: number | null
  petSafe: boolean | null
  kidSafe: boolean | null
  airPurifying: boolean | null
  createdAt: Date
  updatedAt: Date
}

export interface StaffOrderDetail extends OrderSummary {
  accountId: number
  category: string | null
  location: string | null
  light: string | null
  watering: string | null
  currentHeightCm: number | null
  maxHeightCm: number | null
  currentPotCm: number | null
  petSafe: boolean | null
  kidSafe: boolean | null
  airPurifying: boolean | null
  updatedAt: string
}

export interface AuditEntry {
  id: number
  accountId: number
  action: string
  previousData: unknown
  newData: unknown
  createdAt: string
}

function toSummary(order: OrderRow): OrderSummary {
  return {
    orderId: order.orderId,
    status: order.status,
    orderDesc: order.orderDesc,
    price: order.price === null ? null : Number(order.price),
    payed: order.payed,
    email: order.email,
    createdAt: order.createdAt.toISOString(),
  }
}

function toStaffDetail(order: OrderRow): StaffOrderDetail {
  return {
    ...toSummary(order),
    accountId: order.accountId,
    category: order.category,
    location: order.location,
    light: order.light,
    watering: order.watering,
    currentHeightCm: order.currentHeightCm,
    maxHeightCm: order.maxHeightCm,
    currentPotCm: order.currentPotCm,
    petSafe: order.petSafe,
    kidSafe: order.kidSafe,
    airPurifying: order.airPurifying,
    updatedAt: order.updatedAt.toISOString(),
  }
}

export function buildOrderActionsForAccount(accountId: number): OrderActions {
  return {
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
      return { orderId: order.orderId }
    },

    async cancelOrder(orderId: number) {
      const existing = (await prisma.order.findUnique({
        where: { orderId },
      })) as OrderRow | null
      if (!existing || existing.accountId !== accountId) {
        return { ok: false, reason: 'Nem található ilyen rendelés.' }
      }
      if (!CANCELLABLE_STATUSES.includes(existing.status)) {
        return { ok: false, reason: 'Ez a rendelés már nem mondható le.' }
      }
      await prisma.$transaction(async (tx) => {
        const updated = await tx.order.update({
          where: { orderId },
          data: { status: 'lemondva' },
        })
        await tx.orderAuditLog.create({
          data: {
            orderId,
            accountId,
            action: 'cancelled',
            previousData: existing,
            newData: updated,
          },
        })
      })
      return { ok: true }
    },

    async listMyOrders(scope: 'all' | 'active') {
      const where =
        scope === 'active'
          ? { accountId, status: { in: ['új', 'folyamatban'] } }
          : { accountId }
      const orders = (await prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: MAX_LIST_RESULTS + 1,
      })) as OrderRow[]
      const tooMany = orders.length > MAX_LIST_RESULTS
      return {
        orders: orders.slice(0, MAX_LIST_RESULTS).map(toSummary),
        tooMany,
      }
    },

    async getOrderByNumber(orderId: number) {
      const order = (await prisma.order.findUnique({
        where: { orderId },
      })) as OrderRow | null
      if (!order || order.accountId !== accountId) return null
      return toSummary(order)
    },
  }
}

export async function listOrdersForStaff(
  status?: string,
): Promise<StaffOrderDetail[]> {
  const orders = (await prisma.order.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 50,
  })) as OrderRow[]
  return orders.map(toStaffDetail)
}

export async function getOrderForStaff(
  orderId: number,
): Promise<{ order: StaffOrderDetail; auditLog: AuditEntry[] } | null> {
  const order = (await prisma.order.findUnique({
    where: { orderId },
  })) as OrderRow | null
  if (!order) return null
  const auditLog = await prisma.orderAuditLog.findMany({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
  })
  return {
    order: toStaffDetail(order),
    auditLog: auditLog.map((entry) => ({
      id: entry.id,
      accountId: entry.accountId,
      action: entry.action,
      previousData: entry.previousData,
      newData: entry.newData,
      createdAt: entry.createdAt.toISOString(),
    })),
  }
}

export async function updateOrderStatus(
  actorAccountId: number,
  orderId: number,
  patch: { status?: string; payed?: boolean },
): Promise<StaffOrderDetail | null> {
  const existing = (await prisma.order.findUnique({
    where: { orderId },
  })) as OrderRow | null
  if (!existing) return null
  const updated = (await prisma.$transaction(async (tx) => {
    const result = await tx.order.update({ where: { orderId }, data: patch })
    await tx.orderAuditLog.create({
      data: {
        orderId,
        accountId: actorAccountId,
        action: 'status_changed',
        previousData: existing,
        newData: result,
      },
    })
    return result
  })) as OrderRow
  return toStaffDetail(updated)
}

export async function correctOrder(
  actorAccountId: number,
  orderId: number,
  patch: Record<string, unknown>,
): Promise<StaffOrderDetail | null> {
  const existing = (await prisma.order.findUnique({
    where: { orderId },
  })) as OrderRow | null
  if (!existing) return null
  const updated = (await prisma.$transaction(async (tx) => {
    const result = await tx.order.update({ where: { orderId }, data: patch })
    await tx.orderAuditLog.create({
      data: {
        orderId,
        accountId: actorAccountId,
        action: 'corrected',
        previousData: existing,
        newData: result,
      },
    })
    return result
  })) as OrderRow
  return toStaffDetail(updated)
}
```

- [ ] **Step 4: Teszt futtatása — zöld**

Run: `pnpm exec nx test server`
Expected: PASS mind a 14 esetre.

- [ ] **Step 5: Lint + build**

Run: `pnpm exec nx run-many -t lint,build -p server`
Expected: hiba nélkül. (`@plantbase/core` már nem szerepel az `apps/server/eslint.config.mjs` `ignoredDependencies` listáján — az A al-projekt végére ez a lista kiürült; ha bármi okból mégis szerepelne benne, távolítsd el.)

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/lib/orders-store.ts apps/server/src/lib/orders-store.spec.ts
git commit -m "feat: add orders store with account-scoped actions and audit logging"
```

---

## Task 5: `apps/server` — szerepkör middleware (`requireRole`)

**Files:**
- Create: `apps/server/src/middleware/role.ts`
- Create: `apps/server/src/middleware/role.spec.ts`

**Interfaces:**
- Consumes: `req.account` (Task 7-es A al-projekt middleware-e, `SessionAccount.role`).
- Produces: `requireRole(...roles: string[])` — Express middleware factory, 403-at ad, ha `req.account` hiányzik VAGY a szerepköre nincs a listában. Task 7 minden staff route-ja `requireAccount` UTÁN ezt is használja.

- [ ] **Step 1: Failing test**

```ts
// apps/server/src/middleware/role.spec.ts
import type { Request, Response } from 'express'
import { requireRole } from './role.js'

function mockReqRes(account?: { role: string }) {
  const req = { account } as unknown as Request
  const json = vi.fn()
  const status = vi.fn().mockReturnValue({ json })
  const res = { status } as unknown as Response
  const next = vi.fn()
  return { req, res, next, json, status }
}

describe('requireRole', () => {
  it('calls next when the account has one of the allowed roles', () => {
    const { req, res, next } = mockReqRes({ role: 'staff' })

    requireRole('staff', 'admin')(req, res, next)

    expect(next).toHaveBeenCalledOnce()
  })

  it('responds 403 when the account role is not allowed', () => {
    const { req, res, next, status, json } = mockReqRes({ role: 'customer' })

    requireRole('staff', 'admin')(req, res, next)

    expect(status).toHaveBeenCalledWith(403)
    expect(json).toHaveBeenCalledWith({
      error: 'Nincs jogosultságod ehhez a művelethez.',
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('responds 403 when there is no account at all', () => {
    const { req, res, next, status } = mockReqRes(undefined)

    requireRole('staff', 'admin')(req, res, next)

    expect(status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Teszt futtatása — bukik**

Run: `pnpm exec nx test server`
Expected: FAIL — a modul nem létezik.

- [ ] **Step 3: Implementáció**

```ts
// apps/server/src/middleware/role.ts
import type { NextFunction, Request, Response } from 'express'

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.account || !roles.includes(req.account.role)) {
      res.status(403).json({ error: 'Nincs jogosultságod ehhez a művelethez.' })
      return
    }
    next()
  }
}
```

- [ ] **Step 4: Teszt futtatása — zöld**

Run: `pnpm exec nx test server`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/middleware/role.ts apps/server/src/middleware/role.spec.ts
git commit -m "feat: add requireRole middleware"
```

---

## Task 6: `apps/server` — `chat.ts` bekötése az `OrderActions`-szal

**Files:**
- Modify: `apps/server/src/routes/chat.ts`
- Modify: `apps/server/src/routes/chat.spec.ts`

**Interfaces:**
- Consumes: `buildOrderActionsForAccount` (Task 4), `streamAgentResponse` bővített `StreamAgentOptions.orderActions` (Task 3).
- Produces: a `/api/chat` végpont mostantól minden bejelentkezett kérésnél átadja a hívó fiókjához szkópolt `OrderActions`-t.

- [ ] **Step 1: Failing test — `orderActions` átadása**

Egészítsd ki a meglévő `apps/server/src/routes/chat.spec.ts`-t. Első lépésként add hozzá a mock-hoz:

```ts
vi.mock('../lib/orders-store.js', () => ({
  buildOrderActionsForAccount: vi.fn(() => ({ mocked: true })),
}))
```

(a fájl tetején, a többi `vi.mock` hívás mellé), majd a meglévő `describe('POST /api/chat', ...)` blokkba illessz be egy új `it`-et:

```ts
  it('passes account-scoped order actions to streamAgentResponse', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue({
      id: 1,
      fullName: 'Kovács Béla',
      salutation: 'Béla',
      email: 'bela@example.com',
      role: 'customer',
    })
    vi.mocked(streamAgentResponse).mockReturnValue({
      stream: {
        pipeUIMessageStreamToResponse: (res: { end: () => void }) => {
          res.end()
          return Promise.resolve()
        },
      },
      trace: { generatedSql: [], retrieval: [] },
    } as never)

    await request(createApp())
      .post('/api/chat')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok123`])
      .send({ messages: [{ role: 'user', parts: [{ type: 'text', text: 'Szia' }] }] })

    const [, options] = vi.mocked(streamAgentResponse).mock.calls[0]
    expect(options).toEqual(
      expect.objectContaining({ salutation: 'Béla', orderActions: { mocked: true } }),
    )
    expect(buildOrderActionsForAccount).toHaveBeenCalledWith(1)
  })
```

Ellenőrizd, hogy `buildOrderActionsForAccount` importálva van a spec fájl tetején: `import { buildOrderActionsForAccount } from '../lib/orders-store.js'`.

- [ ] **Step 2: Teszt futtatása — bukik**

Run: `pnpm exec nx test server`
Expected: FAIL — az `orderActions` mező hiányzik a `streamAgentResponse` hívásból.

- [ ] **Step 3: Implementáció**

```ts
// apps/server/src/routes/chat.ts
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
  // A `pipeUIMessageStreamToResponse` Promise<void>-ot ad vissza (és az
  // `ai@7.0.66`-ban @deprecated, a következő major verzióban eltávolítják).
  // Ha a promise elutasul és ez kezeletlen marad, Node alapértelmezett
  // `--unhandled-rejections=throw` beállítása az EGÉSZ szervert leállítja,
  // nem csak ezt a kérést — ezért a `next`-nek adjuk a hibát, hogy a
  // globális `errorHandler` (app.ts) kezelje.
  void stream.pipeUIMessageStreamToResponse(res).catch(next)
})
```

- [ ] **Step 4: Teszt futtatása — zöld**

Run: `pnpm exec nx test server`
Expected: PASS, a meglévő 3 + az új 1 eset is.

- [ ] **Step 5: Lint + build**

Run: `pnpm exec nx run-many -t lint,build -p server`
Expected: hiba nélkül.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/routes/chat.ts apps/server/src/routes/chat.spec.ts
git commit -m "feat: wire account-scoped order actions into the chat route"
```

---

## Task 7: `apps/server` — staff-only rendelés REST végpontok

**Files:**
- Create: `apps/server/src/routes/staff-orders.ts`
- Create: `apps/server/src/routes/staff-orders.spec.ts`
- Modify: `apps/server/src/app.ts`

**Interfaces:**
- Consumes: `listOrdersForStaff`, `getOrderForStaff`, `updateOrderStatus`, `correctOrder` (Task 4); `requireAccount` (A al-projekt); `requireRole` (Task 5).
- Produces: `staffOrdersRouter: Router` — `GET /api/staff/orders`, `GET /api/staff/orders/:id`, `PATCH /api/staff/orders/:id/status`, `PATCH /api/staff/orders/:id`, mind `requireAccount` + `requireRole('staff', 'admin')` védett. Task 9-10 (web staff felület) ezeket hívja.

- [ ] **Step 1: Failing test (a store-függvények mockolva, supertest az Express appon, 401/403/200 minden végpontra)**

```ts
// apps/server/src/routes/staff-orders.spec.ts
import request from 'supertest'
import { createApp } from '../app.js'
import { getAccountBySessionToken } from '../lib/session-store.js'
import { SESSION_COOKIE_NAME } from '../middleware/session.js'
import {
  listOrdersForStaff,
  getOrderForStaff,
  updateOrderStatus,
  correctOrder,
} from '../lib/orders-store.js'

vi.mock('../lib/session-store.js', () => ({
  getAccountBySessionToken: vi.fn(),
}))
vi.mock('@plantbase/core', () => ({
  streamAgentResponse: vi.fn(),
  searchKnowledge: vi.fn(),
}))
vi.mock('../lib/orders-store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/orders-store.js')>()
  return {
    ...actual,
    listOrdersForStaff: vi.fn(),
    getOrderForStaff: vi.fn(),
    updateOrderStatus: vi.fn(),
    correctOrder: vi.fn(),
    buildOrderActionsForAccount: vi.fn(),
  }
})

const CUSTOMER_ACCOUNT = {
  id: 1,
  fullName: 'X',
  salutation: 'X',
  email: 'x@example.com',
  role: 'customer',
}
const STAFF_ACCOUNT = {
  id: 2,
  fullName: 'Y',
  salutation: 'Y',
  email: 'y@example.com',
  role: 'staff',
}

describe('GET /api/staff/orders', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const response = await request(createApp()).get('/api/staff/orders')
    expect(response.status).toBe(401)
  })

  it('returns 403 for a customer account', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(CUSTOMER_ACCOUNT)
    const response = await request(createApp())
      .get('/api/staff/orders')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
    expect(response.status).toBe(403)
  })

  it('returns the order list for a staff account', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(STAFF_ACCOUNT)
    vi.mocked(listOrdersForStaff).mockResolvedValue([])
    const response = await request(createApp())
      .get('/api/staff/orders')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ orders: [] })
  })

  it('passes the status query parameter through to the store', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(STAFF_ACCOUNT)
    vi.mocked(listOrdersForStaff).mockResolvedValue([])
    await request(createApp())
      .get('/api/staff/orders?status=teljesítve')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
    expect(listOrdersForStaff).toHaveBeenCalledWith('teljesítve')
  })
})

describe('GET /api/staff/orders/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 for a nonexistent order', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(STAFF_ACCOUNT)
    vi.mocked(getOrderForStaff).mockResolvedValue(null)
    const response = await request(createApp())
      .get('/api/staff/orders/999')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
    expect(response.status).toBe(404)
  })

  it('returns the order and audit log for a staff account', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(STAFF_ACCOUNT)
    vi.mocked(getOrderForStaff).mockResolvedValue({
      order: { orderId: 1 } as never,
      auditLog: [],
    })
    const response = await request(createApp())
      .get('/api/staff/orders/1')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
    expect(response.status).toBe(200)
  })
})

describe('PATCH /api/staff/orders/:id/status', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 for a customer account', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(CUSTOMER_ACCOUNT)
    const response = await request(createApp())
      .patch('/api/staff/orders/1/status')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
      .send({ status: 'teljesítve' })
    expect(response.status).toBe(403)
  })

  it('returns 400 for an invalid status value', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(STAFF_ACCOUNT)
    const response = await request(createApp())
      .patch('/api/staff/orders/1/status')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
      .send({ status: 'nemletezo' })
    expect(response.status).toBe(400)
  })

  it('updates status for a staff account', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(STAFF_ACCOUNT)
    vi.mocked(updateOrderStatus).mockResolvedValue({ orderId: 1, status: 'teljesítve' } as never)
    const response = await request(createApp())
      .patch('/api/staff/orders/1/status')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
      .send({ status: 'teljesítve', payed: true })
    expect(response.status).toBe(200)
    expect(updateOrderStatus).toHaveBeenCalledWith(2, 1, { status: 'teljesítve', payed: true })
  })
})

describe('PATCH /api/staff/orders/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 for a customer account', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(CUSTOMER_ACCOUNT)
    const response = await request(createApp())
      .patch('/api/staff/orders/1')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
      .send({ orderDesc: 'Javítás' })
    expect(response.status).toBe(403)
  })

  it('corrects a field for a staff account', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(STAFF_ACCOUNT)
    vi.mocked(correctOrder).mockResolvedValue({ orderId: 1, orderDesc: 'Javítás' } as never)
    const response = await request(createApp())
      .patch('/api/staff/orders/1')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
      .send({ orderDesc: 'Javítás' })
    expect(response.status).toBe(200)
    expect(correctOrder).toHaveBeenCalledWith(2, 1, { orderDesc: 'Javítás' })
  })
})
```

- [ ] **Step 2: Teszt futtatása — bukik**

Run: `pnpm exec nx test server`
Expected: FAIL — a `staff-orders.ts` route modul nem létezik.

- [ ] **Step 3: Implementáció**

```ts
// apps/server/src/routes/staff-orders.ts
import { Router } from 'express'
import { z } from 'zod'
import { requireAccount } from '../middleware/session.js'
import { requireRole } from '../middleware/role.js'
import {
  listOrdersForStaff,
  getOrderForStaff,
  updateOrderStatus,
  correctOrder,
} from '../lib/orders-store.js'

const STATUS_VALUES = ['új', 'folyamatban', 'lemondva', 'teljesítve'] as const
const CATEGORY_VALUES = [
  'szobanövény',
  'kerti',
  'pozsgás',
  'kaktusz',
  'fűszer',
  'fa-cserje',
  'lógó',
  'virágzó',
] as const
const LOCATION_VALUES = ['beltéri', 'kültéri', 'mindkettő'] as const
const LIGHT_VALUES = [
  'árnyék',
  'alacsony',
  'közepes',
  'erős',
  'direkt nap',
] as const
const WATERING_VALUES = [
  'ritka',
  'közepes',
  'gyakori',
  'állandóan nedves',
] as const

const StatusUpdateSchema = z.object({
  status: z.enum(STATUS_VALUES).optional(),
  payed: z.boolean().optional(),
})

const OrderCorrectionSchema = z.object({
  orderDesc: z.string().optional(),
  price: z.number().optional(),
  category: z.enum(CATEGORY_VALUES).optional(),
  location: z.enum(LOCATION_VALUES).optional(),
  light: z.enum(LIGHT_VALUES).optional(),
  watering: z.enum(WATERING_VALUES).optional(),
  currentHeightCm: z.number().optional(),
  maxHeightCm: z.number().optional(),
  currentPotCm: z.number().optional(),
  petSafe: z.boolean().optional(),
  kidSafe: z.boolean().optional(),
  airPurifying: z.boolean().optional(),
})

function parseOrderId(raw: string): number | null {
  const orderId = Number(raw)
  return Number.isInteger(orderId) ? orderId : null
}

export const staffOrdersRouter: Router = Router()

staffOrdersRouter.get(
  '/api/staff/orders',
  requireAccount,
  requireRole('staff', 'admin'),
  async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined
    const orders = await listOrdersForStaff(status)
    res.status(200).json({ orders })
  },
)

staffOrdersRouter.get(
  '/api/staff/orders/:id',
  requireAccount,
  requireRole('staff', 'admin'),
  async (req, res) => {
    const orderId = parseOrderId(req.params.id)
    if (orderId === null) {
      res.status(400).json({ error: 'Érvénytelen rendelésszám.' })
      return
    }
    const result = await getOrderForStaff(orderId)
    if (!result) {
      res.status(404).json({ error: 'Nem található ilyen rendelés.' })
      return
    }
    res.status(200).json(result)
  },
)

staffOrdersRouter.patch(
  '/api/staff/orders/:id/status',
  requireAccount,
  requireRole('staff', 'admin'),
  async (req, res) => {
    const orderId = parseOrderId(req.params.id)
    if (orderId === null) {
      res.status(400).json({ error: 'Érvénytelen rendelésszám.' })
      return
    }
    const parsed = StatusUpdateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message })
      return
    }
    // requireAccount + requireRole már biztosította, hogy req.account létezik.
    const updated = await updateOrderStatus(req.account!.id, orderId, parsed.data)
    if (!updated) {
      res.status(404).json({ error: 'Nem található ilyen rendelés.' })
      return
    }
    res.status(200).json(updated)
  },
)

staffOrdersRouter.patch(
  '/api/staff/orders/:id',
  requireAccount,
  requireRole('staff', 'admin'),
  async (req, res) => {
    const orderId = parseOrderId(req.params.id)
    if (orderId === null) {
      res.status(400).json({ error: 'Érvénytelen rendelésszám.' })
      return
    }
    const parsed = OrderCorrectionSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message })
      return
    }
    const updated = await correctOrder(req.account!.id, orderId, parsed.data)
    if (!updated) {
      res.status(404).json({ error: 'Nem található ilyen rendelés.' })
      return
    }
    res.status(200).json(updated)
  },
)
```

- [ ] **Step 4: Bekötés az `app.ts`-be**

```ts
// apps/server/src/app.ts
import { staffOrdersRouter } from './routes/staff-orders.js'
// ... app.use(debugRouter) UTÁN, app.use(errorHandler) ELŐTT:
app.use(staffOrdersRouter)
```

- [ ] **Step 5: Teszt futtatása — zöld**

Run: `pnpm exec nx test server`
Expected: PASS mind a 10 új esetre + a meglévő regresszió is zöld.

- [ ] **Step 6: Lint + build**

Run: `pnpm exec nx run-many -t lint,build -p server`
Expected: hiba nélkül.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/routes/staff-orders.ts apps/server/src/routes/staff-orders.spec.ts apps/server/src/app.ts
git commit -m "feat: add staff-only order management REST endpoints"
```

---

## Task 8: `packages/db` — staff/admin teszt-fiók seed

**Files:**
- Create: `packages/db/prisma/seed-staff.ts`
- Modify: `packages/db/package.json` (új dependency: `bcryptjs`)

**Interfaces:** nincs — önálló, egyszer futtatandó szkript, az A spec 8. pontjában B-re halasztott igényt oldja meg.

- [ ] **Step 1: `bcryptjs` hozzáadása a `packages/db` függőségeihez**

```bash
pnpm --filter @plantbase/db add bcryptjs
```
Ha `allowBuilds` jóváhagyást kér, töltsd ki `true`-ra a `pnpm-workspace.yaml`-ban (bcryptjs pure JS, valószínűleg nem lesz szükség rá, de ha mégis, kövesd a meglévő mintát).

- [ ] **Step 2: Seed-szkript**

```ts
// packages/db/prisma/seed-staff.ts
// Teszt staff/admin fiókokat hoz létre a B al-projekt (rendelés-alrendszer)
// ügyintézői felületének teszteléséhez.
// Futtatás: `pnpm --filter @plantbase/db exec tsx prisma/seed-staff.ts`
// Idempotens: ha a fiók már létezik (email alapján), kihagyja.

import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const SALT_ROUNDS = 12

const SEED_ACCOUNTS = [
  {
    fullName: 'Teszt Ügyintéző',
    salutation: 'Ügyintéző',
    email: 'staff@plantbase.hu',
    password: 'Staff1234',
    role: 'staff',
  },
  {
    fullName: 'Teszt Üzemeltető',
    salutation: 'Üzemeltető',
    email: 'admin@plantbase.hu',
    password: 'Admin1234',
    role: 'admin',
  },
]

async function main() {
  for (const account of SEED_ACCOUNTS) {
    const existing = await prisma.account.findUnique({
      where: { email: account.email },
    })
    if (existing) {
      console.log(`Már létezik: ${account.email}, kihagyva.`)
      continue
    }
    const passwordHash = await bcrypt.hash(account.password, SALT_ROUNDS)
    await prisma.account.create({
      data: {
        fullName: account.fullName,
        salutation: account.salutation,
        email: account.email,
        passwordHash,
        role: account.role,
      },
    })
    console.log(
      `Létrehozva: ${account.email} (${account.role}), jelszó: ${account.password}`,
    )
  }
}

main()
  .catch((e) => {
    console.error('Staff seed hiba:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

- [ ] **Step 3: Futtatás és ellenőrzés**

Run:
```bash
pnpm --filter @plantbase/db exec tsx prisma/seed-staff.ts
```
Expected: `Létrehozva: staff@plantbase.hu (staff), jelszó: Staff1234` és `Létrehozva: admin@plantbase.hu (admin), jelszó: Admin1234`. Futtasd le MÉGEGYSZER — most mindkettőnél `Már létezik: ..., kihagyva.` kell legyen (idempotencia-ellenőrzés).

- [ ] **Step 4: Lint + build**

Run: `pnpm exec nx run-many -t lint,build -p db`
Expected: a `db:build` hiba nélkül. A `db:lint` továbbra is a már ismert, ehhez a munkához nem tartozó, A előtt is meglévő hibával bukik (`seed-knowledge.ts` scope-határsértés) — ez nem regresszió, ne javítsd.

- [ ] **Step 5: Commit**

```bash
git add packages/db/prisma/seed-staff.ts packages/db/package.json pnpm-lock.yaml
git commit -m "feat: add staff and admin test account seed script"
```

---

## Task 9: `apps/web` — staff rendelés-lista oldal

**Files:**
- Create: `apps/web/src/lib/orders-api-client.ts`
- Create: `apps/web/src/pages/staff-orders-page.tsx`

**Interfaces:**
- Produces: `StaffOrder`, `AuditEntry` típusok, `listStaffOrders(status?: string): Promise<StaffOrder[]>`, `getStaffOrder(orderId: number): Promise<{ order: StaffOrder; auditLog: AuditEntry[] }>`, `updateStaffOrderStatus(orderId: number, patch: { status?: string; payed?: boolean }): Promise<StaffOrder>`, `correctStaffOrder(orderId: number, patch: Record<string, unknown>): Promise<StaffOrder>` — Task 10 is ezeket használja. `StaffOrdersPage` komponens — Task 11 ezt köti be az `app.tsx`-be.

- [ ] **Step 1: `orders-api-client.ts`**

```ts
// apps/web/src/lib/orders-api-client.ts
export interface StaffOrder {
  orderId: number
  accountId: number
  status: string
  orderDesc: string | null
  price: number | null
  payed: boolean
  email: boolean
  category: string | null
  location: string | null
  light: string | null
  watering: string | null
  currentHeightCm: number | null
  maxHeightCm: number | null
  currentPotCm: number | null
  petSafe: boolean | null
  kidSafe: boolean | null
  airPurifying: boolean | null
  createdAt: string
  updatedAt: string
}

export interface AuditEntry {
  id: number
  accountId: number
  action: string
  previousData: unknown
  newData: unknown
  createdAt: string
}

async function parseJsonOrThrow(response: Response): Promise<unknown> {
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = (body as { error?: string }).error ?? 'Ismeretlen hiba történt.'
    throw new Error(message)
  }
  return body
}

export async function listStaffOrders(status?: string): Promise<StaffOrder[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : ''
  const response = await fetch(`/api/staff/orders${query}`, {
    credentials: 'include',
  })
  const body = (await parseJsonOrThrow(response)) as { orders: StaffOrder[] }
  return body.orders
}

export async function getStaffOrder(
  orderId: number,
): Promise<{ order: StaffOrder; auditLog: AuditEntry[] }> {
  const response = await fetch(`/api/staff/orders/${orderId}`, {
    credentials: 'include',
  })
  return (await parseJsonOrThrow(response)) as {
    order: StaffOrder
    auditLog: AuditEntry[]
  }
}

export async function updateStaffOrderStatus(
  orderId: number,
  patch: { status?: string; payed?: boolean },
): Promise<StaffOrder> {
  const response = await fetch(`/api/staff/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(patch),
  })
  return (await parseJsonOrThrow(response)) as StaffOrder
}

export async function correctStaffOrder(
  orderId: number,
  patch: Record<string, unknown>,
): Promise<StaffOrder> {
  const response = await fetch(`/api/staff/orders/${orderId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(patch),
  })
  return (await parseJsonOrThrow(response)) as StaffOrder
}
```

- [ ] **Step 2: `staff-orders-page.tsx`**

Ez a fájl a Task 10-ben létrehozott `StaffOrderDetailPage`-et importálja — ha Task 9-et Task 10 ELŐTT hajtod végre, ideiglenesen (a taskon belül) hagyd ki a részlet-nézetbe váltást (csak listázz), és Task 10 végén köss vissza rá; VAGY hajtsd végre a két taskot egy menetben, ha az implementációs sorrend ezt indokolja. A végleges kód:

```tsx
// apps/web/src/pages/staff-orders-page.tsx
import { useEffect, useState } from 'react'
import { listStaffOrders, type StaffOrder } from '../lib/orders-api-client.js'
import { logout } from '../lib/api-client.js'
import { useAuth } from '../lib/auth-context.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent, CardHeader } from '../components/ui/card.js'
import { StaffOrderDetailPage } from './staff-order-detail-page.js'

const STATUS_FILTERS = ['', 'új', 'folyamatban', 'lemondva', 'teljesítve']

export function StaffOrdersPage() {
  const { account, refresh } = useAuth()
  const [orders, setOrders] = useState<StaffOrder[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setOrders(await listStaffOrders(statusFilter || undefined))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ismeretlen hiba történt.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [statusFilter])

  async function handleLogout() {
    await logout()
    await refresh()
  }

  if (selectedOrderId !== null) {
    return (
      <StaffOrderDetailPage
        orderId={selectedOrderId}
        onBack={() => {
          setSelectedOrderId(null)
          void load()
        }}
      />
    )
  }

  return (
    <div className="mx-auto max-w-4xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Rendelések ({account?.salutation})</h1>
        <Button variant="outline" size="sm" onClick={handleLogout}>
          Kilépés
        </Button>
      </div>
      <div className="mb-4 flex gap-2">
        {STATUS_FILTERS.map((status) => (
          <Button
            key={status || 'all'}
            variant={statusFilter === status ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(status)}
          >
            {status || 'összes'}
          </Button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p>Betöltés...</p>
      ) : (
        <Card>
          <CardHeader>
            <span className="text-sm text-gray-500">{orders.length} rendelés</span>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="pb-2">#</th>
                  <th className="pb-2">Státusz</th>
                  <th className="pb-2">Leírás</th>
                  <th className="pb-2">Ár</th>
                  <th className="pb-2">Fizetve</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.orderId}
                    className="cursor-pointer border-t border-gray-100 hover:bg-gray-50"
                    onClick={() => setSelectedOrderId(order.orderId)}
                  >
                    <td className="py-2">{order.orderId}</td>
                    <td className="py-2">{order.status}</td>
                    <td className="py-2">{order.orderDesc ?? '—'}</td>
                    <td className="py-2">{order.price ?? '—'}</td>
                    <td className="py-2">{order.payed ? 'igen' : 'nem'}</td>
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

- [ ] **Step 3: Lint**

Run: `pnpm exec nx run web:lint`
Expected: itt még hibázhat, mert a `staff-order-detail-page.js` (Task 10) még nem létezik — ez rendben van, Task 10 után fut le zölden. Ha egy menetben csinálod a két taskot, hagyd ki ezt a köztes lépést.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/orders-api-client.ts apps/web/src/pages/staff-orders-page.tsx
git commit -m "feat: add staff orders list page"
```

---

## Task 10: `apps/web` — staff rendelés-részlet (státusz-váltás + javítás + napló)

**Files:**
- Create: `apps/web/src/pages/staff-order-detail-page.tsx`

**Interfaces:**
- Consumes: `getStaffOrder`, `updateStaffOrderStatus`, `correctStaffOrder`, `StaffOrder`, `AuditEntry` (Task 9).
- Produces: `StaffOrderDetailPage({ orderId, onBack })` — Task 9 (`staff-orders-page.tsx`) már importálja, ez a task tölti fel a hiányzó fájlt.

- [ ] **Step 1: `staff-order-detail-page.tsx`**

```tsx
// apps/web/src/pages/staff-order-detail-page.tsx
import { useEffect, useState } from 'react'
import {
  getStaffOrder,
  updateStaffOrderStatus,
  correctStaffOrder,
  type StaffOrder,
  type AuditEntry,
} from '../lib/orders-api-client.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { Label } from '../components/ui/label.js'
import { Card, CardContent, CardHeader } from '../components/ui/card.js'

const STATUS_VALUES = ['új', 'folyamatban', 'lemondva', 'teljesítve']

export function StaffOrderDetailPage({
  orderId,
  onBack,
}: {
  orderId: number
  onBack: () => void
}) {
  const [order, setOrder] = useState<StaffOrder | null>(null)
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [status, setStatus] = useState('')
  const [payed, setPayed] = useState(false)
  const [orderDesc, setOrderDesc] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    const { order: fetched, auditLog: fetchedLog } = await getStaffOrder(orderId)
    setOrder(fetched)
    setAuditLog(fetchedLog)
    setStatus(fetched.status)
    setPayed(fetched.payed)
    setOrderDesc(fetched.orderDesc ?? '')
  }

  useEffect(() => {
    void load()
  }, [orderId])

  async function handleStatusSave() {
    setSaving(true)
    setError(null)
    try {
      await updateStaffOrderStatus(orderId, { status, payed })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ismeretlen hiba történt.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCorrectionSave() {
    setSaving(true)
    setError(null)
    try {
      await correctStaffOrder(orderId, { orderDesc })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ismeretlen hiba történt.')
    } finally {
      setSaving(false)
    }
  }

  if (!order) return <div className="p-4">Betöltés...</div>

  return (
    <div className="mx-auto max-w-2xl p-4">
      <Button variant="outline" size="sm" onClick={onBack}>
        Vissza
      </Button>
      <Card className="mt-4">
        <CardHeader>
          <h1 className="text-lg font-semibold">#{order.orderId} rendelés</h1>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div>
            <Label htmlFor="status">Státusz</Label>
            <select
              id="status"
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS_VALUES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="payed"
              type="checkbox"
              checked={payed}
              onChange={(e) => setPayed(e.target.checked)}
            />
            <Label htmlFor="payed">Fizetve</Label>
          </div>
          <Button onClick={handleStatusSave} disabled={saving}>
            Státusz mentése
          </Button>

          <div>
            <Label htmlFor="orderDesc">Leírás javítása</Label>
            <Input
              id="orderDesc"
              value={orderDesc}
              onChange={(e) => setOrderDesc(e.target.value)}
            />
          </div>
          <Button variant="outline" onClick={handleCorrectionSave} disabled={saving}>
            Leírás mentése
          </Button>

          <div>
            <h2 className="mt-4 text-sm font-semibold">Napló</h2>
            <ul className="mt-2 space-y-1 text-xs text-gray-600">
              {auditLog.map((entry) => (
                <li key={entry.id}>
                  {entry.createdAt} — {entry.action} (fiók #{entry.accountId})
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: Lint + build**

Run: `pnpm exec nx run-many -t lint,build -p web`
Expected: hiba nélkül (mostantól a `staff-orders-page.tsx` importja is fel tud oldódni).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/staff-order-detail-page.tsx
git commit -m "feat: add staff order detail page with status change, correction, and audit log"
```

---

## Task 11: `apps/web` — szerepkör-alapú útvonalválasztás

**Files:**
- Modify: `apps/web/src/app.tsx`

**Interfaces:**
- Consumes: `StaffOrdersPage` (Task 9), `Account.role` (A al-projekt, `apps/web/src/lib/api-client.ts`).
- Produces: bejelentkezés után `staff`/`admin` szerepkörnél `StaffOrdersPage`, `customer`-nél a meglévő `ChatPage` jelenik meg.

- [ ] **Step 1: `app.tsx` módosítása**

```tsx
// apps/web/src/app.tsx
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

- [ ] **Step 2: Lint + build**

Run: `pnpm exec nx run-many -t lint,build -p web`
Expected: hiba nélkül.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app.tsx
git commit -m "feat: route staff and admin accounts to the orders page instead of chat"
```

---

## Task 12: Bekötés — dokumentáció

**Files:**
- Modify: `README.md`

**Interfaces:** nincs — dokumentáció-frissítés.

- [ ] **Step 1: `README.md` bővítése**

A meglévő szerver+web szekció UTÁN (mindkét nyelvi verzióban, a fájl bilingv struktúráját követve) egészítsd ki egy rövid bekezdéssel:

```md
### Staff/admin teszt-fiók (rendelés-alrendszer)

A rendelés-kezelő felület teszteléséhez futtasd le a staff seed-szkriptet:

\`\`\`bash
pnpm --filter @plantbase/db exec tsx prisma/seed-staff.ts
\`\`\`

Ez létrehoz egy `staff@plantbase.hu` / `Staff1234` és egy `admin@plantbase.hu` / `Admin1234` teszt-fiókot. Ezekkel bejelentkezve a web UI a chat helyett a rendelés-kezelő felületet mutatja.
```

(Angol megfelelője ugyanígy, a README angol szekciójába.)

- [ ] **Step 2: Teljes workspace ellenőrzés**

Run:
```bash
pnpm exec nx run-many -t lint,test,build -p core,db,server,web,cli
```
Expected: minden projekt minden targete hiba nélkül lefut, KIVÉVE a már ismert, A al-projekt előtt is meglévő 2 hibát (`core` `system-prompt.spec.ts` CRLF-eset, `db:lint` scope-határsértés `seed-knowledge.ts`-en) — ezek nem ehhez a munkához tartoznak, ne javítsd őket.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document the staff/admin seed script for the order subsystem"
```

---

## Task 13: Végponttól végpontig manuális ellenőrzés (nem blokkoló automata teszt, de kötelező lépés)

**Files:** nincs kódváltozás — csak ellenőrzés.

- [ ] **Step 1: Tiszta indítás ellenőrzése**

```bash
docker ps  # Postgres fut-e (lásd Task 1 Step 1)
pnpm --filter @plantbase/db exec prisma migrate deploy
pnpm --filter @plantbase/db exec tsx prisma/seed-staff.ts
```
Expected: hiba nélkül.

- [ ] **Step 2: CLI-regresszió — az agent-mag bővítése nem törte el a CLI-t, és a CLI-nek NINCS rendelési képessége**

```bash
pnpm exec nx run cli:build
node apps/cli/dist/main.js ask "Milyen kaktuszok vannak raktáron?"
```
Expected: ugyanúgy válaszol, mint korábban (nincs regresszió). Próbáld ki azt is, hogy a CLI-n keresztül próbálsz rendelést indíttatni ("szeretnék rendelni egy kaktuszt") — az agent NEM hívhat `createOrder`-t (nincs a tool-készletében), legfeljebb szövegesen reagál, de rendelés ténylegesen nem jön létre (ellenőrizhető: `pnpm --filter @plantbase/db exec tsx -e "import { prisma } from './src/lib/client.js'; console.log(await prisma.order.count()); await prisma.\$disconnect()"` a próbálkozás előtt és után — a szám nem nőhet).

- [ ] **Step 3: Ügyfél-oldali golden path (valós LLM-hívással)**

```bash
pnpm exec nx run server:serve
pnpm exec nx run web:serve
```
`http://localhost:4200`-on: regisztrálj egy `customer` fiókot → a chatben kérj egy növénycsomagot → amikor az agent felajánlja a rendelést, mondd, hogy igen, szeretnél rendelni → válaszolj az e-mail-kérdésre → ellenőrizd, hogy a `createOrder` tool ténylegesen lefutott (adatbázisban új `orders` sor + `order_audit_log` `created` bejegyzés jött létre) → kérdezd meg "milyen rendeléseim vannak" → az agent helyesen sorolja fel → mondd le a rendelést a chaten keresztül → ellenőrizd adatbázisban, hogy `status = 'lemondva'` és van `cancelled` audit-bejegyzés.

- [ ] **Step 4: Staff-oldali golden path**

Jelentkezz ki, majd lépj be `staff@plantbase.hu` / `Staff1234`-gyel → ellenőrizd, hogy a web UI a rendelés-listát mutatja (nem a chatet) → szűrj státuszra → nyisd meg a korábban létrehozott (majd lemondott) rendelést → ellenőrizd, hogy a napló mutatja a `created` és `cancelled` bejegyzéseket → hozz létre egy ÚJ rendelést a customer fiókkal (ismételd meg a 3. lépés első felét egy másik böngésző-munkamenetben/inkognitóban, vagy egy második teszt-accounttal), majd staff fiókkal állítsd `teljesítve`-re és pipáld be a `payed`-et → ellenőrizd, hogy egy `status_changed` audit-bejegyzés jött létre, és a customer fiók chatjében a rendelés lekérdezésekor a frissített státusz jelenik meg.

- [ ] **Step 5: Jogosultság-ellenőrzés**

Customer fiókkal próbálj meg közvetlenül elérni egy `/api/staff/orders` végpontot (pl. `curl` a session-cookie-val) → 403 legyen. Staff fiókkal próbáld ki, hogy egy MÁSIK customer rendelését nem éri el a saját fiókkal induló chat-agent (`getOrderByNumber` idegen rendelésszámra "nem található" választ ad, nem az adatokat).

- [ ] **Step 6: Eredmény rögzítése**

Ha bármelyik lépés hibát mutat, azt Task-onta visszakövetve javítsd (nincs külön "javítás" task — a hibát az érintett Task fájljaiban oldd meg, majd ismételd meg ezt a Task 13-at).

Ha minden lépés sikeres, ez a Task 13 zárja a B al-projektet — nincs commit (nincs kódváltozás), de jelezd a felhasználónak, hogy a B al-projekt kész, és a `docs/extension-for-customers.md` felbontásában a C+D al-projektek (e-mail-szimuláció + eszkaláció) a következő lépés.
