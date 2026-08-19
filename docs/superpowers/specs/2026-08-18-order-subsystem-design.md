# Rendelés-alrendszer — design spec

> Épít: `docs/extension-for-customers.md` (cégvezetői elvárások, teljes hatókör), `docs/superpowers/specs/2026-08-17-server-web-auth-design.md` (A al-projekt — szerver/web/auth alapinfrastruktúra, ennek a specnek az előfeltétele), `docs/architektura.md`, `docs/konvenciok.md`.
> Ez a spec a `docs/extension-for-customers.md`-ben leírt felbontás **B al-projektjét** (rendelés-alrendszer) írja le. A C (email-szimuláció), D (eszkaláció), E (metrikák), F (adatvédelem) al-projektek külön spec(ek) tárgya — ez a dokumentum csak annyiban tér ki rájuk, amennyi B döntéseit megalapozza (pl. az `email` opt-in mező eltárolása C számára, a `payed`-höz hasonló ügyintézői jogosultsági minta).

## Előfeltétel

Az A al-projekt (szerver + web UI + auth + agent-mag AI SDK migráció) kész, review-val lefedve, és `master`-be merge-elve (`#1` PR). B erre épül: a `accounts` tábla `role` mezője (`customer | staff | admin`) már létezik, a session-alapú auth már működik, az `apps/server`/`apps/web` alapinfrastruktúra megvan.

## 1. Adottságok (a feladat rögzíti, nem tervezési döntés)

- `orders` tábla séma alapja a `docs/extension-for-customers.md`-ben megadott mezőlista (lásd 2. szakasz — a dokumentum sémáját egy hiányzó, de a viselkedésből következő mezővel egészítjük ki, lásd alább).
- Rendelés indítás előtt az agent kérdezze meg, szeretne-e rendelést indítani; ha igen, kérdezzen rá az e-mail-értesítésre.
- Állapot-lekérdezés: egy találat → adatok megadása; több találat → rákérdezés melyikről; ügyfél kérhet konkrét rendelésszámot vagy az összeset (max 5, afölött szűkítést kér az agent); aktív rendelések (új/folyamatban) listázása szintén max 5.
- Csak ügyintéző állíthatja "teljesítve"-re a státuszt, miután látta a rendelés adatait.
- Minden változás naplózva; a napló csak üzemeltető/ügyintéző számára látható, ügyfél nem látja.
- Ha az agent téved, ügyintéző módosíthatja az `orders` rekordot.

## 2. Tervezési döntés: hiányzó `account_id` mező

Az eredeti séma nem tartalmaz semmilyen mezőt, ami egy rendelést egy adott ügyfélhez kötne, pedig a leírt viselkedés ("saját rendeléseim" lekérdezése) ezt feltételezi. **Döntés: az `orders` tábla kap egy kötelező `account_id` FK-t** (`accounts.id`-re mutat) — csak bejelentkezett ügyfél rendelhet, minden rendelés-tool szerver-oldalon ehhez van szkópolva.

**Feltételezés** (nem szerepel explicit a doksiban): az `admin` (üzemeltető) szerepkör az `ügyintéző`-i (`staff`) jogokat is bírja — a doksi csak azt mondja ki, hogy mindkettő látja a naplót, külön korlátozásról nem szól.

## 3. Architektúra és a fő technológiai döntések

**Írási útvonal:** `packages/core` továbbra sem függhet `packages/db`-től (A-ban lefektetett, lint által kikényszerített szabály). A rendelés-írás dependency injection-nel oldódik meg: `buildAgentTools`/`buildOrderTools` egy `OrderActions` interfészt kap paraméterül, amit a hívó (`apps/server`) konstruál meg valódi, Prisma-alapú implementációval, **a bejelentkezett `req.account.id`-hoz zárva** — az LLM sosem kaphat/adhat szabad `account_id` paramétert. A CLI-nek (nincs bejelentkezett fiók) ezek a tool-ok nincsenek regisztrálva, a CLI marad tisztán olvasó-agent.

Elvetett alternatívák: (A) az agent HTTP-n hívná vissza a szervert — önhivatkozó, és a CLI-nél nincs is futó szerver; (B) `packages/core` közvetlenül függjön `packages/db`-től erre az egy esetre — megtörné az A-ban felépített és lint által védett szabályt.

