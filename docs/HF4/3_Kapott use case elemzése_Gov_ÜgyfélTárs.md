# Gov ÜgyfélTárs — kapott use case EU AI Act szerinti elemzése

> Kapott use case (szó szerint): *"Ez egy önkormányzati asszisztens, ami segít kitölteni a szociális támogatási kérelmeket. Nem dönt semmiről, csak végigvezeti az ügyfelet a nyomtatványon, és előre jelzi neki, hogy »a megadott adatok alapján valószínűleg jogosult / nem jogosult«. Az ügyintézői oldalon minden beérkező ügyhöz egy automatikus »bonyolultsági címkét« tesz, hogy a kollégák tudják, mivel érdemes kezdeni. A döntést mindig ember hozza."*
>
> Jogszabályi alap: Rendelet (EU) 2024/1689 (Artificial Intelligence Act, a továbbiakban: AI Act).

## 1. A use case szétbontása — két funkcionálisan eltérő komponens

A "Gov ÜgyfélTárs" néven leírt asszisztens valójában **két, jogilag eltérően megítélendő funkciót** foglal magába, ezért ezeket külön kell elemezni, mielőtt egy közös végkövetkeztetést vonnánk le:

- **(A) Ügyfél-oldali jogosultsági előrejelzés** — a rendszer a kérelmező adatai alapján kiszámol és megjelenít egy valószínűségi állítást ("valószínűleg jogosult / nem jogosult") a kérelmezőnek magának.
- **(B) Ügyintéző-oldali bonyolultsági címke** — a rendszer minden beérkező ügyet automatikusan "bonyolultsági" kategóriába sorol, hogy a kollégák tudják, mivel kezdjenek.

Az AI Act besorolása az AI-rendszer **rendeltetési céljához** (3. cikk 12. pont: "intended purpose" — a szolgáltató által meghatározott felhasználási cél, a használat konkrét kontextusával és feltételeivel) kötődik. Ha a két funkció egyetlen, egységes AI-rendszerként kerül forgalomba/szolgáltatásba (egy termék, egy rendeltetési cél-leírás), a besorolás elemzése az egész rendszerre vonatkozik, és a legszigorúbb alkalmazandó szint határozza meg a teljes rendszer minősítését. Az alábbiakban ezért mindkét funkcióra külön kifejtem az érveket, majd összegzem, mit jelent ez a teljes termékre nézve (l. 3. pont).

## 2. Érvek az egyes kockázati szintek mellett

### 2.1 Tiltott gyakorlat (5. cikk) — nem releváns, mindkét komponensre

Az 5. cikk szerinti tiltott kategóriák (tudatalatti/manipulatív technika, sebezhetőség kihasználása, szociális pontozás, kizárólag profilalkotáson alapuló bűnmegelőzési kockázatértékelés, célzatlan arckép-scraping, érzelemfelismerés munkahelyen/oktatásban, érzékeny jellemző szerinti biometrikus kategorizálás, valós idejű távoli biometrikus azonosítás) egyike sem áll fenn: a rendszer nyomtatványkitöltést segít és becslést ad, nincs benne biometria, manipuláció vagy social scoring. **Egyik funkció sem tiltott.**

### 2.2 Érvek a magas kockázatú besorolás MELLETT

**(A) Jogosultsági előrejelzés:**

- A III. melléklet 5. pont a) alpontja szó szerint így szól: *"az AI-rendszereket, amelyeket közhatóságok vagy közhatóságok nevében arra szánnak, hogy természetes személyek alapvető közellátási juttatásokra és szolgáltatásokra — ideértve az egészségügyi szolgáltatásokat is — való jogosultságát értékeljék, valamint hogy ilyen juttatásokat és szolgáltatásokat megítéljenek, csökkentsenek, visszavonjanak vagy visszaköveteljenek."* A kulcsszó az **"értékeljék" (evaluate)** — a rendelkezés szövege NEM követeli meg, hogy az AI-rendszer maga *döntsön*; elég, hogy a jogosultságot *értékelje*. A "valószínűleg jogosult / nem jogosult" előrejelzés pontosan ez: jogosultság-értékelés. Emiatt a funkció **prima facie az Annex III 5(a) hatálya alá esik**, függetlenül attól, hogy a végső döntést ember hozza.
- A 6. cikk (3) bekezdésének **utolsó albekezdése** kimondja, hogy a III. mellékletben szereplő rendszer akkor is mindig magas kockázatú marad, ha egyébként fennállna valamelyik derogáció (l. 2.3), amennyiben **természetes személyek profilalkotását végzi**. A GDPR 4. cikk (4) bekezdése (amire az AI Act 3. cikk 52. pontja visszautal) szerint profilalkotás minden olyan automatizált adatkezelés, amely személyes adat felhasználásával a természetes személy egyes jellemzőit — köztük kifejezetten a *gazdasági helyzetét* — értékeli vagy előre jelzi. A jogosultsági előrejelzés éppen ezt teszi (jövedelem, családi állapot, egyéb szociális körülmény alapján gazdasági/szociális jogosultságot jósol) → **ez profilalkotás**, tehát a carve-back miatt a magas kockázatú minősítés alól *nincs* kibúvó, még akkor sem, ha egyébként "csak előkészítő" jellegűnek tekintenénk.
- A 6. cikk (3) bekezdésének bevezető mondata (chapeau) szerint egyik derogáció (a)–(d) sem alkalmazható, ha a rendszer **"érdemben befolyásolja a döntéshozatal kimenetelét"** ("materially influencing the outcome of decision-making"). Egy határozott hangvételű, közvetlenül a kérelmezőnek megjelenített "valószínűleg NEM jogosult" üzenet ésszerűen alkalmas arra, hogy a kérelmezőt visszatartsa a kérelem beadásától/folytatásától (elrettentő, ún. "chilling" hatás) — ez ténylegesen befolyásolja az eljárás kimenetelét, még ha formálisan nem is az AI "dönt". Ez önmagában is kizárja a derogációk alkalmazhatóságát.

