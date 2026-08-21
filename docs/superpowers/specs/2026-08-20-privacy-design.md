# Adatvédelem / anonimizálás — design spec

> Épít: `docs/extension-for-customers.md` (cégvezetői elvárások, 86-87. sor), `docs/superpowers/specs/2026-08-19-email-simulation-design.md` (C — `sendSimulatedEmail`, az `/emails` könyvtár forrása), `docs/architektura.md`, `docs/konvenciok.md`.
> Ez a spec a `docs/extension-for-customers.md`-ben leírt felbontás **F al-projektjét** (adatvédelem/anonimizálás) írja le — ez az utolsó al-projekt a felbontásban.

## Előfeltétel

Az E al-projekt (metrikák) kész, review-val lefedve, és `master`-be merge-elve (`#5` PR).

## 1. Adottságok (a feladat rögzíti, nem tervezési döntés)

- A rendszerbe kerülő személyes adatoknak anonimizálódnia kell, vagy el kell tűnnie.
- Tudni kell, hogy hol fut a modell, hova utazik az adat, és mi az, ami sosem hagyja el a saját környezetünket.

## 2. Tervezési döntések

**2.1 — Három, egymástól független szállítmány.** A két doksi-követelmény (adat-eltűnés/anonimizálás, adatfolyam-átláthatóság) különböző jellegű munkát igényel — az egyik tiszta dokumentáció, a másik kettő valódi mechanizmus. Nincs értelme egy monolitikus "adatvédelmi" komponensbe gyömöszölni őket.

**2.2 — Adatfolyam-dokumentáció, kódváltozás nélkül.** Egy új `docs/adatvedelem.md`, ami a jelenlegi kódbázis TÉNYLEGES külső API-hívásait térképezi fel (nem feltételezve, hanem a forráskódból ellenőrizve): az Anthropic API (`claude-sonnet-5`) kapja a teljes chat-beszélgetést (agent fő út + CLI) és a rendelés-visszaigazoló e-mail összeállításához az ügyfél nevét/megszólítását/rendelés-adatait; az OpenAI API kapja a növénygondozási kérdés szövegét (beágyazás + HyDE lekérdezés-bővítés a tudásbázis-keresésben). Az eszkalációs e-mail SZÁNDÉKOSAN nem hív LLM-et (D al-projekt döntése), ezért az az adatút helyben marad. Minden más (`accounts`, `orders`, `escalations`, `sessions`, `products`, `knowledge_chunks`, `/emails`) kizárólag a helyi Postgres-ben / helyi fájlrendszeren létezik, sosem utazik külső szolgáltatáshoz.

**2.3 — `/emails` megőrzési mechanizmus: önálló script, nem szerver-integrált ütemező.** A szimulált e-mail-fájlok valós ügyfél-nevet/e-mail-t tartalmaznak, jelenleg időkorlát nélkül. A megoldás egy futtatható tsx-script (`packages/db/prisma/cleanup-old-emails.ts`, a meglévő seed-szkriptek mintájára és helyén), ami törli a megadott napnál (alapértelmezetten **30 nap**) régebbi `.md` fájlokat az `/emails` könyvtárból, a fájl `mtime`-ja alapján. Nincs új in-process időzítő a szerverben — egyszerűbb, tesztelhetőbb egy demo-projektnél, és kézzel vagy külső ütemezővel (cron) is indítható.

**2.4 — Fiók-anonimizálás: irreverzibilis, staff-indított, üzleti rekordokat megtartó.** Egy új `POST /api/staff/accounts/:id/anonymize` végpont (staff/admin-only) a `fullName`/`salutation`/`email` mezőket placeholderekre cseréli, a jelszót visszafejthetetlenné teszi, és törli a fiók összes aktív session-jét — de az `orders`/`escalations`/`order_audit_log` sorokat ÉRINTETLENÜL hagyja (üzleti/audit-rekordok maradnak, csak többé nem köthetők valódi személyhez). Egy új `anonymizedAt` mező (null = normál fiók) garantálja az idempotenciát és teszi lekérdezhetővé az állapotot.

**2.5 — Minimális staff-lista a B/D/E mintájára.** `GET /api/staff/accounts` + egy `StaffAccountsPage` (id/név/e-mail/szerepkör/anonimizálva-e oszlopok, "Anonimizálás" gomb soronként, már anonimizált fióknál letiltva/elrejtve). A `StaffArea` fül-váltó egy negyedik füllel bővül ("Fiókok").

## 3. Adatséma

```sql
alter table accounts add column anonymized_at timestamptz;
```

Nincs új tábla — a meglévő `accounts` tábla kap egy nullable mezőt.

## 4. Anonimizálás — pontos viselkedés

Sikeres `POST /api/staff/accounts/:id/anonymize` a fiók sorát a következőképpen írja át (egy tranzakcióban a session-törléssel együtt):

- `fullName` → `"Törölt felhasználó #<id>"`
- `salutation` → `"Ügyfél"` (a megszólítás mezőt is az ügyfél adta meg szabad szövegként — előfordulhat, hogy a saját nevét írta oda, ezért ezt is scrub-olni kell, nem csak a `fullName`-et)
- `email` → `"anonim-<id>@plantbase.hu"` (determinisztikus, kielégíti az `accounts.email`-en lévő `@unique` megkötést)
- `passwordHash` → egy valódi bcrypt-hash egy véletlen, eldobott értékről (a meglévő `hashPassword` segédfüggvénnyel) — a bemenet sosem kerül tárolásra, tehát a bejelentkezés kriptográfiailag lehetetlenné válik, nem csak egy flag-gel van letiltva
- `anonymizedAt` → `now()`
- A fiókhoz tartozó ÖSSZES `sessions`-sor törlődik — bármely éppen bejelentkezett munkamenet azonnal megszűnik

