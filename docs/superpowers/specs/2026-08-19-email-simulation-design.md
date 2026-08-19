# E-mail-szimuláció — design spec

> Épít: `docs/extension-for-customers.md` (cégvezetői elvárások, 62-77. és 84-90. sor), `docs/superpowers/specs/2026-08-18-order-subsystem-design.md` (B al-projekt — rendelés-alrendszer, ennek a specnek az előfeltétele), `docs/architektura.md`, `docs/konvenciok.md`.
> Ez a spec a `docs/extension-for-customers.md`-ben leírt felbontás **C al-projektjét** (e-mail-szimuláció) írja le. Hatókör: a megosztott e-mail-szimulációs infrastruktúra (fájlnév-konvenció, `.md`-írás, LLM-alapú tartalom-összeállítás) **és** a rendelés-életciklus e-mailek (létrehozás, minden valódi státuszváltás). Az eszkalációs (ügyfélszolgálati) levél triggerelése — az off-topic/eszkalációs döntéslogika — a D al-projekt hatásköre; D a jelen specben létrehozott megosztott `sendSimulatedEmail` mechanizmust fogja újrahasználni.

## Előfeltétel

A B al-projekt (rendelés-alrendszer) kész, review-val lefedve, és `master`-be merge-elve (`#2` PR). C erre épül: az `orders` tábla `email` mezője és az `order_audit_log` már létezik, az `orders-store.ts` CRUD-műveletei már tranzakciós audit-írással működnek.

## 1. Adottságok (a feladat rögzíti, nem tervezési döntés)

- Rendelés-létrehozáskor, ha az ügyfél e-mail-értesítést kért, minden státuszváltáskor levelet kell küldeni — a rendelés adatai alapján az agent állítson össze egy értelmes, udvarias, magyar nyelvű e-mail-t.
- Az e-mail-küldés jelenleg csak szimuláció: minden e-mail a `/emails` alkönyvtárba kerül, `.md` fájlként, `email_<ttt>_<datetime>.md` névkonvencióval (`ttt` = címzett, ékezet nélkül, speciális karakterek `_`-ra cserélve; `datetime` = `YYYYMMDD_hhmm`).
- Két konkrét példa a dokumentumban: `email_ugyfelszolgalat_20260817_1916.md` (eszkalációs levél az ügyfélszolgálatnak), `email_kovacs_bela_20260817_1917.md` (státusz-levél egy Kovács Béla nevű ügyfélnek).

## 2. Tervezési döntések

**2.1 — LLM állítja össze a tartalmat, determinisztikus sablon-fallback-kel.** A doksi szó szerint azt írja, hogy "állítson össze az agent egy értelmes, udvarias, magyar nyelvű e-mail-t" — ez egy valódi LLM-hívást jelent minden triggerelő eseménynél, nem fix sablont. Ha az LLM-hívás hibázik vagy időtúllépést kap, egy fix, determinisztikus magyar sablon lép életbe (a rendelés adataival kitöltve) — az e-mail mindig elkészül, és a rendelés-művelet sosem bukik el csak az e-mail miatt.

**2.2 — Az e-mail-küldés a háttérben fut (fire-and-forget), a rendelés-műveletet nem blokkolja.** A `createOrder`/`cancelOrder`/`updateOrderStatus` HTTP- illetve chat-válasza azonnal megérkezik; az e-mail-összeállítás (LLM-hívás) és -írás a háttérben, a válasz elküldése után történik. Hiba esetén csak logolás, a fő művelet válasza már úgyis elment. A rendszerprompt egy sorral bővül: sikeres `createOrder`/`cancelOrder` után, ha az ügyfél kért e-mail-értesítést, az agent a saját válaszában említse meg, hogy hamarosan e-mail is érkezik — ez tisztán prompt-instrukció, nincs hozzá külön technikai "loading" jelzés vagy UI-módosítás.

