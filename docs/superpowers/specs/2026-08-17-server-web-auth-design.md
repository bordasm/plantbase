# Szerver + Web UI + Auth alapinfrastruktúra — design spec

> Épít: `docs/extension-for-customers.md` (cégvezetői elvárások, teljes hatókör), `docs/architektura.md`, `docs/stack.md`, `docs/konvenciok.md`.
> Ez a spec a `docs/extension-for-customers.md`-ben leírt, sok önálló alrendszert lefedő fejlesztés **első al-projektjét** (a felbontásban "A") írja le: a szerver/web/auth alapinfrastruktúra és az agent-mag Vercel AI SDK 6-ra migrálása. A rendelés-alrendszer (orders, email-szimuláció, eszkaláció, metrikák, adatvédelem) külön spec(ek) tárgya, ezekre ez a dokumentum csak annyiban tér ki, amennyi az A al-projekt döntéseit megalapozza (pl. `role` mező most bevezetése).

## Al-projekt felbontás (kontextus, nem ennek a spec-nek a hatóköre)

A teljes `extension-for-customers.md` a következő önálló darabokra bomlik:

- **A (ez a spec):** Express szerver + React web UI + auth (regisztráció/belépés) + az agent-mag átállítása Vercel AI SDK 6-ra.
- **B:** rendelés-alrendszer (`orders` tábla, agent-oldali rendelés-flow, státusz-lekérdezés, staff jogosultságok, audit log).
- **C:** email-szimuláció (`.md` fájlok `/emails`-be).
- **D:** eszkaláció / off-topic terelés.
- **E:** metrikák (siker + hiba).
- **F:** adatvédelem, anonimizálás, adatnyomvonal-dokumentáció.

Sorrend: A → B → (C+D együtt) → E/F.

## 1. Adottságok (a feladat rögzíti, nem tervezési döntés)

- Három belépési pont: CLI (meglévő) + Express szerver (`/api/chat`, `/debug/knowledge`) + React web UI (Vite + Tailwind + shadcn), csak localhoston kell futnia.
- Agent réteg: Vercel AI SDK 6 (`generateText` + `stopWhen`).
- Belépés e-mail címmel és jelszóval; regisztráció mezői: teljes név, megszólítás, e-mail, jelszó×2; jelszó-szabály: min. 8 karakter, kis- és nagybetű, szám, mindből legalább egy.
- A fiók adatai adatbázisban, új táblával, a lehető legbiztonságosabb sémával.
- Az agent a megszólítás mezőt használja, amikor szükséges és életszerű.

## 2. Architektúra és a fő technológiai döntések

- **Monorepo bővítés:** `apps/server` (Express 5) és `apps/web` (React 19 + Vite + Tailwind 4 + shadcn) új Nx projektek, a meglévő `apps/cli` mintáját követve.
- **Agent-mag migráció:** a `packages/core/src/lib/ask-agent.ts` jelenlegi, kézzel írt Anthropic SDK tool-loopja átáll Vercel AI SDK 6-ra (`generateText` + `stopWhen: stepCountIs(5)`), a 3 meglévő tool (`runSql`, `listCategories`, `searchKnowledge`) `tool()` + Zod-definícióval. A visszatérési kontraktus (`answer`, `systemPrompt`, `messages`, `generatedSql`, `retrieval`, `usage`) megmarad, hogy az `apps/cli` változtatás nélkül tovább működjön.
- **Auth + account-adatok helye:** az `accounts` és `sessions` tábla a `packages/db` Prisma sémájába kerül (mint később az `orders` is), az auth-logika (jelszó-hash, session-kezelés) az `apps/server`-ben él, NEM a `packages/core`-ban — a `eslint.config.mjs` `@nx/enforce-module-boundaries` szabálya miatt (`packages/core` sosem függhet `packages/db`-től).
- **Jelszó-hash:** `bcryptjs` (tiszta JS, nincs natív fordítás) — elkerülve a pnpm `allowBuilds` súrlódást (lásd korábbi tapasztalat natív modulokkal ebben a repóban).
- **Session:** DB-alapú session-tábla + httpOnly, `sameSite=lax`, `secure=false` (localhost-only) cookie. Nincs JWT; visszavonás = session-sor törlése.
- **Streaming:** `@ai-sdk/react` `useChat` hook + AI SDK UI-message-stream protokoll a `/api/chat` végponton (`streamText(...).toUIMessageStreamResponse()`) — ez adja natívan a tool-kártyákat és az agent-badge-et a React oldalon.

## 3. Adatséma

**`accounts`:**
```sql
accounts (
  id             serial primary key,
  full_name      text not null,
  salutation     text not null,        -- megszólítás, amit az agent használ
  email          text unique not null,
  password_hash  text not null,        -- bcryptjs hash, soha nyers jelszó
  role           text not null default 'customer',  -- customer | staff | admin
  created_at     timestamptz not null default now()
)
```
`staff` = ügyintéző, `admin` = üzemeltető (a B al-projekt jogosultságaihoz). Önregisztráció mindig `customer`-t hoz létre; staff/admin fiók seed-szkripttel jön létre, nincs önkiszolgáló admin-UI.

**`sessions`:**
```sql
sessions (
  token       text primary key,        -- kriptográfiailag random, session-cookie értéke
  account_id  int not null references accounts(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null      -- fix 7 nap, nincs sliding-refresh
)
```

## 4. Adatfolyam

