# Eszkaláció / off-topic kezelés — design spec

> Épít: `docs/extension-for-customers.md` (cégvezetői elvárások, 67-69. sor), `docs/superpowers/specs/2026-08-18-order-subsystem-design.md` (B — DI-minta az agent-oldali write-képességekhez), `docs/superpowers/specs/2026-08-19-email-simulation-design.md` (C — `sendSimulatedEmail` megosztott infrastruktúra, amit ez a spec újrahasznál), `docs/architektura.md`, `docs/konvenciok.md`.
> Ez a spec a `docs/extension-for-customers.md`-ben leírt felbontás **D al-projektjét** (eszkaláció / off-topic kezelés) írja le.

## Előfeltétel

A C al-projekt (e-mail-szimuláció) kész, review-val lefedve, és `master`-be merge-elve (`#3` PR). D erre épül: `sendSimulatedEmail` (`packages/core/src/lib/email/send-simulated-email.ts`) már létezik és általános célú (nem rendelés-specifikus).

## 1. Adottságok (a feladat rögzíti, nem tervezési döntés)

- Ha az ügyfél nem a Plantbase funkciójának megfelelő kérdést tesz fel, az agent válaszában jelezze, miben tud segíteni.
- Ha az agent olyasmire, ami a funkciója, nem tud válaszolni vagy nem tudja elvégezni a kért feladatot, udvariasan közölje, hogy az ügyet továbbította egy ügyintézőhöz, majd küldjön egy szimulált e-mailt az ügyfélszolgálati csapatnak (`ugyfelszolgalat@plantbase.hu`).
- Az e-mail-szimuláció (fájlnév-konvenció, `.md`-írás) a C al-projektben már megvalósult és újrahasználandó, nem újraírandó.

## 2. Tervezési döntések

**2.1 — Két, egymástól független viselkedés.** Az off-topic elutasítás (67. sor) és az eszkaláció (68-69. sor) különböző triggerelési feltétellel és különböző mellékhatással bír — a doksi is külön mondatban tárgyalja őket. A doksi maga is elválasztja: off-topic = _"nem a Plantbase funkciójának megfelelő kérdés"_ (a téma kívül esik a rendszer hatáskörén, pl. időjárás, politika); eszkaláció = _"olyan valamire, ami a funkciója, nem tud válaszolni"_ (a téma releváns, de az agent képességei/eszközei nem elegendők, vagy az ügyfél kifejezetten emberi ügyintézőt kér).

**2.2 — Off-topic: tisztán rendszerprompt-szintű, mindenhol (CLI + web).** Nincs mellékhatása (nincs tool-hívás, nincs e-mail) — az alap `SYSTEM_PROMPT`-ba kerül, nem a csak-bejelentkezett-web-chat-re vonatkozó kiegészítésbe, mert nincs ok kizárni belőle a CLI-t egy tisztán szöveges viselkedésnél.

**2.3 — Eszkaláció: DI-tool-minta a B/C precedens szerint, csak a bejelentkezett web-chat-en.** `packages/core` kap egy `EscalationActions` interfészt + egy `escalateToStaff(summary)` tool-t, amit a szerver a bejelentkezett fiókhoz kötve inicializál — ugyanaz a minta, mint a rendelés-tool-oknál. A CLI-nek nincs bejelentkezett fiókja, ezért nem kaphat eszkaláció-tool-t sem (ki kéne, hogy kit kövessen fel a staff — nincs azonosított ügyfél).

**2.4 — Eszkaláció-nyilvántartás: `escalations` tábla + megbízható audit-trail, az e-mail-küldés fire-and-forget marad.** A doksi csak e-mail-küldést ír elő, de a felhasználó úgy döntött, hogy legyen adatbázis-rekord is (jövőbeli metrikákhoz / staff-kereshetőséghez). A tábla-írás SZINKRON és megbízható (a `escalateToStaff` tool-hívás sikere = a DB-sor létrejött); az e-mail-küldés utána, fire-and-forget, a C-ben lefektetett minta szerint (sosem blokkolja/buktatja el a tool-hívást).

**2.5 — Az eszkalációs e-mail tartalma NEM egy második LLM-hívással készül, hanem szerver-oldalon, determinisztikusan.** Eltérés C `composeOrderEmail`-mintájától, szándékosan: C záró code review-ja egy carry-forward követelményt hagyott D számára — a rendelés-e-mailek LLM-compose lépése egy határolójel-alapú (de nem tökéletes) védelemmel véd a prompt-injection ellen, mert az ügyfél-vezérelt mezők egy MÁSODIK LLM-hívás promptjába kerülnek. D ezt a kockázatot konstrukciósan kerüli el, nem toldja meg védelemmel: az eszkalációs e-mail tárgya/törzse fix sablon, amibe a fiók valódi (DB-ből származó, megbízható) neve/e-mail-je kerül, az agent által adott `summary` pedig egy egyértelműen megjelölt, "az agent nem ellenőrzött összefoglalója" szakaszba — nincs második LLM-hívás, amibe be lehetne fecskendezni.

