# Plantbase — ROI (megtérülés) levezetés

> Épít a `brs-plantbase.md` 1. pontjára (a kiinduló idő- és ügyfélszámokra), egy **5 fős lakberendező-iroda** szintjére skálázva (minden lakberendező a BRS-beli persona szerint dolgozik: havi 5 ügyfél, 3 szoba/ügyfél). A dokumentum célja: hihető, végigkövethető számítással megmutatni, mekkora havi/éves megtakarítást eredményez a lefejlesztett agent az egész irodának — külön választva a **mért/számolt** adatokat (seed-katalógus, éles API-teszt) és a **feltételezéseket** (óradíj, csomagméret, árfolyam), hogy a becslés utólag is ellenőrizhető és finomítható legyen.

## 1. Bemeneti adatok

### 1.1 A BRS-ből, irodaszintre skálázva

| Adat | Egy lakberendező (BRS) | 5 fős iroda (5×) |
|---|---|---|
| Lakberendezők száma | 1 | **5** |
| Ügyfelek száma | 5 / hó | **25 / hó** |
| Szoba/ügyfél | 3 | 3 |
| Szobák száma | 15 / hó (180 / év) | **75 / hó (900 / év)** |
| Kézi idő/szoba (jelenleg) | 10–15 perc | 10–15 perc |
| Agent idő/szoba (KPI, cél) | < 5 perc | < 5 perc |

A szoba-szintű mennyiségek (idő, csomagérték, kérdésszám) személyenként azonosak maradnak — csak a lakberendezők száma (5) szorozza meg őket. Az egyszeri fejlesztési költség viszont **nem** szorzódik: egyetlen rendszert használ mind az 5 fő.

### 1.2 Feltételezések (nincs a BRS-ben, itt rögzítve)

| Feltételezés | Érték | Indoklás |
|---|---|---|
| Lakberendezői óradíj | 12 000 Ft/óra | Hazai freelance belsőépítész/lakberendezői középár-becslés |
| Csomagméret | 3 növény/szoba | Tipikus lakberendezői növénycsomag mérete (nem mért adat) |
| USD/HUF árfolyam | 380 Ft/$ | 2026 közepi becsült sáv |
| Kérdés/szoba (agenttel) | ~3 | Kérdés + finomítás/utókérdés interaktív módban |
| Fejlesztői ráfordítás (hagyományos, nem AI-asszisztált fejlesztéssel) | 4–6 fejlesztői nap, 15 000 Ft/óra | Egyszeri, az egész 5 fős irodára — csak az illusztratív megtérülési idő számításához (lásd 5. pont) |

### 1.3 Mért/számolt adatok

| Adat | Érték | Forrás |
|---|---|---|
| Akciós tételek aránya a katalógusban | 7/30 = 23,3% | `packages/db/prisma/plants.ts` (a 30 seedelt növényből 7-nek van `sale_price`-a) |
| Átlagos akciómélység | 20,75% | Ugyanott: (18900→15900, 4500→3600, 8900→6900, 2900→2200, 1990→1590, 15900→12900, 4200→3200) diszkontjainak átlaga |
| Átlagos tényleges egységár | 5 169 Ft/növény | A 30 tétel `COALESCE(sale_price, price)` értékének átlaga |
| Token-felhasználás / SQL-alapú kérdés | 3681 input / 549 output token | Éles teszt naplója (`logs/*.jsonl`), a B3 fázis demo-kérdésére ("Milyen alacsony fényigényű, kezdőknek való szobanövény van raktáron 5000 Ft alatt?") |
| Claude Sonnet 5 ár (MTok) | bevezető $2 / $10 (2026.08.31-ig), utána $3 / $15 | Anthropic hivatalos díjszabás |

---

## 2. A) Időmegtakarítás (elsődleges, kemény tétel)

```
Megtakarított idő/szoba = kézi idő − agent idő = 10–15 perc − 5 perc = 5–10 perc
Havi megtakarított idő  = 75 szoba × 5–10 perc  = 375–750 perc = 6,25–12,5 óra
Havi érték              = 6,25–12,5 óra × 12 000 Ft/óra = 75 000–150 000 Ft
```

| | Pesszimista (kézi: 10 perc) | Várható (közép) | Optimista (kézi: 15 perc) |
|---|---:|---:|---:|
| Megtakarított idő/szoba | 5 perc | 7,5 perc | 10 perc |
| Havi megtakarított idő (5 fő) | 6,25 óra | 9,375 óra | 12,5 óra |
| **Havi érték** | **75 000 Ft** | **112 500 Ft** | **150 000 Ft** |
| **Éves érték** | **900 000 Ft** | **1 350 000 Ft** | **1 800 000 Ft** |

---

## 3. B) Beszerzési / ár-optimalizálási megtakarítás (másodlagos, puhább tétel)

A BRS szerint az agent "megtalálja ugyanazt olcsóbban... és figyeli az akciókat". Ezt a katalógus tényleges adataiból vezetjük le, nem becsüljük légből kapva. (A per-szoba unit-gazdaság személyfüggetlen, csak a szobaszám 5×-öződik.)

```
Elméleti felső korlát  = akciós tételek aránya × átlagos akciómélység
                       = 23,3% × 20,75% ≈ 4,84%
```

Ez azt feltételezné, hogy a lakberendező **minden** vásárlásnál, **teljesen** vakon menne el egy elérhető akció mellett — irreális. Egy realistább **"capture rate"**-tel (mennyivel ad többet az agent szisztematikus ár-figyelése egy amúgy is odafigyelő szakemberhez képest) számolva:

| Capture rate | Tényleges várható megtakarítás a csomagértéken |
|---|---:|
| 25% (konzervatív) | 4,84% × 0,25 ≈ 1,21% |
| 50% (optimista) | 4,84% × 0,50 ≈ 2,42% |

