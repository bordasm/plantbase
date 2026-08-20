# Metrikák — design spec

> Épít: `docs/extension-for-customers.md` (cégvezetői elvárások, 84-85. sor), `docs/superpowers/specs/2026-08-18-order-subsystem-design.md` (B — `orders` tábla), `docs/superpowers/specs/2026-08-19-escalation-handling-design.md` (D — `escalations` tábla, és annak §10-e, ami explicit előrevetíti ezt az al-projektet), `docs/architektura.md`, `docs/konvenciok.md`.
> Ez a spec a `docs/extension-for-customers.md`-ben leírt felbontás **E al-projektjét** (metrikák) írja le.

## Előfeltétel

A D al-projekt (eszkaláció / off-topic kezelés) kész, review-val lefedve, és `master`-be merge-elve (`#4` PR). E erre épül: az `orders` és `escalations` táblák már léteznek és populáltak.

## 1. Adottságok (a feladat rögzíti, nem tervezési döntés)

- Legalább egy metrika azt mérje, amit meg kell oldani a jelen fejlesztéssorozatnak.
- Legalább egy metrika az agent HIBÁJÁT mérje, ne csak a sikerét.

## 2. Tervezési döntések

**2.1 — Nincs új interakció-napló, nincs új write-path.** Jelenleg a chat state-less: a szerver sosem tárol el egyedi kérdéseket/üzeneteket, csak a konkrét kimeneteket (`orders`, `escalations`). A felhasználó döntése: a metrikák kizárólag ebből a két, már létező táblából, aggregáció útján készülnek — nincs új Prisma-modell, nincs új write-path a `chat.ts`-ben. Ez YAGNI-barát: a doksi minimális követelménye (legalább 1-1 metrika) teljesíthető anélkül, hogy egy teljes üzenet-naplózó rendszert be kellene vezetni, aminek a szükségességét a doksi nem indokolja.

**2.2 — Közös nevező: "agent által kiszolgált ügyek".** A két kötelező metrika ugyanarra a halmazra épül: `orders.count() + escalations.count()` — minden létrehozott rendelés és minden eszkaláció egy konkrét, az agent által előidézett kimenet. Ez a két metrikát egymással összefüggő, értelmezhető párrá teszi, nem két független számmá.

- **Siker-metrika** (a doksi "amit meg kell oldani" pontja): *munkaidőn kívüli kiszolgálás aránya* — a rendelések+eszkalációk hány százaléka jött létre munkaidőn KÍVÜL. Közvetlenül demonstrálja a doksi 1. üzleti problémáját: *"Az ügyfeleink munkaidőn kívül nem kapnak választ, pedig akkor is keresnek minket."* — ez a metrika megmutatja, hogy az agent akkor IS kiszolgálja őket.
- **Hiba-metrika** (a doksi "az agent hibáját mérje" pontja): *eszkalációs arány* — `escalations.count() / (orders.count() + escalations.count())`. Az összes konkrét kimenet hány százaléka volt olyan eset, amit az agent NEM tudott önállóan megoldani.

**2.3 — Munkaidő-definíció: hétfő-péntek 9:00-17:00, helyi (szerver) idő.** Nincs a doksiban explicit megadva, ezért tervezési döntés — dokumentált feltételezés, amit a felhasználó felülbírálhat. A besorolás JS-ben történik (`date.getDay()`/`getHours()`), nem SQL-ben (`EXTRACT`) — a `send-simulated-email.ts` (C al-projekt) már ugyanezt a mintát használja dátum-formázáshoz, ez konzisztens vele. Az adathalmaz mérete (tananyag-projekt léptékű) indokolja, hogy a sorok memóriába húzása és JS-beli osztályozása egyszerűbb és hordozhatóbb, mint egy adatbázis-specifikus lekérdezés.