**Customer-oldali REST végpont nincs a rendelésekhez** — az ügyfél kizárólag a chaten keresztül érintkezik a rendeléseivel (A dokumentuma szerint az ügyfél csak a chat felületen kommunikálhat az agenttel), minden az agent tool-hívásain keresztül történik.

**Staff-oldali REST végpontok vannak** — az ügyintéző/üzemeltető a minimális webes felületen keresztül dolgozik, nem a chaten.

## 4. Adatséma

**`orders` tábla:**
```sql
orders (
  order_id          serial primary key,
  account_id        int not null references accounts(id),  -- kié a rendelés
  status            text not null default 'új',   -- új / folyamatban / lemondva / teljesítve
  order_desc        text,
  price             numeric,
  payed             boolean not null default false,  -- csak ügyintéző állítja
  email             boolean not null,                -- kér-e e-mailt a rendelésről (C al-projekt használja majd)
  category          text,      -- szobanövény / kerti / pozsgás / kaktusz / fűszer / fa-cserje / lógó / virágzó
  location          text,      -- beltéri / kültéri / mindkettő
  light             text,      -- árnyék / alacsony / közepes / erős / direkt nap
  watering          text,      -- ritka / közepes / gyakori / állandóan nedves
  current_height_cm int,
  max_height_cm     int,
  current_pot_cm    int,
  pet_safe          boolean,
  kid_safe          boolean,
  air_purifying     boolean,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
)
```
`category`/`location`/`light`/`watering` értékkészlete megegyezik a `products` tábláéval (Zod-validáció ugyanazokkal az enumokkal).

**`order_audit_log` tábla** (csak `staff`/`admin` olvashatja):
```sql
order_audit_log (
  id             serial primary key,
  order_id       int not null references orders(order_id),
  account_id     int not null references accounts(id),  -- ki csinálta a változást
  action         text not null,   -- created | status_changed | corrected | cancelled
  previous_data  jsonb,           -- null 'created'-nél
  new_data       jsonb not null,  -- a rendelés teljes állapota a változás után
  created_at     timestamptz not null default now()
)
```

## 5. Agent-oldali rendelési képesség (`packages/core` bővítés)

**`OrderActions` interfész** (a szerver adja át, valódi account-hoz kötve):
```ts
interface CreateOrderInput {
  orderDesc?: string
  price?: number
  email: boolean               // kötelező — az LLM nem hívhatja meg anélkül, hogy megkérdezte volna
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

interface OrderSummary {
  orderId: number
  status: string
  orderDesc: string | null
  price: number | null
  payed: boolean
  email: boolean
  createdAt: string
}

interface OrderActions {
  createOrder(input: CreateOrderInput): Promise<{ orderId: number }>
  cancelOrder(orderId: number): Promise<{ ok: true } | { ok: false; reason: string }>
  listMyOrders(scope: 'all' | 'active'): Promise<{ orders: OrderSummary[]; tooMany: boolean }>
  getOrderByNumber(orderId: number): Promise<OrderSummary | null>
}
```

**4 új tool** (`buildOrderTools(actions)`, csak akkor kerül a tool-készletbe, ha `OrderActions` át lett adva — tehát a CLI-nél sosem):
- `createOrder` — a fenti mezők + kötelező `email: boolean`.
- `cancelOrder(orderId)` — csak saját, `új`/`folyamatban` állapotú rendelésre; már `teljesítve`/`lemondva` esetén `{ ok: false, reason: '...' }`.
- `listMyOrders(scope)` — max 5 elem; ha több van, `tooMany: true`, az agent kér szűkítést, nem csonkolt listát ad.
- `getOrderByNumber(orderId)` — csak saját rendelésre; idegen/nemlétező számra ugyanaz az üzenet ("nem található ilyen rendelés") — nem árulja el más létezését.

**Rendszer-prompt bővítés** (`<behavior>` szekció): rendelési szándék felismerésekor mindig rákérdezni "szeretne rendelést indítani?", majd "szeretne e-mailt kapni?", és csak ezután hívni a `createOrder`-t. Egy/több/túl sok találat kezelése természetes nyelven, a tool visszatérési adatai alapján.