**(B) Bonyolultsági címke:**

- Ha a címkézés az ügyfél **személyes/gazdasági/családi körülményeiből** következtet (pl. "összetett család-szerkezet", "bizonytalan jövedelmi helyzet" mint bonyolultsági tényező) → ez szintén GDPR 4. cikk (4) bekezdés szerinti profilalkotás → 6. cikk (3) bekezdés utolsó albekezdése → **magas kockázatú**, függetlenül attól, hogy formálisan nem "jogosultságot" állapít meg.
- Ha a címke érdemben befolyásolja, MIKOR vagy MILYEN alapossággal kerül sorra egy ügy (pl. "alacsony prioritás" hónapokra hátrasorolja egy sürgős szociális ügyet) → ez ténylegesen kihat arra, hogy a jogosult ellátás mikor jut el az érintetthez, ami alapjogi (szociális biztonsághoz való hozzáférés) relevanciájú, és ismét a "materially influencing the outcome" kritériumot üti meg.

### 2.3 Érvek a magas kockázatú besorolás ELLEN / alacsonyabb szint mellett

**(A) Jogosultsági előrejelzés:** elvben felhozható lenne, hogy ez csupán "előkészítő feladat" (6. cikk (3) bekezdés d) pont: az Annex III-beli releváns értékelést megelőző előkészítő lépés) — DE ezt az érvet a 2.2 pontban tárgyalt két tényező (a szó szerinti "evaluate" megfogalmazás Annex III 5(a)-ban, és a profiling carve-back) érdemben gyengíti. Ez az érv önmagában **nem elég erős** ahhoz, hogy kimentse a funkciót a magas kockázatú kategóriából.

**(B) Bonyolultsági címke:** itt jóval erősebb az ellenérv. A 6. cikk (3) bekezdés a) pontjához (szűk eljárási feladat) kapcsolódó **53. preambulumbekezdés kifejezetten példaként hozza fel** az olyan AI-rendszereket, amelyek *"a beérkező dokumentumokat kategóriákba sorolják"* vagy *"strukturálatlan adatot strukturálttá alakítanak"*, mint a szűk eljárási feladat derogáció tipikus, jogszerű alkalmazási esetét. Ha a bonyolultsági címke **kizárólag ügyviteli/adminisztratív jellemzőkön alapul** (pl. hiányzó mezők száma, csatolt dokumentumok mennyisége, a kérelem terjedelme) — **NEM** az ügyfél személyes/gazdasági körülményeinek értékelésén —, és **nem befolyásolja érdemben** sem a jogosultsági döntést, sem ésszerűtlen mértékben annak időzítését, hanem pusztán a kollégák közötti munkamegosztást segíti, akkor erős érv szól amellett, hogy ez **nem magas kockázatú**, hanem a 6. cikk (3) bekezdés a) pontja szerinti szűk eljárási feladat derogáció alá esik.

### 2.4 Érvek a minimális kockázat mellett

Egyik funkcióra sincs erős érv a minimális kockázati szint mellett: mindkettő közvetlenül egy, az Annex III 5(a) pontja alá tartozó eljárás (alapvető közellátási juttatás — szociális támogatás) részeként, természetes személyeket közvetlenül érintő módon működik. Az 50. cikk (1) bekezdése szerinti átláthatósági kötelezettség (AI-mivolt jelzése) mindenképp alkalmazandó, mert a rendszer közvetlenül, természetes nyelven kommunikál az ügyféllel — ez azonban csak "ráadás" kötelezettség, nem helyettesíti a fenti (2.2–2.3) elemzést.