**2.3 — Hatókör-határ D felé.** A megosztott alacsony szintű `sendSimulatedEmail(recipient, subject, body)` írófüggvény (fájlnév-konvenció + `.md`-írás) általános célú, nem rendelés-specifikus — ezt a D al-projekt (eszkaláció) újrahasználja majd az ügyfélszolgálati levélhez. A tartalom-összeállító `composeOrderEmail` viszont rendelés-specifikus; D-nek majd saját, eszkaláció-specifikus tartalom-összeállító függvénye lesz.

**2.4 — Triggerelési feltételek (pontosítás a doksi "minden státuszváltáskor" megfogalmazásához képest).**
- `createOrder`: mindig triggerel, ha `input.email === true` (esemény: "created").
- `cancelOrder`: triggerel, ha `existing.email === true` (esemény: "cancelled") — ez is státuszváltás (→ `lemondva`).
- `updateOrderStatus`: **csak akkor** triggerel, ha `existing.status !== updated.status` **és** `updated.email === true` — egy csak `payed`-et módosító staff-PATCH (a `status` mező változatlan) nem számít státuszváltásnak, még ha az audit-napló `action`-je `status_changed` is. Esemény: "status_changed".
- `correctOrder`: sosem triggerel (nem érinti a `status` mezőt — a `StatusUpdateSchema`/`OrderCorrectionSchema` szétválasztása ezt már B-ben garantálja).
- Az e-mail címzettje mindig a rendelés tulajdonosa (`order.accountId`), nem a műveletet végző fiók (`updateOrderStatus`-nál ez staff/admin).

**2.5 — Fájlnév-ütközés kezelése (hiányzó eset a doksiban).** A névkonvenció csak perc-pontosságú — ha ugyanahhoz a címzetthez ugyanabban a percben két e-mail is menne (pl. gyors egymás utáni létrehozás+lemondás), a második felülírná az elsőt. Megoldás: ha a generált fájlnév már létezik, egy `_2`, `_3`, ... számláló-utótag kerül hozzá — a domináns (leggyakoribb) eset így pontosan a doksi példáinak megfelelő fájlnevet ad, ütközésnél pedig nem vész el adat.

## 3. Architektúra

**`packages/core` bővítés** (nem sérti a "core sosem függ db-től" szabályt — `fs`-hozzáférés nem adatbázis-hozzáférés):

- `packages/core/src/lib/email/send-simulated-email.ts` — `sendSimulatedEmail({ recipientLabel, recipientAddress, subject, body }): Promise<{ filePath: string }>`. Slugify (`normalize('NFD').replace(/[\u0300-\u036f]/g,'')` → lowercase → nem-`[a-z0-9]` karakterek `_`-ra → trim), fájlnév-ütközés kezelése (2.5), `.md`-írás a repo-gyökér `/emails` könyvtárába.
- `packages/core/src/lib/email/compose-order-email.ts` — `composeOrderEmail(order: OrderEmailData, account: OrderEmailAccount, eventType: 'created' | 'cancelled' | 'status_changed'): Promise<{ subject: string; body: string }>`. Egy `generateText` hívás (ugyanaz az `AGENT_MODEL`/`anthropic(...)`, amit a `stream-agent.ts`/`ask-agent.ts` is használ), dedikált magyar rendszerprompt csak erre a célra. Hiba/timeout esetén determinisztikus sablon-fallback (2.1).
- `system-prompt.ts` — egy új mondat az `ORDER_PROMPT_ADDITION`-ben (2.2).

**`apps/server` bővítés:**

- `apps/server/src/lib/order-emails.ts` (új) — `notifyOrderEvent(orderId, accountId, eventType): void` (fire-and-forget, nem `async` a hívó felől — belül `void (async () => {...})().catch(logError)`), lekérdezi a fiók adatait (`fullName`/`salutation`/`email`), meghívja a `composeOrderEmail` + `sendSimulatedEmail`-t, mindent try/catch-be zárva.
- `orders-store.ts` — a három érintett függvény (`createOrder`, `cancelOrder`, `updateOrderStatus`) a tranzakció commit-ja UTÁN (nem belül — az e-mail nem lehet a DB-tranzakció része) meghívja `notifyOrderEvent`-et a 2.4-es feltételek szerint.
- `.gitignore` — `emails/*.md` hozzáadása (a `.gitkeep` marad követve, a generált e-mailek nem kerülnek verziókezelésbe).

