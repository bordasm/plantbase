# Plantbase — implementációs terv (proposal)

> Épít: `brs-plantbase.md` (mit), `stack.md` (mivel), `architektura.md` (hogyan), `konvenciok.md` (kódstílus), `dev-workflow.md` (git/hook).
> Döntés a tervezés során: **Prisma 6** (nem 7) — a `seed/README.md` már erre a konvencióra épül (`package.json` → `prisma.seed`), és ez a kipróbáltabb, jelenleg is széles körben használt ág.

## Alapszabály (mindkét részre érvényes)

- **Minden fázis kicsi, önállóan tesztelhető increment.** Fázis végén: manuális/automata teszt → várom a visszajelzésed → utána **egy** fókuszált commit (Conventional Commits, `dev-workflow.md` szerint).
- **Új vagy ritkán használt library előtt mindig Context7.** Mielőtt egy fázisban új API-t érintünk (Nx generátor, Prisma 6 schema/seed, `pg`, Anthropic SDK tool-use), előbb a friss doksit olvasom be, csak utána kódolok.
- Környezet-ellenőrzés (elvégezve a tervezéskor): Node v24.18.0 (LTS), pnpm 11.9.0, git 2.51.0 — megfelelnek. **Docker Desktop-ot az A2 fázis előtt el kell indítani** (`docker info` most nem válaszolt, a daemon nem fut/nincs elérve).

---

## A) A KÖRNYEZET LÉTREHOZÁSA

**Mérföldkő:** a projekt fut és tesztelhető — Nx monorepo áll, a DB séma migrálva és seedelve, a CLI elindul.

### A0 — Repo alapok
- `git init`, gyökér `.gitignore` (node_modules, dist, .env, logs/), root `README.md` (rövid, a `docs/`-ra mutat).
- Teszt: `git status` tiszta, `git log` egy kezdő commitot mutat.
- Commit: `chore: init repository`

### A1 — Nx workspace (pnpm)
- Context7: Nx TypeScript-template workspace generálás.
- `npx create-nx-workspace@latest plantbase --template=nrwl/typescript-template --packageManager=pnpm` (a projekt gyökerén, `docs/` és `seed/` megtartásával — becsomagolva/összefésülve, nem felülírva).
- Teszt: `pnpm nx --version`, `pnpm install` hiba nélkül lefut.
- Commit: `chore: scaffold nx workspace with pnpm`

### A2 — packages/db (Prisma 6 lib)
- Context7: Prisma 6 schema.prisma + `prisma migrate dev` friss doksi.
- `@nx/js:lib packages/db --bundler=tsc --unitTestRunner=none` generálás, majd `pnpm add -D prisma`, `pnpm add @prisma/client` a libbe; `prisma init` a lib alá.
- `schema.prisma`: `products` modell a `stack.md` séma szerint (mezőnevek, típusok, értékkészletek kommentben).
- `docker-compose.yml` (gyökér): Postgres szolgáltatás, `.env.example` (`DATABASE_URL`, `DATABASE_URL_READONLY` placeholder).
- Docker Desktop elindítása (manuális, felhasználói lépés) → `docker compose up -d` → `pnpm prisma migrate dev --name init` a `packages/db`-ben.
- Teszt: migráció lefut, `products` tábla létezik (`psql` vagy `prisma studio` gyors ellenőrzés).
- Commit: `feat: add prisma db package with products schema`

### A3 — Seed betöltése (a meglévő adatból, nem generálunk újat)
- A meglévő `seed/plants.ts` + `seed/seed.ts` átmásolása a `packages/db/prisma/`-ba (a `seed/README.md` instrukciója szerint).
- `package.json` (db lib): `"prisma": { "seed": "tsx prisma/seed.ts" }`.
- Teszt: `pnpm prisma db seed` → „Seed kész: 30 növény betöltve.", `SELECT count(*) FROM products;` = 30.
- Commit: `feat: load plant seed data`
- (A gyökér `seed/` mappa ezután törölhető, mert a tartalma bekerült a `packages/db`-be — jóváhagyás után külön lépésben.)

### A4 — packages/core csontváz
- `@nx/js:lib packages/core --bundler=tsc --unitTestRunner=vitest --linter=eslint`.
- Egyelőre üres/placeholder публic API (pl. egy `ping()` export), hogy a build/teszt gépezet igazoltan működjön — az agent-logika a B) részben kerül bele.
- Teszt: `pnpm nx test core` zöld, `pnpm nx build core` hiba nélkül.
- Commit: `chore: scaffold core package`

### A5 — apps/cli csontváz (elindul, de még nincs logika)
- Context7: `@nx/node:application` generátor opciói.
- `@nx/node:application apps/cli --bundler=esbuild --unitTestRunner=vitest --e2eTestRunner=none`, `commander` hozzáadása.
- Egyetlen parancs egyelőre: `plantbase --version` (a `package.json` verzióját írja ki), a `core` package importálva (bizonyítva, hogy a projekt-referenciák működnek).
- Teszt: `pnpm nx serve cli -- --version` (vagy `pnpm tsx apps/cli/src/main.ts --version`) helyes kimenetet ad.
- Commit: `feat: cli skeleton wired to core`

### A6 — Tooling zárás + hook
- ESLint + Prettier root config (`konvenciok.md` szabályai: strict TS, naming stb.), `dev-workflow.md` szerinti `PostToolUse` hook (`settings.json`: prettier + `vitest related` Edit után).
- Teszt: egy próba-szerkesztés után a hook lefut (prettier formáz, releváns teszt fut).
- Commit: `chore: eslint/prettier config + edit hooks`

