# Plantbase — ROI (megtérülés) levezetés

> Épít a `brs-plantbase.md` 1. pontjára (a kiinduló idő- és ügyfélszámokra). A dokumentum célja: hihető, végigkövethető számítással megmutatni, mekkora havi/éves megtakarítást eredményez a lefejlesztett agent — külön választva a **mért/számolt** adatokat (seed-katalógus, éles API-teszt) és az **feltételezéseket** (óradíj, csomagméret, árfolyam), hogy a becslés utólag is ellenőrizhető és finomítható legyen.

## 1. Bemeneti adatok

### 1.1 A BRS-ből (adott, nem újratárgyalt)

| Adat | Érték |
|---|---|
| Ügyfelek száma | 5 / hó |
| Szoba/ügyfél | 3 |
| Szobák száma | 15 / hó (180 / év) |
| Kézi idő/szoba (jelenleg) | 10–15 perc |
| Agent idő/szoba (KPI, cél) | < 5 perc |

### 1.2 Feltételezések (nincs a BRS-ben, itt rögzítve)

| Feltételezés | Érték | Indoklás |
|---|---|---|
| Lakberendezői óradíj | 12 000 Ft/óra | Hazai freelance belsőépítész/lakberendezői középár-becslés |
| Csomagméret | 3 növény/szoba | Tipikus lakberendezői növénycsomag mérete (nem mért adat) |
| USD/HUF árfolyam | 380 Ft/$ | 2026 közepi becsült sáv |
| Kérdés/szoba (agenttel) | ~3 | Kérdés + finomítás/utókérdés interaktív módban |
| Fejlesztői ráfordítás (hagyományos, nem AI-asszisztált fejlesztéssel) | 4–6 fejlesztői nap, 15 000 Ft/óra | Csak az illusztratív megtérülési idő számításához (lásd 5. pont) |

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
Havi megtakarított idő  = 15 szoba × 5–10 perc  = 75–150 perc = 1,25–2,5 óra
Havi érték              = 1,25–2,5 óra × 12 000 Ft/óra = 15 000–30 000 Ft
```

| | Pesszimista (kézi: 10 perc) | Várható (közép) | Optimista (kézi: 15 perc) |
|---|---:|---:|---:|
| Megtakarított idő/szoba | 5 perc | 7,5 perc | 10 perc |
| Havi megtakarított idő | 1,25 óra | 1,875 óra | 2,5 óra |
| **Havi érték** | **15 000 Ft** | **22 500 Ft** | **30 000 Ft** |
| **Éves érték** | **180 000 Ft** | **270 000 Ft** | **360 000 Ft** |

---

## 3. B) Beszerzési / ár-optimalizálási megtakarítás (másodlagos, puhább tétel)

A BRS szerint az agent "megtalálja ugyanazt olcsóbban... és figyeli az akciókat". Ezt a katalógus tényleges adataiból vezetjük le, nem becsüljük légből kapva:

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
Havi (15 szoba)      = 2 800–5 600 Ft
```

| | Konzervatív | Várható (közép) | Optimista |
|---|---:|---:|---:|
| **Havi érték** | **2 800 Ft** | **4 200 Ft** | **5 600 Ft** |
| **Éves érték** | **34 000 Ft** | **50 000 Ft** | **67 000 Ft** |

---

## 4. C) Üzemeltetési költség (levonandó tétel)

```
Egy kérdés költsége (élesben mért token-alapon):
  bevezető ár: (3681 × $2 + 549 × $10) / 1 000 000 ≈ $0,0129 ≈ 4,9 Ft
  listaár:     (3681 × $3 + 549 × $15) / 1 000 000 ≈ $0,0193 ≈ 7,3 Ft

Havi kérdésszám  = 15 szoba × ~3 kérdés/szoba = 45 kérdés/hó
Havi API-költség = 45 × 4,9–7,3 Ft ≈ 220–330 Ft/hó
```

Elhanyagolható a fenti tételekhez képest. **Infrastruktúra-költség 0 Ft**, mert a Postgres lokálisan, docker-compose-ban fut (`architektura.md` #5 döntés) — nincs felhő-DB vagy egyéb havidíjas szolgáltatás.

---

## 5. Összegzés

| Tétel | Konzervatív | Várható (közép) | Optimista |
|---|---:|---:|---:|
| A) Időmegtakarítás | 15 000 Ft | 22 500 Ft | 30 000 Ft |
| B) Beszerzési megtakarítás | 2 800 Ft | 4 200 Ft | 5 600 Ft |
| C) Üzemeltetési költség | −330 Ft | −280 Ft | −220 Ft |
| **Nettó havi megtakarítás** | **~17 500 Ft** | **~26 400 Ft** | **~35 400 Ft** |
| **Nettó éves megtakarítás** | **~210 000 Ft** | **~317 000 Ft** | **~425 000 Ft** |

### Illusztratív megtérülési idő

Ez a projekt AI-asszisztált fejlesztéssel (Claude Code) készült, ezért a tényleges fejlesztési ráfordítás jelentősen alacsonyabb, mint egy hagyományos fejlesztésé — **erről nincs pontos, mért óraadatunk, ezért itt nem szerepel**. A megtérülési idő illusztrációjához egy hagyományos (nem AI-asszisztált) fejlesztési becslést használunk:

```
Becsült hagyományos fejlesztői ráfordítás = 4–6 nap × 8 óra × 15 000 Ft/óra = 480 000–720 000 Ft
Megtérülési idő = fejlesztői ráfordítás / nettó havi megtakarítás
```

| | Legjobb eset | Középérték | Legrosszabb eset |
|---|---:|---:|---:|
| Fejlesztői ráfordítás | 480 000 Ft | 600 000 Ft | 720 000 Ft |
| Nettó havi megtakarítás | 35 400 Ft | 26 400 Ft | 17 500 Ft |
| **Megtérülési idő** | **~14 hónap** | **~23 hónap** | **~41 hónap** |

A tartomány szándékosan széles és nem "eladós" — a valós, AI-asszisztált fejlesztési költséggel számolva a megtérülés ennél lényegesen gyorsabb lenne, de azt a jelen levezetés konzervatívan nem próbálja beárazni pontos adat nélkül.

## 6. Skálázhatóság (nem beárazott, kvalitatív megjegyzés)

A fenti számítás egyetlen lakberendezőre, havi 5 ügyfélre vonatkozik. A megtakarítás **lineárisan skálázódik**:

- Több ügyfél/lakberendező esetén a havi megtakarítás arányosan nő (az API-költség is arányosan nő, de az elenyésző).
- Egy több lakberendezőt foglalkoztató iroda esetén a fejlesztési költség (egyszeri) megoszlik a felhasználók között — a megtérülési idő rövidül.

## 7. Nem beárazott (soft) hasznok

A BRS 1. pontja szerint ezek valósak, de nehezen forintosíthatók, ezért a fenti számokban **nem szerepelnek**:

- Magasabb ügyfélélmény (gyorsabb, pontosabb ajánlat).
- Jobb minőségű munka (jobb illeszkedés a tér és az ügyfél igényeihez).
- Átláthatóság (napló, `--show-prompt`) — bizalomépítés, auditálhatóság.