```
Átlagos csomagérték = 3 növény/szoba × 5 169 Ft/növény ≈ 15 500 Ft
Megtakarítás/szoba   = 15 500 Ft × 1,21–2,42% ≈ 187–375 Ft
Havi (75 szoba, 5 fő) = 14 000–28 100 Ft
```

| | Konzervatív | Várható (közép) | Optimista |
|---|---:|---:|---:|
| **Havi érték** | **14 000 Ft** | **21 000 Ft** | **28 100 Ft** |
| **Éves érték** | **168 000 Ft** | **252 000 Ft** | **337 500 Ft** |

---

## 4. C) Üzemeltetési költség (levonandó tétel)

```
Egy kérdés költsége (élesben mért token-alapon):
  bevezető ár: (3681 × $2 + 549 × $10) / 1 000 000 ≈ $0,0129 ≈ 4,9 Ft
  listaár:     (3681 × $3 + 549 × $15) / 1 000 000 ≈ $0,0193 ≈ 7,3 Ft

Havi kérdésszám (5 fő) = 75 szoba × ~3 kérdés/szoba = 225 kérdés/hó
Havi API-költség       = 225 × 4,9–7,3 Ft ≈ 1 100–1 650 Ft/hó
```

Elhanyagolható a fenti tételekhez képest, még 5 fő teljes irodai forgalma mellett is. **Infrastruktúra-költség 0 Ft**, mert a Postgres lokálisan, docker-compose-ban fut (`architektura.md` #5 döntés) — nincs felhő-DB vagy egyéb havidíjas szolgáltatás, és a CLI-t mind az 5 fő ugyanazon a beállított rendszeren futtatja.

---

## 5. Összegzés (5 fős iroda)

| Tétel | Konzervatív | Várható (közép) | Optimista |
|---|---:|---:|---:|
| A) Időmegtakarítás | 75 000 Ft | 112 500 Ft | 150 000 Ft |
| B) Beszerzési megtakarítás | 14 000 Ft | 21 000 Ft | 28 100 Ft |
| C) Üzemeltetési költség | −1 650 Ft | −1 375 Ft | −1 100 Ft |
| **Nettó havi megtakarítás** | **~87 400 Ft** | **~132 100 Ft** | **~177 000 Ft** |
| **Nettó éves megtakarítás** | **~1 049 000 Ft** | **~1 585 000 Ft** | **~2 124 000 Ft** |

### Illusztratív megtérülési idő

Ez a projekt AI-asszisztált fejlesztéssel (Claude Code) készült, ezért a tényleges fejlesztési ráfordítás jelentősen alacsonyabb, mint egy hagyományos fejlesztésé — **erről nincs pontos, mért óraadatunk, ezért itt nem szerepel**. A megtérülési idő illusztrációjához egy hagyományos (nem AI-asszisztált) fejlesztési becslést használunk. Ez a költség **egyszeri és az egész 5 fős irodára vonatkozik** (egy rendszert vezetnek be, nem ötöt):

```
Becsült hagyományos fejlesztői ráfordítás = 4–6 nap × 8 óra × 15 000 Ft/óra = 480 000–720 000 Ft
Megtérülési idő = fejlesztői ráfordítás / nettó havi megtakarítás (5 fő)
```

| | Legjobb eset | Középérték | Legrosszabb eset |
|---|---:|---:|---:|
| Fejlesztői ráfordítás (egyszeri, egész irodára) | 480 000 Ft | 600 000 Ft | 720 000 Ft |
| Nettó havi megtakarítás (5 fő) | 177 000 Ft | 132 100 Ft | 87 400 Ft |
| **Megtérülési idő** | **~3 hónap** | **~5 hónap** | **~8 hónap** |

Mivel az egyszeri fejlesztési költség nem skálázódik a létszámmal, de a havi megtakarítás igen, egy 5 fős iroda esetén a megtérülés lényegesen (kb. 5×) gyorsabb, mint az egyetlen lakberendezőre számolt esetben. A valós, AI-asszisztált fejlesztési költséggel számolva a megtérülés ennél is gyorsabb lenne, de azt a jelen levezetés konzervatívan nem próbálja beárazni pontos adat nélkül.

## 6. Skálázhatóság (nem beárazott, kvalitatív megjegyzés)

A fenti számítás egy 5 fős irodára vonatkozik, ahol minden lakberendező a BRS-beli personával azonos terhelést visz (havi 5 ügyfél). A megtakarítás **lineárisan skálázódik** ezen a ponton túl is:

- Nagyobb létszám (pl. 10 fő) esetén az A) és B) tétel arányosan nő, a C) tétel is nő, de továbbra is elhanyagolható marad.
- Az egyszeri fejlesztési költség egyre több fő között oszlik meg, ahogy az iroda növekszik — a megtérülési idő tovább rövidül.
- Fordítva: egy 1 fős iroda esetén (lásd a korábbi, egyetlen lakberendezőre szóló levezetést) a megtérülés lassabb, mert a fix fejlesztési költséget kevesebben viselik.

## 7. Nem beárazott (soft) hasznok

A BRS 1. pontja szerint ezek valósak, de nehezen forintosíthatók, ezért a fenti számokban **nem szerepelnek**:

- Magasabb ügyfélélmény (gyorsabb, pontosabb ajánlat).
- Jobb minőségű munka (jobb illeszkedés a tér és az ügyfél igényeihez).
- Átláthatóság (napló, `--show-prompt`) — bizalomépítés, auditálhatóság.
- Egységes tudás/minőség az 5 fő között — az agent minden lakberendezőnek ugyanazt a katalógus-ismeretet és SQL-fegyelmet adja, csökkentve a személyek közötti minőségingadozást.