**2.6 — Minimális staff-lista, a `StaffOrdersPage` mintájára, nav-váltóval.** A felhasználó kérésére: `GET /api/staff/escalations` + egy `StaffEscalationsPage` (csak lista, nincs részlet-/szerkesztő-nézet — az eszkaláció create-only, nincs életciklusa). Mivel staff bejelentkezés után eddig kizárólag a `StaffOrdersPage`-et látta, egy kis fül-váltó kerül az `app.tsx` staff-ágába ("Rendelések" / "Eszkalációk").

## 3. Adatséma

```sql
escalations (
  id          serial primary key,
  account_id  int not null references accounts(id),
  summary     text not null,   -- az agent tényszerű összefoglalója arról, miben nem tudott segíteni
  created_at  timestamptz not null default now()
)
```

Csak `staff`/`admin` olvashatja (mint az `order_audit_log`). Nincs `updated_at`/életciklus-mező — create-only napló, nincs mit módosítani rajta.

**Biztonsági megjegyzés (B/C tanulsága, explicit ellenőrzendő, nem feltételezendő):** B záró code review-ja után a `docker/init-readonly-role.sql`-ből örökölt blanket `ALTER DEFAULT PRIVILEGES` visszavonásra került (`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM plantbase_ro`), ami azóta minden ÚJ táblát alapból véd az agent olvasó-szerepkörétől. Ez azt jelenti, hogy az `escalations` táblának ELVILEG nem kell külön `REVOKE`-ot kapnia — de ezt Task 1-ben EMPIRIKUSAN ellenőrizni kell (élő `psql`-lel, `plantbase_ro`-ként), nem feltételezni, mert pontosan ez a feltételezés (hogy egy meglévő védelem lefedi az új esetet is) okozta a B-beli biztonsági incidenst.

## 4. Agent-oldali bővítés (`packages/core`)

**`SYSTEM_PROMPT` bővítés** (`<off_topic>` blokk, az alap prompt része, mindenhol érvényes):

```
<off_topic>
Ha a felhasználó kérdése vagy üzenete nem a Plantbase funkciójához kapcsolódik (nem növény/kertészet/rendelés témájú), udvariasan jelezd, miben tudsz segíteni (növényválasztás, csomag-összeállítás, rendelés-kezelés) — ne próbálj a témán kívüli kérdésre válaszolni.
</off_topic>
```

**Új `ESCALATION_PROMPT_ADDITION`** (a `stream-agent.ts` fűzi hozzá, csak ha van `escalationActions`, tehát sosem a CLI-n — az `ORDER_PROMPT_ADDITION` mintájára):

```
<escalation_behavior>
Ha a felhasználó kérése a Plantbase funkciójához kapcsolódik, de nem tudsz rá válaszolni vagy nem tudod elvégezni (nincs hozzá tool-od, a kérés a képességeiden túlmutat, vagy kifejezetten emberi ügyintézőt kér), udvariasan közöld, hogy továbbítod az ügyet egy ügyintézőhöz, majd hívd az escalateToStaff tool-t egy rövid, tényszerű összefoglalóval. Ne hívd az escalateToStaff-ot off-topic kérdésekre — csak akkor, ha a kérés a Plantbase funkciójához tartozna, de te nem tudtad megoldani.
</escalation_behavior>

<escalation_tools>
escalateToStaff(summary): a bejelentkezett ügyfél ügyének továbbítása ügyintézőhöz — rövid, tényszerű összefoglalót adj át arról, mit kért az ügyfél és miért nem tudtál segíteni.
</escalation_tools>
```

**`EscalationActions` interfész + `buildEscalationTools`** (`packages/core/src/lib/escalation-tools.ts`, az `order-tools.ts` mintájára):

```ts
interface EscalationActions {
  escalate(summary: string): Promise<{ escalationId: number }>
}
```

Egy tool: `escalateToStaff(summary: string)`. A `stream-agent.ts` `StreamAgentOptions` kap egy `escalationActions?: EscalationActions` mezőt, feltételesen adja hozzá a tool-t és a rendszerprompt-bővítést, ugyanúgy, mint `orderActions`-nál.

## 5. Szerver (`apps/server`)