## 3. Végső besorolás és feltételek

1. **A jogosultsági előrejelzés (A funkció) magas kockázatú AI-rendszer** — Annex III 5. pont a) alpontja alapján, a 6. cikk (3) bekezdés utolsó albekezdésében foglalt profilalkotási carve-back és a "materially influencing the outcome" kritérium miatt megerősítve. Ez akkor is így van, ha formálisan "nem dönt", és akkor is, ha a döntést végig ember hozza — az emberi felügyelet ténye a *minősítést* nem változtatja meg, legfeljebb az *oversight*-kötelezettség (14. cikk, l. alább) teljesítésének módját befolyásolja.
2. **A bonyolultsági címke (B funkció) besorolása feltételes.** NEM magas kockázatú, **DE csak akkor**, ha együttesen teljesül:
   - kizárólag ügyviteli/adminisztratív jellemzőkön alapul, nem az ügyfél személyes/gazdasági körülményeinek értékelésén (nincs profilalkotás);
   - nem befolyásolja érdemben sem az elbírálás tartalmi kimenetelét, sem ésszerűtlen mértékben annak időzítését;
   - dokumentáltan, ellenőrizhetően kizárólag munkaszervezési/triage célú, és ezt a szolgáltató a 6. cikk (4) bekezdése szerint dokumentálja is (a nem-magas-kockázati minősítés alátámasztására szolgáló dokumentációs kötelezettség minden Annex III-közeli rendszerre vonatkozik, függetlenül a végeredménytől).
   - Ha bármelyik feltétel sérül, a B funkció is magas kockázatúvá válik.
3. **Gyakorlati következmény a teljes termékre nézve:** mivel az (A) funkció önmagában, minden realisztikus feltevés mellett magas kockázatú, és a use case leírása alapján a két funkció egyetlen, egységes "önkormányzati asszisztens" (Gov ÜgyfélTárs) termékként kerül bevezetésre, **a teljes rendszert célszerű magas kockázatú AI-rendszerként kezelni**, hacsak a szolgáltató nem választja külön — architekturálisan és jogilag (különálló forgalomba hozatal, különálló, dokumentált rendeltetési cél a 3. cikk (12) bekezdés szerint) — a két funkciót egymástól.
4. **Az "úgyis ember dönt" érv önmagában nem elegendő védekezés.** A 14. cikk szerinti hatékony emberi felügyelet magas kockázatú rendszereknél **követelmény**, nem választható extra: az ügyintézőnek ténylegesen képesnek kell lennie megérteni a rendszer képességeit/korlátait, felismerni az automatizmus-torzítás (automation bias) kockázatát, helyesen értelmezni a kimenetet, és dönthetnie kell úgy is, hogy figyelmen kívül hagyja, felülbírálja vagy visszavonja a rendszer javaslatát. Egy formális "az ügyintéző rábólint" gyakorlat, ahol a rendszer magabiztos, konkrét előrejelzést ad ("valószínűleg nem jogosult"), komoly automation bias kockázatot hordoz, és emiatt önmagában **nem** felel meg a 14. cikk követelményének.

**Ha a rendszer (vagy annak (A) komponense) magas kockázatúnak minősül**, a legfontosabb, azonnal releváns kötelezettségek:

- **Szolgáltatói oldal:** 9. cikk (kockázatkezelési rendszer), 10. cikk (adatkormányzás/adatminőség), 11. cikk (műszaki dokumentáció), 12. cikk (naplózási képesség), 13. cikk (átláthatóság az üzembe helyező felé), 15. cikk (pontosság, robusztusság, kiberbiztonság), 17. cikk (minőségirányítási rendszer), 43. cikk (megfelelőségértékelés), 49. cikk (EU-adatbázisba regisztráció).
- **Üzembe helyezői oldal (26. cikk):** utasítás szerinti használat, kompetens emberi felügyelet kijelölése, monitorozás, legalább 6 hónapos naplómegőrzés; **26. cikk (11) bekezdés: a természetes személyt kifejezetten tájékoztatni kell arról, hogy magas kockázatú AI-rendszer hatálya alá tartozik** — ez konkrét, ma is teljesíthető teendő a kérelmező tájékoztatására.
- **27. cikk — alapjogi hatásvizsgálat (FRIA), kiemelten fontos ebben az esetben:** az Art. 27 kötelező azon üzembe helyezők számára, akik **"közjogi testületek, vagy közszolgáltatást nyújtó magánjogi szervezetek"** — egy önkormányzat pontosan ilyen —, méghozzá **nem csak** az Annex III 5(b)/(c) pontokra (hitel, biztosítás) korlátozva, hanem minden Annex III magas kockázatú rendszer (a 2. pont — kritikus infrastruktúra — kivételével) első használata előtt. Ez tehát a jelen use case-re **közvetlenül, kötelezően alkalmazandó**.
- **86. cikk — magyarázathoz való jog:** ha a jogosultsági előrejelzésen alapuló végső döntés jogi hatással jár vagy az érintett szerint hasonlóan jelentősen érinti (egészség, biztonság vagy alapjog szempontjából hátrányosan), az ügyfél kérésre jogosult "világos és érdemi magyarázatot" kapni az AI szerepéről a döntéshozatali eljárásban és a döntés fő elemeiről.

