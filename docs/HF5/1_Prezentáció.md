# Plantbase ügyfélszolgálati agent — miért éri meg
> Vezetői összefoglaló, ~5 perc, 8 dia.

---

## 1. dia — Mit építettünk

A meglévő, katalógus-kereső Plantbase agent **ügyfélszolgálati csatornává** bővült:

- **Bejelentkezéses webes chat** (React) — az ügyfél saját fiókkal beszélget az agenttel, folyamatosan fut, nem csak munkaidőben.
- **Rendelés-kezelés** — a chatből induló rendelés adatbázisba kerül, státusza (új → folyamatban → teljesítve/lemondva) végig nyomon követhető, minden változás naplózva.
- **Eszkaláció** — amit az agent nem tud megoldani, azt egy ügyintézőhöz továbbítja, automatikus összefoglalóval.
- **Metrikák** — a staff felületen élőben látszik a munkaidőn kívüli forgalom aránya és az agent saját "nem tudtam megoldani" rátája.
- **Adatvédelem** — fiók-anonimizálás, adatfolyam-dokumentáció, e-mail-megőrzési időkorlát.

---

## 2. dia — Melyik fájdalmat oldja meg

A cégvezetői elvárás-dokumentum 10 fájdalmat sorol fel. Ez a fejlesztési kör **5-öt old meg belőle**:

| # | Fájdalom | Hogyan oldja meg |
|---|---|---|
| 1 | Munkaidőn kívül nincs válasz | Az agent és a szerver folyamatosan fut, nem csak nyitvatartás alatt |
| 2 | Ugyanazt a kérdést naponta százszor válaszoljuk meg | Az agent önállóan válaszol a katalógus- és gondozási kérdésekre (RAG tudásbázis) |
| 4 | Ügyfél nem látja, hol tart az ügye | Önkiszolgáló rendelés-státusz lekérdezés a chatben |
| 8 | Sürgős ügy ugyanabban a sorban áll, mint a triviális kérdés | Az agent maga megválaszolja a rutinkérdéseket; csak a valós probléma jut el az ügyintézőhöz (eszkaláció) |
| 9 | Ügyfél attól függően kap más választ, ki veszi fel | Minden ügyfél ugyanazt az agentet, ugyanazt a rendszerpromptot és tudásbázist kapja |

**A maradék 5 fájdalmat ez a kör NEM oldja meg** — lásd 8. dia.

---

## 3. dia — Hogyan működik (üzleti nézetből)

```
Ügyfél (böngésző, bejelentkezve)
   │
   ▼
Chat felület ──► Agent (Claude Sonnet 5)
   │                  │
   │                  ├─ tudja a választ ────────────► válaszol
   │                  ├─ rendelést indítana ──────────► megerősítés → orders tábla
   │                  ├─ Plantbase-témájú, de nem tud segíteni ─► eszkalálás → ügyintéző e-mail + staff felület
   │                  └─ nem Plantbase-témájú ─────────► udvarias elutasítás, nincs eszkaláció
   ▼
Ügyintéző/üzemeltető felület: rendelések, eszkalációk, metrikák, fiókok
```

A rendelés **"teljesítve"** állapotba csak ügyintéző teheti, miután megnézte a rendelést — az agent önmagában sosem zárhat le rendelést.

---

## 4. dia — Adattérkép

| Adat | Hova megy | Mi marad helyben |
|---|---|---|
| Teljes chat-beszélgetés | Anthropic API (Claude Sonnet 5) | — |
| Ügyfél neve/megszólítása + rendelés adatai (visszaigazoló e-mail összeállításához) | Anthropic API (Claude Sonnet 5) | — |
| Gondozási kérdés szövege + jelölt tudásbázis-szövegek (relevancia-pontozás) | Anthropic API (Claude Haiku 4.5) | — |
| Gondozási kérdés / HyDE-szöveg (beágyazáshoz) | OpenAI API (`text-embedding-3-small`, `gpt-5-mini`) | — |
| Eszkalációs e-mail tartalma | **Sosem külső hívás** — determinisztikus sablon | Helyi Postgres |
| Fiókadat (név, e-mail, jelszó-hash) | — | Kizárólag helyi Postgres |
| Rendelések, eszkalációk, audit-napló | — | Kizárólag helyi Postgres |
| Szimulált e-mail-fájlok | — | Kizárólag helyi fájlrendszer, 30 napig |