**`apps/server/src/lib/escalations-store.ts`:**

```ts
interface EscalationDetail {
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

**`apps/server/src/lib/escalation-emails.ts`** (a `order-emails.ts` mintájára, de determinisztikus tartalommal, 2.5 szerint — NINCS LLM-hívás):

```ts
export function notifyEscalation(
  escalationId: number,
  accountId: number,
  summary: string,
): void
```

Fiók-lookup (Prisma), fix sablon-tárgy/törzs összeállítása a fiók valódi nevével/e-mail-jével + a `summary`-vel (egyértelműen megjelölve, hogy az agent nem ellenőrzött összefoglalója), `sendSimulatedEmail({ recipientLabel: 'ügyfélszolgálat', recipientAddress: 'ugyfelszolgalat@plantbase.hu', subject, body })` hívása. Fire-and-forget, minden hiba csak logolódik — a C-ben lefektetett minta szerint.

**Staff-only REST végpont:** `GET /api/staff/escalations` (`requireAccount` + `requireRole('staff', 'admin')`), a `listOrdersForStaff`/`GET /api/staff/orders` mintájára.

**`chat.ts`** bővítése: `escalationActions: req.account ? buildEscalationActionsForAccount(req.account.id) : undefined` átadása a `streamAgentResponse`-nak, az `orderActions` mellé.

## 6. Minimális `apps/web` staff-felület

`StaffEscalationsPage` — tábla (id, ügyfél neve, összefoglaló, időpont), a `StaffOrdersPage` vizuális stílusában, csak lista (nincs részlet-/szerkesztő-nézet). `app.tsx` staff-ága kap egy kis fül-váltót ("Rendelések" / "Eszkalációk") a két staff-oldal között — ez az egyetlen navigációs változás, amire ennek az al-projektnek szüksége van.

## 7. Biztonság

- Az `escalateToStaff` tool sosem kap `account_id`-t paraméterként az LLM-től — a szerver a saját session-jéből fixálja be, ugyanúgy, mint a rendelés-tool-oknál.
- Az `escalations` tábla csak staff-only végponton érhető el.
- Az agent olvasó-szerepköre (`plantbase_ro`) NEM férhet hozzá az `escalations` táblához — ezt Task 1 empirikusan ellenőrzi (élő `psql`), nem feltételezi (lásd 3. szakasz biztonsági megjegyzése).
- Az eszkalációs e-mail nem tartalmaz második LLM-hívást (2.5) — a `summary` mezőt egyértelműen "nem ellenőrzött, az agent összefoglalója" címkével látja el a sablon, a fiók-azonosító adatok mindig a DB-ből, nem az LLM kimenetéből származnak.

## 8. Hibakezelés

- `escalateToStaff` sikere kizárólag a DB-írás sikerén múlik — ha az sikertelen, a tool-hívás hibát ad vissza az agentnek (ahogy bármelyik más Prisma-hívás is tenné).
- Az e-mail-küldés hibája (fiók-lookup, fájlrendszer) sosem jut vissza a hívóhoz — csak logolódik, a `notifyOrderEvent` mintája szerint.

## 9. Tesztelés

- `escalation-tools.spec.ts` — az `order-tools.spec.ts` mintájára, az `escalateToStaff` tool execute-jét ellenőrzi.
- `apps/server/src/lib/escalations-store.spec.ts` — Prisma mockolva, a DB-írás + a fire-and-forget e-mail-trigger ellenőrzése.
- `apps/server/src/lib/escalation-emails.spec.ts` — az `order-emails.spec.ts` mintájára.
- `apps/server/src/routes/staff-escalations.spec.ts` — supertest, 401/403/200.
- Manuális E2E (a C Task 6 mintájára): off-topic kérdésre adott válasz ellenőrzése (nincs tool-hívás), egy valódi eszkaláció végigfuttatása (DB-sor + `.md` fájl létrejötte), staff-lista megtekintése, CLI-regresszió (nincs escalateToStaff a CLI tool-készletében).

## 10. Nyitott kérdések a következő al-projektek felé (nem ennek a spec-nek a hatásköre)

- Az E (metrikák) al-projekt esetleg az `escalations` táblát is felhasználhatja hiba-arány méréshez (a doksi 85. sora: _"Legalább egy metrika az agent hibáját mérje"_ — az eszkalációk gyakorisága ehhez természetes jelzés).
- Az F (adatvédelem/anonimizálás) al-projektnek figyelembe kell vennie, hogy az `escalations.summary` mező szabad szöveg, ami személyes adatot tartalmazhat (az ügyfél panaszának/kérésének tartalma) — ez a jelen specnek nem tárgya.