## 4. Ki a szolgáltató és ki az üzembe helyező?

A kapott use case-leírásból nem derül ki, ki fejlesztette a rendszert, ezért két forgatókönyvet érdemes megkülönböztetni:

**A) Külső fejlesztő (govtech-szállító) fejlesztette, és licencelt/vásárolt termékként kerül az önkormányzathoz** (a "Gov ÜgyfélTárs" mint önálló termék-elnevezés erre utal):

- A **szállító a Szolgáltató** (3. cikk (3) bekezdés): ő fejleszti a rendszert, és saját neve/védjegye alatt hozza forgalomba vagy állítja szolgáltatásba.
- Az **önkormányzat az Üzembe helyező** (3. cikk (4) bekezdés): saját hatáskörében, hivatali (nem személyes, nem szakmai-magán célú) minőségben használja — a "személyes, nem szakmai célú felhasználás" kivétel itt nyilvánvalóan nem alkalmazható.
- Az önkormányzat mint **közjogi testület** kiemelt üzembe helyezői kötelezettségekkel bír: 26. cikk (8) bekezdés (regisztrálatlan rendszer nem használható), és — amint fent tárgyalva — az **Art. 27 szerinti FRIA kifejezetten őt terheli**.

**B) Az önkormányzat (vagy az önkormányzatot kiszolgáló állami/önkormányzati informatikai szervezet) maga fejleszti, saját névre és saját használatra állítja szolgáltatásba:**

- Ekkor az önkormányzat **egyidejűleg Szolgáltató is és Üzembe helyező is** — mindkét kötelezettségcsoportot (megfelelőségértékelés, műszaki dokumentáció, EU-regisztráció, ÉS a 26–27. cikk szerinti üzembe helyezői kötelezettségek) egyaránt viselnie kell. Ez a leggyakoribb és jogilag legmegterhelőbb forgatókönyv állami/önkormányzati saját fejlesztésű rendszereknél.

**C) Szerepváltás a 25. cikk alapján:** ha egy másik önkormányzat vagy szerv átveszi és saját nevére/védjegyére címkézi át a rendszert, vagy azt lényegesen módosítja (pl. új adatforrást — például jövedelemigazolási vagy egészségügyi nyilvántartási interfészt — köt be, ami az eredeti szolgáltatásba állításkor nem volt betervezve/dokumentálva) → az átvevő **válik új Szolgáltatóvá**, kivéve, ha az eredeti szolgáltató szerződésben kifejezetten kizárta ezt a felhasználást, vagy másként rendezte a kötelezettségek megosztását.

**Javaslat:** jogilag mindenképp tisztázandó, melyik forgatókönyv (A, B, vagy esetleg C egy már működő rendszer átvétele esetén) áll fenn, mert ez határozza meg, kire hárul elsődlegesen a megfelelőségértékelés (43. cikk), a műszaki dokumentáció (11. cikk) és az EU-adatbázisba történő regisztráció (49. cikk) terhe, illetve hogy az önkormányzatnak a szállítóval kötött szerződésben milyen együttműködési/tájékoztatási kötelezettségeket kell rögzítenie (25. cikk).

## 5. Nyitott kérdések a végleges minősítéshez

- A jogosultsági előrejelzés és a bonyolultsági címke **egy vagy két különálló AI-rendszer** (különálló rendeltetési céllal, 3. cikk (12) bekezdés)? Ettől függ, hogy a teljes terméket vagy csak az (A) komponenst kell magas kockázatúként kezelni.
- A bonyolultsági címke pontosan **milyen bemeneti adatokból** következtet — kizárólag ügyviteli metaadatból, vagy az ügyfél személyes/gazdasági/családi körülményeiből is?
- **Ki a szolgáltató** — külső govtech-vállalkozás, vagy az önkormányzat/állami szervezet saját fejlesztése?
- Készült-e már **9. cikk szerinti kockázatkezelési dokumentáció** és **27. cikk szerinti alapjogi hatásvizsgálat**, és ha nem, ki felelős ezek elkészítéséért az első éles használat előtt?