1. **Regisztráció** — `POST /api/auth/register` (teljes név, megszólítás, email, jelszó×2) → Zod-validáció (email-formátum, jelszó-szabály, jelszó==jelszó-mégegyszer) → email-egyediség ellenőrzés → bcryptjs hash → `accounts` insert (`role=customer`) → session létrehozás → httpOnly cookie beállítás.
2. **Belépés** — `POST /api/auth/login` (email, jelszó) → keresés email alapján → bcryptjs compare → session létrehozás → cookie. Hibás email/jelszó esetén egységes "Hibás e-mail vagy jelszó." üzenet (nincs user-enumeration).
3. **Kilépés** — `POST /api/auth/logout` → session-sor törlése + cookie törlése.
4. **Session middleware** — minden védett route előtt: cookie → session lookup + lejárat-ellenőrzés → `req.account` (id, name, salutation, role); hiányzó/lejárt session → 401.
5. **`/api/chat`** — csak bejelentkezett fiókkal érhető el; a `useChat` a böngészőből `credentials: 'include'`-dal hívja, a válasz AI SDK UI-message-stream, amiből a React UI tool-kártyákat (runSql/listCategories/searchKnowledge hívások) és egy agent-badge-et (most: "Info-agent", előkészítve a B/orchestrator utáni feladathoz) renderel.
6. **`/debug/knowledge`** — a meglévő CLI debug-retrieval funkció szerver-tükre, szintén csak bejelentkezve.
7. Az agent a `salutation` mezőt a session accountjából kapja meg (rendszer-üzenetként a system prompthoz fűzve), nem az LLM-től kérdezi meg.

## 5. Komponensek és fájlstruktúra

**`apps/server` (Express 5, `@plantbase/server`):**
```
apps/server/src/
  main.ts                 -- Express app bootstrap, middleware-lánc
  routes/auth.ts          -- register/login/logout/me
  routes/chat.ts          -- POST /api/chat (AI SDK streamText → toUIMessageStreamResponse)
  routes/debug.ts         -- GET /debug/knowledge
  middleware/session.ts   -- cookie parse, session lookup, req.account
  lib/password.ts         -- bcryptjs hash/compare + jelszó-policy Zod séma
  lib/session-store.ts    -- session CRUD a Prisma kliensen keresztül
```
A szerver a `@plantbase/db` Prisma klienst importálja (account/session CRUD-hoz) és a `@plantbase/core`-t (agent-hívás) — ez engedélyezett függés az `enforce-module-boundaries` szabály szerint (`scope:app` → `scope:core` + `scope:db`).

**`apps/web` (Vite + React 19 + Tailwind 4 + shadcn, `@plantbase/web`):**
```
apps/web/src/
  pages/register.tsx, login.tsx, chat.tsx
  components/chat/message-list.tsx, tool-card.tsx, agent-badge.tsx
  lib/api-client.ts       -- fetch wrapper, credentials: 'include'
```
Dev-módban Vite proxy-zza az `/api` és `/debug` útvonalakat a szerverre — nincs CORS, minden localhost.

**`packages/core` migráció:**
- `ask-agent.ts` átírása Vercel AI SDK 6-ra: `generateText({ model: anthropic('claude-sonnet-5'), system, tools, messages, stopWhen: stepCountIs(5) })`, a 3 tool `tool({ description, inputSchema: z..., execute })` formában.
- A visszatérési `AskAgentResult` alak megmarad — ez a CLI-vel megosztott kontraktus, az `apps/cli/src/main.ts` egy sort sem változik.
- Meglévő `ask-agent.spec.ts` teszt átírása az AI SDK mockolására (a jelenlegi `Anthropic` osztály-mock helyett) — ez az egyetlen komponens, ahol regresszió-kockázat van, ezért itt a TDD-lépés (előbb a spec, majd az implementáció) különösen fontos.

**Env-bővítés (`.env`):** `SESSION_COOKIE_NAME`, `SESSION_TTL_DAYS` (=7); a meglévő `ANTHROPIC_API_KEY`, `DATABASE_URL`, `DATABASE_URL_READONLY` változatlan.

**Migráció:** egy új Prisma migráció (`accounts` + `sessions` tábla) a meglévő `products`/`knowledge_chunks` migrációk mintájára.

## 6. Hibakezelés

- Validációs hiba → 400 + magyar üzenet.
- Duplikált email → 409.
- Auth hiba (rossz email/jelszó) → 401 egységes üzenettel.
- Session lejárat a frontenden → login oldalra irányítás.
- `unknown` hiba a rendszer-határon mindenhol Zod-dal szűkítve, konvenció szerint (`konvenciok.md`).

## 7. Tesztelés

- Unit tesztek Vitesttel: jelszó-szabály validátor, session middleware, register/login handlerek (Prisma mockolva).
- `ask-agent.spec.ts` átírása az AI SDK mockolására, meglévő eset-lefedettség megtartásával.
- TDD ahol értelmes: piros → zöld → refaktor.
- E2E (Playwright) a regisztráció → belépés → chat kritikus útra, ha időben belefér — nem blokkoló ezen al-projekt lezárásához.

## 8. Nyitott kérdések a következő al-projektek felé (nem ennek a spec-nek a hatásköre)

- A staff/admin fiókok létrehozásának pontos módja (seed-szkript paraméterei) a B al-projektben dől el, amikor az ügyintézői jogosultságok ténylegesen használatba kerülnek.
- A `/debug/knowledge` végpont szerepkör-korlátozása (jelenleg: bármely bejelentkezett fiók) felülvizsgálható, ha B/D al-projektben kiderül, hogy ügyfél elől el kell rejteni.
