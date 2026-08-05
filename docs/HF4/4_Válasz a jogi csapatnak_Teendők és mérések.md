**Tárgy:** Re: AI-asszisztens — magas kockázatú besorolás, intézkedési terv szükséges

Kedves Anna!

Köszönöm a tervezett fejlesztés jogi elemzését!
A következőlben kötelezettségenként három sort adok meg:
- **Jogi lényeg**: egy mondatban, mit kell teljesíteni
- **Intézkedés**: mit építünk/vezetünk be
- **Mérés/bizonyíték**: mivel igazoljuk auditkor, hogy az intézkedés valóban működik, nem csak papíron létezik.

## 9. cikk — Kockázatkezelési rendszer

**Jogi lényeg:** folyamatos, iteratív kockázatkezelési folyamat a teljes életciklusra: ismert és ésszerűen előre látható kockázatok azonosítása, célzott intézkedések, forgalomba hozatal előtti tesztelés előre meghatározott metrikákkal és küszöbökkel, kiemelt figyelem a kiszolgáltatott érintettekre.

**Intézkedés:**
- Élő kockázatregiszter, minden azonosított kockázathoz felelőssel, státusszal, mitigációval; minden release előtt kötelező review.
- Kiadás előtti teszt-suite: célzott esetek téves/kirívóan magas-alacsony kompenzációs javaslatra, félrevezető vagy hiányos panaszszövegre, valamint arra, hogy a javaslat rendszeresen hátrányosabb-e valamely ügyfélszegmensre.
- Előre rögzített elfogadási küszöbök (pl. max. eltérés a végül jóváhagyott összegtől) — ezek megszegése blokkolja a kiadást.
- Élesben mért adatok (elutasítási/felülbírálási arány, incidensek) visszacsatolása a regiszterbe — negyedéves review.

**Mérés/bizonyíték:**
- Kockázatregiszter changelog (ki, mikor, milyen kockázatot vitt fel/zárt le).
- Release-enkénti teszt-jelentés: pass/fail a rögzített küszöbök mentén.
- Negyedéves risk-review jegyzőkönyv, nyitott kockázatok darabszáma és trendje.

## 10. cikk — Adat-governance

**Jogi lényeg:** a betanításra/kontextusként használt adatoknak relevánsnak, kellően reprezentatívnak, lehetőség szerint hibamentesnek és teljesnek kell lenniük; dokumentálni kell az adatok eredetét, és vizsgálni kell az esetleges torzításokat.

**Intézkedés:**
- Adat-eredet nyilvántartás: mely történeti panasz-/kompenzációs esetek, mely rendszerből, milyen időszakból kerülnek a promptba/kontextusba vagy kiértékelő halmazba.
- Torzítás-audit: a javasolt kompenzáció eloszlásának ellenőrzése ügyfélszegmensek (pl. régió, terméktípus, ügyfél-tenure) mentén, kirívó eltérés esetén eszkaláció.
- Bemeneti adatminőség-ellenőrzés a szerződés-/tranzakciótörténet betöltő pipeline-on (séma-validáció, hiányzó mezők arányának monitorozása).
- Hozzáférés-minimalizálás: a modell csak az adott ügyhöz szükséges szűk adatkörhöz fér hozzá (nem a teljes ügyfélprofilhoz).

**Mérés/bizonyíték:**
- Adat-eredet napló (forrás, időbélyeg, verzió), release-enként visszakereshető.
- Release-enkénti torzítás-audit riport, számszerű eltérés-mutatókkal és elfogadási küszöbbel.
- Adatminőség-dashboard: séma-validációs hibaarány (cél: < 0,5%), trendje.

## 12. cikk — Naplózás és eseményrögzítés

**Jogi lényeg:** a rendszernek automatikusan naplóznia kell a működése szempontjából releváns eseményeket a teljes üzemidő alatt, olyan részletességgel, hogy abból a rendszer működése nyomon követhető, kockázati helyzetek és a napi üzemeltetés is monitorozható legyen.

**Intézkedés:**
- Strukturált, korrelációs azonosítóval ellátott napló minden esethez: bemenet (panaszszöveg, hivatkozott szerződés-/tranzakció-ID), modell- és promptverzió, kimenet (javasolt kompenzáció + indoklás), ki és hogyan bírálta felül/hagyta jóvá, időbélyeg.
- Naplók módosíthatatlan tárolása, hozzáférés-naplózással.
- Megőrzési idő beállítása a 26. cikk (6) bekezdés szerinti minimum 6 hónapra, automatikus törléssel/archiválással.