**A) lezárása:** `docker compose up -d && pnpm prisma migrate deploy && pnpm prisma db seed && pnpm nx serve cli -- --version` egy tiszta checkoutból végigfut. Ez a demózható „kész a környezet" állapot.

---

## B) AZ IMPLEMENTÁCIÓ 3 FÁZISA

**Mérföldkő:** működő `plantbase ask` / interaktív mód, valós SQL-alapú válasszal (BRS demo-kritérium).

A három fázis szándékosan réteges: minden fázis után **kérni fogom, hogy teszteld**, mielőtt a következőre lépek.

### B1 — CLI visszhang (echo), LLM nélkül

Cél: a CLI-gépezet (parancs, interaktív mód, input-validáció) bizonyítottan működik, mielőtt bármi külső függőség (LLM, DB) bejönne.

- B1.1 — `plantbase ask "<szöveg>"`: egyszerűen visszaírja a bemenetet. Teszt: `plantbase ask "szia"` → `szia`.
- B1.2 — Interaktív mód (`node:readline`), sortörésenként echo, `exit`-ig. Teszt: néhány sor + `exit`.
- B1.3 — Zod-validáció a bemeneti határon (üres/whitespace-only input → beszédes hiba, nem echo). Teszt: üres string eset.
- Commit: `feat: cli echo skeleton (ask + interactive mode)`

→ **kérem a tesztedet, mielőtt B2-re lépek.**

### B2 — LLM bekötve, adatbázis nélkül

Cél: valódi Anthropic-hívás működik, de az agent **nem kap `runSql` toolt** és nem kap teljes séma-promptot — így egy adatra vonatkozó kérdésnél őszintén be kell vallania, hogy nincs adatbázis-hozzáférése (nem szabad hallucinálnia adatot).

- B2.1 — Context7: Anthropic SDK TS aktuális `messages.create` API. `packages/core`: Anthropic kliens wrapper (`ANTHROPIC_API_KEY` env-ből), egy ideiglenes, szűkített system prompt: „Plantbase asszisztens vagy, de jelenleg NINCS adatbázis-hozzáférésed; ha konkrét növény-/ár-/készletadatra kérdeznek, mondd meg őszintén, hogy ezt most nem éred el." Tool nélküli hívás.
- B2.2 — CLI `ask` + interaktív mód átkötése az echo helyett erre a hívásra.
- B2.3 — Manuális teszt: (a) általános kérdés (pl. „mi a különbség a pozsgás és a kaktusz között?") → értelmes, kitalált-adatmentes válasz; (b) adatra vonatkozó kérdés (pl. „melyik növény van most akcióban?") → őszinte elutasítás, nincs hallucinált termék/ár.
- Commit: `feat: wire cli to anthropic sdk (no db access yet)`

→ **kérem a tesztedet, mielőtt B3-ra lépek.**

### B3 — SQL-es interakció (teljes agent)

Cél: az FR1–FR5 lezárása — a `runSql` tool, a teljes `system-prompt.md`, a napló és a `--show-prompt` bekötve.

- B3.1 — Context7: `pg` (node-postgres) friss doksi (ez még nincs a `stack.md`-ben rögzítve — a read-only, agent-generálta SQL futtatásához kell, Prisma helyett, az `architektura.md` #2 döntése szerint). `packages/core/run-sql.ts`: kapcsolat a `DATABASE_URL_READONLY`-n, **csak `SELECT`** engedélyezett (guard: elutasítja, ha a lekérdezés nem `SELECT`-tel kezdődik, vagy DDL/DML kulcsszót tartalmaz). Unit teszt a guardra (SELECT átmegy, INSERT/UPDATE/DELETE/DROP eldobva).
- B3.2 — `packages/core/system-prompt.ts`: a `docs/system-prompt.md` XML-promptjának betöltése kódba (egy az egyben, ne duplikáljuk szabadon).
- B3.3 — `askAgent` bővítése: teljes system prompt + `runSql` tool regisztrálva, kézzel írt tool-use loop (nem framework — `architektura.md` #3 döntés): modell → `tool_use` → `runSql` lefuttatása → `tool_result` visszaküldése → végleges NL válasz.
- B3.4 — FR4, napló: minden interakció JSONL-be (`logs/<timestamp>.jsonl`): system prompt, üzenetek, generált SQL, eredménysorok, végső válasz, token-használat.
- B3.5 — FR5, `--show-prompt` kapcsoló: a teljes üzenet-tömb kiírása a válasz mellett.
- B3.6 — Manuális/demo teszt a BRS sikerkritériuma szerint: pl. „Milyen alacsony fényigényű, kezdőknek való szobanövény van raktáron 5000 Ft alatt?" → helyes SQL (`COALESCE(sale_price, price)`, `stock > 0`, `LIMIT`) → helyes, tömör magyar válasz. Ellenőrzés: a napló-fájl és `--show-prompt` valóban mutatja a folyamatot.
- Commitok (fázisonként külön, a fenti bontás szerint):
  `feat: read-only runSql tool with select-only guard`
  `feat: full system prompt + tool-use loop`
  `feat: jsonl interaction logging`
  `feat: --show-prompt flag`

→ **kérem a tesztedet minden B3-as al-lépés után is**, mielőtt a következő al-lépésre lépek.

**B) lezárása = v1 demo-kész:** a BRS 5. pontja szerinti sikerkritériumok (helyes SQL → helyes válasz, csak SELECT, teljes napló, `--show-prompt` átláthatóság) mind teljesülnek.