---

## 5. dia — Rollout terv

1. **Pilot:** 1 ügyintéző csapat, korlátozott, önként jelentkező ügyfélkör (pl. 20-30 fiók), 2-4 hét.
2. **Döntési pont:** eszkalációs arány és munkaidőn-kívüli arány (lásd Mérési terv) stabil, az ügyintézők nem jeleznek rendszeres hibás agent-választ, nincs adatvédelmi incidens.
3. **Teljes bevezetés:** minden új regisztráció a chat felületet kapja; a meglévő telefonos/e-mailes csatorna párhuzamosan fut át egy átmeneti időszakon.
4. **Rendszergazda a go-live után:** az ügyfélszolgálati vezető (metrikák + eszkalációk napi átnézése), technikai eszkalációs pont a fejlesztőcsapat.

---

## 6. dia — Mérési terv (dia-szintű összefoglaló)

*(Részletes tábla: `2_Mérési terv tábla.md`.)*

- **A pilot sikerét méri:** munkaidőn-kívüli forgalom aránya, eszkalációs arány (staff "Metrikák" fül, élő adat).
- **Az agent hibáját is méri, nem csak a sikerét:** az eszkalációs arány pontosan azt méri, amikor az agent NEM tudott önállóan segíteni.
- **Valós forrásra épül:** mindkét metrika a tényleges `orders`/`escalations` táblákból számol, nem becslésből.

---

## 7. dia — Költség és megtérülés

| Tétel | Érték | Forrás |
|---|---|---|
| Egy ügyfélkérdés LLM-költsége | **~$0,03-0,05 (kb. 10-20 Ft)** | **Mért** — valós production-naplókból, `README.md` költségbecslés szakasza |
| Egy multi-step agent-kör felső korlátja | 5 lépés (`MAX_TOOL_ROUNDS`) | **Mért** — kódból (`agent-tools.ts`), ez korlátozza az elszabadulási kockázatot |
| Új infrastruktúra-költség | **0 Ft** | **Mért** — minden A-F al-projekt a meglévő helyi Postgres-t használja, nem adtunk hozzá felhő-szolgáltatást (`docs/adatvedelem.md` teljes külső-hívás listája) |
| Napi/fiókonkénti költségkorlát | **Nincs beépítve** | Ökölszám-becslés hiányzik — ez egy nyitott kérdés, lásd 3. dokumentum, 8. kérdés |

A haszon oldalán **óvatosan**: nincs élesben mért ügyfélszám vagy staff-idő-megtakarítás erre a konkrét ügyfélszolgálati funkcióra (ez egy PoC/demo repó, éles forgalom nélkül) — a pilot elsődleges célja pontosan ennek a mérése (lásd 5-6. dia).

---

## 8. dia — Mit NEM old meg ez a kör + nyitott pontok

- Új ügyfél első heteinek kísérése (#3)
- Személyre szabott, szegmentált kiszolgálás (#5)
- Panaszokból/kérdésekből való tanulás, elemzés (#6)
- Papírmunka/egyeztetés gyorsítása, szerződéskötés (#7)
- Lemorzsolódás előrejelzése (#10)

**Ismert, még nem lezárt technikai nyitott pont (részletesen a 3. dokumentumban):**
- Nincs üzemeltetői szintű "vészleállító" kapcsoló a chat-válaszadásra (csak a szerver leállítása).
- Nincs napi/fiókonkénti token-költség plafon.
- A webes chat teljes beszélgetés-tartalma nem kerül naplózásra sehova (csak a CLI-ágon, `logs/*.jsonl`, megőrzési szabály nélkül).