**Idempotencia:** ha `anonymizedAt` már be van állítva, a végpont hibát ad vissza (nem fut le újra, nem kever bele egy második placeholder-generációt).

**Bejelentkezés-védelem (defense-in-depth):** a `POST /api/auth/login` explicit ellenőrzi `anonymizedAt`-ot, és — akárcsak rossz jelszónál — ugyanazt az általános "Hibás e-mail vagy jelszó." 401-et adja vissza, sosem külön üzenetet (ami elárulná, hogy az adott e-mail egy anonimizált fiókhoz tartozik).

**Amit szándékosan érintetlenül hagy:** az adott fiókhoz tartozó `orders`/`escalations`/`order_audit_log` sorok megmaradnak — valós üzleti/audit-rekordok, csak többé nem vezetnek vissza valódi névhez/e-mail-hez, miután maga a fiók anonimizálódott. Ez megfelel az anonimizálás/pszeudonimizálás szokásos gyakorlatának: a tranzakció-történet megmarad, csak az azonosító-kapcsolat szűnik meg. Hasonlóképp, a `/emails` könyvtárban korábban keletkezett szimulált e-mail-fájlok is változatlanok maradnak — a bennük szereplő valódi név/e-mail-cím a megőrzési script (6. szakasz) lefutásáig a fájlrendszeren marad.

## 5. Szerver (`apps/server`)

**`apps/server/src/lib/accounts-store.ts`** — `anonymizeAccount(accountId): Promise<{ ok: true } | { ok: false; reason: string }>` (a `cancelOrder` mintájára: sentinel-hiba a tranzakción belül az "már anonimizálva van" esethez, `{ok:false, reason}`-ra alakítva a hívó felé) + `listAccountsForStaff(): Promise<AccountSummary[]>`.

**Staff-only REST végpontok** (`requireAccount` + `requireRole('staff', 'admin')`):

- `GET /api/staff/accounts` — lista.
- `POST /api/staff/accounts/:id/anonymize` — anonimizálás indítása.

**`apps/server/src/routes/auth.ts`** bővítése: a login handler `anonymizedAt` ellenőrzéssel egészül ki (5. szakasz "Bejelentkezés-védelem" pontja).

## 6. `packages/db` — megőrzési script

**`packages/db/prisma/cleanup-old-emails.ts`** — a repo-gyökér `/emails` könyvtárát olvassa (ugyanaz az útvonal-számítási minta, mint `packages/core/src/lib/email/send-simulated-email.ts`-ben), törli a konfigurált napnál (alapértelmezett 30) régebbi `.md` fájlokat `mtime` alapján, kiírja a törölt fájlok számát/nevét a konzolra.

## 7. Minimális `apps/web` staff-felület

`StaffAccountsPage` — tábla (id, név, e-mail, szerepkör, anonimizálva-e), "Anonimizálás" gomb soronként (megerősítő `confirm()`-mel, mivel irreverzibilis), már anonimizált fióknál a gomb helyett egy státusz-szöveg. `app.tsx`'s `StaffArea` fül-váltója negyedik füllel bővül ("Fiókok").

## 8. Biztonság

- Mindkét új végpont csak `staff`/`admin` számára érhető el.
- Az anonimizálás irreverzibilis és idempotens (5. szakasz).
- A jelszó-visszafejthetetlenné-tétel valódi kriptográfiai hash-elésen alapul, nem egy törölhető/megkerülhető flag-en.
- A login-védelem sosem árul el állapot-információt (ugyanaz az általános hibaüzenet, mint rossz jelszónál).

## 9. Hibakezelés

- Már anonimizált fiók újra-anonimizálási kísérlete → egyértelmű hiba, nincs mellékhatás.
- Nemlétező fiók-ID → 404 (a staff-orders/staff-escalations mintájára).
- A cleanup-script hibás/hiányzó `/emails` könyvtár esetén nem hibázik (létrehozza, ha nincs, a `sendSimulatedEmail` mintájára), üres eredménnyel tér vissza, ha nincs törlendő fájl.

## 10. Tesztelés

- `accounts-store.spec.ts` — Prisma mockolva, az anonimizálás mezőcseréinek + idempotencia-ellenőrzésének + session-törlésnek a tesztje.
- `apps/server/src/routes/staff-accounts.spec.ts` — supertest, 401/403/200/404.
- `apps/server/src/routes/auth.spec.ts` bővítése — anonimizált fiókkal való bejelentkezési kísérlet 401-et ad, ugyanazzal az üzenettel, mint rossz jelszónál.
- `cleanup-old-emails.spec.ts` — valódi ideiglenes könyvtárban, kontrollált `mtime`-ú fájlokkal (régi törlődik, friss megmarad).
- Manuális E2E (a B/C/D/E záró task-jainak mintájára): a cleanup-script valódi futtatása kontrollált fájlokkal; egy teszt-fiók anonimizálása a staff-felületen keresztül, ellenőrizve, hogy a bejelentkezés utána elutasításra kerül, a korábbi rendelések/eszkalációk staff számára továbbra is láthatók (scrub-olt névvel), és az e-mail-mező ütközésmentes placeholder.

## 11. Nyitott kérdések

Nincsenek — ez a `docs/extension-for-customers.md` felbontásának utolsó al-projektje.