**2.4 — Staff-dashboard, a felhasználó kérésére, a B/D mintájára.** `GET /api/staff/metrics` + egy `StaffMetricsPage`, ami a két kötelező metrikát (nagy százalék + "(X / Y esetből)" alszöveg) és két kiegészítő nyers számot (összes rendelés, összes eszkaláció) mutat egyszerű kártyákként. NINCS dátum-szűrő, NINCS grafikon, NINCS részlet-nézet — a D-ben lefektetett "dizájn nélküli, funkcionális minimum" precedenst követi. A `StaffArea` fül-váltó (D al-projekt) egy harmadik füllel bővül ("Metrikák").

## 3. Adatszámítás

```ts
interface MetricsSnapshot {
  outOfHours: { count: number; total: number; percentage: number }
  escalationRate: { count: number; total: number; percentage: number }
  totalOrders: number
  totalEscalations: number
}
```

`percentage` nulla `total` esetén `0` (nem `NaN`/`Infinity`) — explicit oszd-nullával-védelem.

`computeMetrics()`: lekérdezi `prisma.order.findMany({ select: { createdAt: true } })` és `prisma.escalation.findMany({ select: { createdAt: true } })`-t, minden `createdAt`-ot leoszt `isBusinessHours(date)`-szal, összeszámolja a munkaidőn kívülieket, és kiszámolja a két arányt a 2.2-ben leírt közös nevezőn.

## 4. Szerver (`apps/server`)

**`apps/server/src/lib/metrics-store.ts`** — `isBusinessHours(date: Date): boolean` (exportált, egységteszteléshez) + `computeMetrics(): Promise<MetricsSnapshot>`.

**Staff-only REST végpont:** `GET /api/staff/metrics` (`requireAccount` + `requireRole('staff', 'admin')`), a `GET /api/staff/orders`/`GET /api/staff/escalations` mintájára.

## 5. Minimális `apps/web` staff-felület

`StaffMetricsPage` — 4 kártya (2 fő metrika + 2 kiegészítő szám), a `StaffOrdersPage`/`StaffEscalationsPage` vizuális stílusában (`Card`/`CardContent`/`CardHeader`). `app.tsx`'s `StaffArea` fül-váltója `'orders' | 'escalations' | 'metrics'`-re bővül, egy harmadik gombbal ("Metrikák").

## 6. Biztonság

- A végpont csak `staff`/`admin` számára érhető el, ugyanúgy, mint minden más staff-végpont.
- Nincs személyes/ügyfél-szintű adat a válaszban — csak aggregált számok, nincs új adatvédelmi felszín.

## 7. Hibakezelés

- Nulla rendelés/eszkaláció esetén (`total === 0`) mindkét `percentage` `0`, nem hibázik (explicit ellenőrzés, nem implicit `0/0`).

## 8. Tesztelés

- `metrics-store.spec.ts` — `isBusinessHours` egységteszt (péntek 16:59 vs. 17:00 határeset, szombat, hétfő 9:00 pontosan) + `computeMetrics` Prisma-mockolással (kontrollált időbélyegű rendelések/eszkalációk, ellenőrizve a számokat/arányokat, beleértve a nulla-interakció szélsőértéket).
- `apps/server/src/routes/staff-metrics.spec.ts` — supertest, 401/403/200, a `staff-orders.spec.ts`/`staff-escalations.spec.ts` mintájára.
- Manuális E2E (a B/C/D záró task-jainak mintájára): a fejlesztői DB-ben már meglévő (korábbi al-projektek E2E-futtatásaiból származó) rendelés-/eszkaláció-adatokkal ellenőrizve, hogy a végpont és a dashboard értelmes számokat ad vissza.

## 9. Nyitott kérdések a következő al-projekt felé (nem ennek a spec-nek a hatásköre)

- Az F (adatvédelem/anonimizálás) al-projektnek figyelembe kell vennie, hogy ez a metrika-réteg csak aggregált, nem személyes szintű adatot exponál — ez a spec nem ad hozzá új anonimizálási felszínt.
