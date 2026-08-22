# Mérési terv — Plantbase ügyfélszolgálati agent (A-F al-projektek)

> Minden sor egy meglévő vagy hiányzó adatforrásra mutat. A "Ma létezik?" oszlop jelzi, ha a PoC ma nem naplózza az adott mérőszámot — ilyenkor a "Mit kell hozzá beépíteni?" oszlop mondja meg, mi hiányzik.

| Mit mérünk? | Honnan lesz adat? | Hogyan riportáljuk? | Kinek? | Ma létezik? | Mit kell hozzá beépíteni? |
|---|---|---|---|---|---|
| **Munkaidőn kívüli forgalom aránya** (a #1 fájdalom relevanciája/lefedettsége) | `orders` + `escalations` tábla `createdAt` mezője, hétfő-péntek 9-17 sávhoz viszonyítva (`isBusinessHours`, `apps/server/src/lib/metrics-store.ts`) | Élő szám a staff "Metrikák" fülön (`GET /api/staff/metrics`) | Ügyfélszolgálati vezető, üzemeltető | **Igen** | — |
| **Eszkalációs arány** (az agent saját hiba-/limitáció-rátája — kötelező, a sikert NEM méri) | `escalations` tábla sorainak aránya `orders + escalations` összeshez képest (`computeMetrics`) | Élő szám a staff "Metrikák" fülön | Ügyfélszolgálati vezető, fejlesztőcsapat | **Igen** | — |
| **Ismétlődő-kérdés terhelés csökkenése** (a #2 fájdalomhoz kötött use case-ígéret) | Közvetve az eszkalációs arány komplementere (ami nem eszkalált, azt az agent önállóan oldotta meg) — de nincs külön "gondozási kérdés vs. rendelés-kérdés" bontás | Havi trend-riport (ügyfélszolgálati vezető állítja össze kézzel a Metrikák fül adataiból) | Ügyfélszolgálati vezető | **Részben** | Külön számláló a `searchKnowledge` tool-hívásokra (hány gondozási kérdést válaszolt meg az agent staff nélkül) |
| **Rendelés-státusz önkiszolgálás használata** (a #4 fájdalomhoz kötött use case-ígéret) | Nincs jelenleg számláló arra, hányszor kérdez rá az ügyfél a chatben a saját rendelése státuszára | — | — | **Nem** | Egy egyszerű esemény-számláló a rendelés-státusz agent-tool meghívásaira |
| **Egy kérdés tényleges token-költsége éles forgalomban** | Az AI SDK válasz `usage` mezője (input/output token) — a CLI-ágon már naplózva (`logs/*.jsonl`), a web-chat ágon NEM | Havi összesítő a folyamatgazdának, riasztás küszöbérték felett | Folyamatgazda (üzemeltető), pénzügy | **Részben** (csak CLI) | A web-chat (`stream-agent.ts`) is írja ki a `usage`-t egy naplóba/táblába, napi/fiókonkénti összesítéssel |
| **Válaszidő az ügyfél felé** | Nincs jelenleg mért időbélyeg a kérdés beérkezése és az első agent-válasz-token között | — | — | **Nem** | Időbélyeg-pár naplózása a chat route-ban, percentilis-riport (p50/p95) |
| **Anonimizálási/adatvédelmi lefedettség** | `accounts.anonymizedAt` mező kitöltöttsége az inaktív/törlést kérő fiókokhoz képest | Havi manuális ellenőrzés (staff "Fiókok" fül) | Adatvédelmi felelős | **Igen** (mechanizmus kész, riport manuális) | Automatikus havi összesítő, ha a fiókszám nő |

## Összegzés a kötelező kritériumokhoz

- **Legalább egy metrika a megoldott fájdalomhoz kötve:** a munkaidőn-kívüli forgalom aránya közvetlenül a #1 fájdalom (munkaidőn kívüli kiszolgálás) mértékét adja.
- **Legalább egy metrika az agent hibáját méri:** az eszkalációs arány pontosan azt számolja, amikor az agent NEM tudott önállóan válaszolni — ez a rendszer explicit "kudarc-metrikája", nem csak sikermutató.
- **Minden sorhoz létező adatforrás tartozik, vagy meg van jelölve, mit kell hozzá beépíteni** — 4 sor ma élesben működik, 3 sor részben vagy egyáltalán nem, ezekhez a hiányzó lépés fel van sorolva.