## 4. Adatformátum

**Fájlnév:** `email_<ttt>_<YYYYMMDD>_<hhmm>.md` (helyi szerveridő), ütközésnél `_2`/`_3`/... utótaggal (2.5).

**Fájltartalom** (Markdown):
```markdown
# <Subject>

**Címzett:** <account.email>
**Dátum:** <YYYY.MM.DD. HH:mm>

<body — 2-4 rövid bekezdés, magyarul, udvarias hangnem>
```

**`composeOrderEmail` bemenete:** a rendelés releváns mezői (`orderId`, `status`, `orderDesc`, `price`), a fiók `fullName`/`salutation`-je, és az `eventType`. A dedikált rendszerprompt instruálja az LLM-et: rövid, természetes, udvarias magyar hangnem, a megszólítás mezőt használja, tartalmazza a rendelésszámot és az aktuális státuszt.

## 5. Hibakezelés

- `notifyOrderEvent` teljes törzse try/catch-ben — LLM-hiba, fiók-lookup hiba, fájlrendszer-hiba mind csak logolódik, sosem jut vissza a hívóhoz.
- `composeOrderEmail` belső hiba esetén nem dob — a determinisztikus sablonra esik vissza (2.1), így `notifyOrderEvent` mindig kap érvényes `{subject, body}`-t az íráshoz; a fenti try/catch csak a fájlrendszer- és fiók-lookup-hibák ellen véd.
- Fájlnév-ütközés: 2.5 szerint kezelve, nem hibaeset.

## 6. Tesztelés

- `send-simulated-email.spec.ts` — slugify a doksi két példájával verbatim + szélsőértékek (egymást követő ékezetek, aposztróf, üres név), fájlütközés-utótag, fájltartalom-szerkezet (ideiglenes könyvtárban vagy `fs` mockolva).
- `compose-order-email.spec.ts` — az AI SDK hívás mockolva (a repóban már használt `MockLanguageModelV4`-mintával), prompt-összeállítás ellenőrzése, és a sablon-fallback útvonal szimulált LLM-hiba esetén.
- `order-emails.spec.ts` (`apps/server`) — a 2.4-es triggerelési feltételek pontos ellenőrzése (triggerel create/cancel/valódi státuszváltásnál, NEM triggerel csak-`payed`-váltásnál és `correctOrder`-nél, NEM triggerel `email: false`-nál), és hogy egy dobott hiba az e-mail-útvonalon sosem jut vissza a hívóhoz.
- Manuális E2E (B Task 13 mintájára): valódi rendelés-létrehozás/lemondás/státuszváltás a valódi chat- és staff-folyamaton keresztül, ellenőrizve, hogy a `.md` fájlok ténylegesen megjelennek az `emails/` alatt helyes névvel és értelmes LLM-tartalommal.

## 7. Nyitott kérdések a következő al-projektek felé (nem ennek a spec-nek a hatásköre)

- Az eszkalációs (ügyfélszolgálati) levél triggerelése — mikor dönt úgy az agent, hogy "nem tud segíteni" — a D al-projekt (eszkaláció/off-topic kezelés) hatásköre; D a jelen specben létrehozott `sendSimulatedEmail`-t hívja majd egy saját, eszkaláció-specifikus tartalom-összeállítóval.
- Az E (metrikák) al-projekt esetleg mérni akarhatja az e-mail-küldés sikerességét/hiba-arányát — ez a jelen specnek nem tárgya, de a `notifyOrderEvent` try/catch-ének van egy logolási pontja, amire E ráépülhet.