**Mérés/bizonyíték:**
- Naplólefedettségi mutató: az AI-asszisztált esetek hány %-ához létezik teljes naplóbejegyzés (cél: 100%, automatikus ellenőrzéssel).
- Időszakos hash-lánc integritás-ellenőrzési riport.
- Negyedéves mintavételes audit: N naplóbejegyzés összevetése a tényleges ügyirattal.

## 14. cikk — Emberi felügyelet

**Jogi lényeg:** a rendszert úgy kell tervezni, hogy az ügyintéző értse a képességeit/korlátait, felismerje az automatizmus-torzítás kockázatát, helyesen értelmezze a kimenetet, és ténylegesen felülbírálhassa, elutasíthassa vagy leállíthassa a rendszert.

**Intézkedés:**
- A javaslat a felületen mindig "javaslatként" jelenik meg, kifizetés/döntés sosem automatikus — az ügyintéző explicit elfogadó/módosító/elutasító akciója szükséges (nincs straight-through processing).
- Megbízhatósági/limitáció-jelzés a felületen (pl. hiányos bemenet vagy szélsőséges eset esetén "alacsony megbízhatóság — kézi ellenőrzés szükséges" jelölés).
- Kötelező indoklási mező felülbírálás esetén, ami visszacsatol a 9. cikk szerinti kockázatregiszterbe.
- Kötelező onboarding + időszakos ismétlő képzés automatizmus-torzításról, dokumentált elvégzési nyilvántartással.
- Tesztelt "kill switch": az AI-javaslat funkció üzemeltetői szinten kikapcsolható, sorban állásonként vagy globálisan.

**Mérés/bizonyíték:**
- Felülbírálási arány (elfogadva változatlanul / módosítva / elutasítva) ügyintézőnkénti és aggregált bontásban, trendezve — tartósan ~100%-os változatlan elfogadás önmagában automation bias-riasztást vált ki és felülvizsgálatot indít.
- Képzés-teljesítési arány (cél: 100% az aktív ügyintézőknél).
- Medián ügyintézői vizsgálati idő javaslatonként — gyanúsan rövid idő + magas elfogadási arány együtt eszkalációt indít.

## 15. cikk — Pontosság és robusztusság

**Jogi lényeg:** a rendszernek megfelelő pontossággal, robusztussággal és kiberbiztonsággal kell működnie a teljes életciklusban; a pontossági metrikákat dokumentálni kell; ellenállónak kell lennie hibákkal, adat-/modell-mérgezéssel szemben; ha van visszacsatolásos tanulás, annak torzítás-felerősítő hatását kezelni kell.

**Intézkedés:**
- Kiadás előtt rögzített, dokumentált pontossági metrika a kompenzációs javaslat feladatára (pl. egyezés a végül jóváhagyott összeggel adott tűréshatáron belül, illetve eszkalációs döntés precizitása/recall-ja).
- Robusztussági teszt-suite szélsőséges esetekre (hiányzó tranzakciótörténet, ellentmondó panaszszöveg, extrém összegek) — hiba esetén a rendszer nem ad javaslatot, az eset kézi sorba kerül.
- Nincs éles adatból történő automatikus, felügyelet nélküli újratanulás/kontextus-frissítés (elkerülve a 15. cikk (4) bekezdés szerinti torzítás-visszacsatolást); minden ilyen frissítés review-köteles.
- Bemenet-validáció a panaszszöveg felől, legkisebb jogosultság elve a szerződés-/tranzakciótörténet lekérő eszközökön.
- Kiadás előtti (és évenkénti) biztonsági teszt.

**Mérés/bizonyíték:**
- Pontossági metrika élesben, dashboardon, minimumküszöbbel — küszöb alatt élesítés megakadályozása.
- Robusztussági teszt-riport: fail-closed viselkedés igazolt lefedettsége (cél: 100% a definiált edge case-eken).
- A talált hibák lezárásának nyomon követése (nyitott/zárt státusz, határidő).
- Incidens-mutató: hibás/hiányos adatból fakadó, észrevétlen produkciós hibák száma, átlagos észlelési/javítási idő.

## 26. cikk — Üzembe helyezői kötelezettségek