**Határvonal C felé:** a `createOrder`/`cancelOrder`/státusz-váltás B-ben NEM küld e-mailt — csak eltárolja az `email` opt-int és naplózza a változást; a tényleges e-mail-szimuláció a C al-projekt feladata, az `order_audit_log`-ra épülve.

## 6. Szerver (staff API + jogosultság)

**`apps/server/src/lib/orders-store.ts`** — Prisma-alapú CRUD + tranzakciós audit-napló-írás minden műveletnél (`account_id`-hoz szkópolva ügyfél-műveleteknél).

**`apps/server/src/middleware/role.ts`** — `requireRole(...roles)`, `requireAccount` UTÁN fut, 403-at ad, ha `req.account.role` nincs a listában.

**Staff-only REST végpontok** (`requireAccount` + `requireRole('staff', 'admin')`):
- `GET /api/staff/orders` — lista (opcionális státusz-szűréssel), max ~50, legújabb elöl.
- `GET /api/staff/orders/:id` — részletek + a rendeléshez tartozó audit-bejegyzések.
- `PATCH /api/staff/orders/:id/status` — bármilyen státusz-váltás (`teljesítve` is), opcionálisan `payed`.
- `PATCH /api/staff/orders/:id` — tetszőleges mező javítása.

**Staff-fiók seed** — az A spec 8. pontja ezt B-re halasztotta: `packages/db/prisma/seed-staff.ts`, ami létrehoz egy teszt `staff` és egy `admin` fiókot (hash-elt jelszóval), hogy be lehessen lépni és tesztelni a felületet.

## 7. Minimális `apps/web` staff-felület

Bejelentkezés után, ha `account.role !== 'customer'`, a `ChatPage` helyett egy `StaffOrdersPage` jelenik meg: tábla + státusz-szűrő + részlet-nézet státusz-váltó formmal + audit-napló megjelenítéssel — a meglévő UI-primitíveket (Button/Input/Card) újrahasználva, dizájn nélküli, funkcionális minimum.

## 8. Biztonság

- Az agent tool-jai (`cancelOrder`, `listMyOrders`, `getOrderByNumber`) sosem kapnak `account_id`-t paraméterként az LLM-től — a szerver mindig a saját session-jéből fixálja be a closure-ben.
- Az audit-napló kizárólag staff-only végponton érhető el, ügyfél-oldali route egyáltalán nem exponálja.
- `getOrderByNumber` idegen/nemlétező rendelésre ugyanazt az üzenetet adja — nem szivárogtat mást.

## 9. Hibakezelés

- `cancelOrder` már `teljesítve`/`lemondva` rendelésre → `{ ok: false, reason: '...' }`, az agent udvariasan közli, hogy ez már nem mondható le.
- Staff státusz-váltás érvénytelen célállapotra → 400 Zod-validációval, A auth route-jainak mintájára.

## 10. Tesztelés

- `orders-store.spec.ts` — Prisma mockolva, minden CRUD + audit-írás tesztelve.
- `order-tools.spec.ts` — az `agent-tools.spec.ts` mintájára, a 4 tool execute-jét ellenőrzi.
- `apps/server/src/routes/staff-orders.spec.ts` — supertest, 401 (nincs bejelentkezve) / 403 (customer szerepkörrel) / 200 (staff/admin) minden végpontra.
- A staff webfelület automatizált teszt nélkül marad (A-ban lefektetett precedens: manuális ellenőrzés).

## 11. Nyitott kérdések a következő al-projektek felé (nem ennek a spec-nek a hatásköre)

- A tényleges e-mail-küldés (C al-projekt) az `order_audit_log` `action`-jeire és az `email` opt-in mezőre épül majd.
- A `/api/chat`-ban jelenleg a kliens küldi a teljes beszélgetés-history-t, amit a szerver megbízik — ez olvasó-agentnél ártalmatlan, de rendelés-módosító tool-oknál (amiket ez a spec vezet be) potenciális integritási kockázat, ha a kliens hamisítana egy korábbi assistant/tool-üzenetet. B-ben ez még nem kritikus (minden write-tool a szerver oldalán, a valódi DB-állapot alapján dönt, nem a history alapján), de érdemes szem előtt tartani, ha a jövőben a history-ból származtatott állapot befolyásolná a rendelés-műveleteket.