**Jogi lényeg:** a rendszert a használati utasítás szerint kell üzemeltetni; kompetens emberi felügyeletet kell kijelölni; a bemeneti adat minőségéért (amennyiben azt az üzembe helyező kontrollálja) felelősség terheli; monitorozni kell, kockázat esetén fel kell függeszteni és a szolgáltatót/hatóságot értesíteni; a naplókat legalább 6 hónapig meg kell őrizni; a munkavállalókat és — jelen esetben kiemelten — az érintett ügyfeleket tájékoztatni kell arról, hogy magas kockázatú AI-rendszer hatálya alá tartoznak.

**Intézkedés:**
- Dokumentált RACI: ki a kijelölt, kompetens felügyelő szerep a funkcióra (kapcsolódik a 14. cikkhez).
- Bemeneti adat governance a szerződés-/tranzakciótörténet feedre (kapcsolódik a 10. cikkhez).
- Monitoring + felfüggesztési eljárás: riasztási küszöbök (pl. hibaarány- vagy felülbírálási arány-ugrás); incidenskezelési runbook, benne explicit "AI-javaslat funkció felfüggesztése" lépéssel és a fejlesztő csapat értesítési eljárásával.
- Ügyintézők tájékoztatása és nyilatkoztatása, hogy magas kockázatú AI-rendszert használnak.
- Ügyfél-kommunikációs sablon frissítése: a kompenzációs válaszlevél tartalmazza, hogy a javaslat előkészítésében AI-asszisztens vett részt.

**Mérés/bizonyíték:**
- RACI és on-call roster negyedévente frissítve, verziótörténettel.
- Évenkénti (legalább egy) dokumentált felfüggesztési gyakorlat/teszt, mért felfüggesztési idővel.
- Naplómegőrzési bizonyíték (ld. 12. cikk).
- Ügyfél-tájékoztatási lefedettség: a kimenő sablonok hány %-a tartalmazza a kötelező AI-közlést (cél: 100%, automatikus sablon-ellenőrzéssel).
- Ügyintézői nyilatkozat-lefedettség (%, HR/LMS-ből).

## 27. cikk — Alapjogi hatásvizsgálat szükségességének vizsgálata

**Jogi lényeg:** az első használat előtt kötelező azon üzembe helyezőknek, amelyek közjogi testületek vagy közszolgáltatást nyújtó magánjogi szervezetek; a vizsgálatnak ki kell térnie a használat folyamatára, időtartamára/gyakoriságára, az érintett személyek köreire, a konkrét kockázatokra, az emberi felügyelet módjára és a mitigációs intézkedésekre, és be kell jelenteni a piacfelügyeleti hatóságnak.

**Intézkedés:**
- Az alkalmazhatóság jogi eldöntést igényel — ezt visszaadjuk nektek nyitott kérdésként, mi nem tudjuk és nem a mi hatáskörünk eldönteni.
- Ettől függetlenül előkészítjük a hatásvizsgálathoz szükséges műszaki bemenetet, hogy alkalmazhatóság esetén ne legyen holtidő: folyamatleírás, várható használati gyakoriság/volumen, érintett ügyfélkategóriák, a 9. cikk szerinti kockázatregiszterből származó kockázatlista, a 14. cikk szerinti felügyeleti leírás, mitigációs intézkedések.
- Ezt a bemenetet sablonosítjuk.

**Mérés/bizonyíték:**
- Verziózott FRIA-bemenet dokumentum, elkészültének dátumával.
- Alkalmazhatósági döntés írásos nyilvántartása (jogi csapat tulajdonában), a mi dokumentumunkra hivatkozva.

---

## Nyitott kérdések, következő lépés

1. **27. cikk alkalmazhatósága** — kérünk jogi döntést arról, hogy a társaság az Art. 27(1) értelmében közszolgáltatást nyújtó szervezetnek minősül-e; mi addig is elkészítjük a műszaki bemenetet (ld. fent).
2. **Szolgáltatói szerep pontos terjedelme** — mivel csapatunk "részben szolgáltatóként" érintett, javasoljuk külön menetben tisztázni, hogy ez konkrétan mely további kötelezettségeket (pl. műszaki dokumentáció, megfelelőségértékelés, EU-adatbázisba regisztráció) hárítja ránk, mert ezek jelen levélben nem szerepeltek, de a fenti intézkedések nagy része (kockázatregiszter, tesztelés, dokumentáció) ezeket is megalapozza.
3. Javasolunk egy közös workshopot a fenti intézkedések ütemezésére (backlog-priorizálás) és a mérési küszöbök (pl. felülbírálási arány, pontossági metrika) közös jóváhagyására, mielőtt a bővítés éles használatba kerül.

Kérdés, probléma esetén egyeztessünk!

Üdvözlettel: Bordás Márton
