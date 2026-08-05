# Plantbase — EU AI Act elemzés

> Státusz: munkaanyag, jogi véleményezésre vár (lásd a kísérő `E-mail a jogi osztálynak a Plantbase kapcsán.md` fájlt). Alap: a repo dokumentációja (`docs/brs-plantbase.md`, `docs/architektura.md`, `docs/stack.md`, `docs/system-prompt.md`), valamint a Rendelet (EU) 2024/1689 (Artificial Intelligence Act, a továbbiakban: AI Act) hatályos szövege.

## 1. Bevezetés, a dokumentum célja

A Plantbase egy lakberendezőknek szóló termékajánló asszisztens. Ez technikailag egy CLI AI agent (parancssorból működik), amely természetes nyelvű kérdést fordít SQL-re a növény-katalógus felett, azt read-only lekérdezésként lefuttatja, és természetes nyelvű választ ad — kiegészítve egy RAG-alapú növénygondozási tudásbázis-kereséssel.
Az EU AI Act rendelkezéseinek túlnyomó része — köztük az Annex III szerinti magas kockázatú rendszerekre és az Art. 50 szerinti átláthatósági kötelezettségekre vonatkozó szabályok — 2026. augusztus 2-től alkalmazandó (Art. 113), azaz e dokumentum írásának időpontjában (2026. augusztus 5.) már hatályos jog. Emiatt indokolt már a fejlesztés jelenlegi fázisában tisztázni a jogi besorolást, mielőtt a projekt éles/üzleti használatba kerülne.

Jelen dokumentum célja:
1. Az EU AI Act szerinti kockázati besorolás meghatározása, konkrét cikkely-/Annex-hivatkozásokkal alátámasztva.
2. A fejlesztő (üzemeltető) szerepének tisztázása az AI Act értéklánc-fogalmai (szolgáltató / üzembe helyező) mentén.
3. Határeset-elemzés: mely — akár már tervezett — funkcióbővítések tolnák el a besorolást magasabb kockázati szintre.
4. Az AI Act-tel átfedő egyéb szabályozások (GDPR, termékfelelősség stb.) azonosítása.

Ez a dokumentum **nem minősül jogi állásfoglalásnak** — műszaki/termékfejlesztői előkészítő elemzés, amelyet a jogi csapat megerősítésére/korrekciójára szánunk.

## 2. A Plantbase EU AI Act szerinti besorolása

### 2.1 A besoroláshoz releváns tények

- **Funkció:** NL (természetes emberi nyelv)-->SQL fordítás és futtatás a `products` (növény-katalógus) táblán (read-only), listázó segédeszköz (`listCategories`), valamint RAG-alapú tudásbázis-keresés (`searchKnowledge`, HyDE + rerank) növénygondozási témákban.
- **Modellek:** Anthropic Claude (agent-loop, tool-use) + OpenAI embedding (RAG). A Plantbase ezekre a harmadik féltől származó, general-purpose AI-modellekre (GPAI-modell) épülő **alkalmazás**, API-hívásokon keresztül.
- **Felhasználók:** elsődlegesen a lakberendező (persona), másodlagosan otthoni felhasználók (`docs/system-prompt.md` `<role>` szakasz). Jelenleg kizárólag helyi CLI-n keresztül; web/voice felület és több felhasználó/jogosultságkezelés a BRS szerint kifejezetten **kívül esik** a v1 hatókörén (`docs/brs-plantbase.md`, 3. pont).
- **Kezelt adat:** szintetikus, kb. 30 tételes növény-katalógus (nem személyes adat). Nincs ügyfél-/felhasználói profiltár a v1-ben. A BRS bővítési tervként (v2+) megemlíti az "ajánlás-történet" tárolását a lakberendező korábbi döntéseinek elemzésére (`docs/brs-plantbase.md`, 31. sor) — ez ma **nincs megvalósítva**. Megjegyzés: az esetemben a ** CustomerCounterSorter funkcinalitás nem része jelent fejlesztésnek, az külön fejlesztés! **
- **Döntéshozatal:** a rendszer kizárólag **informál/ajánl** (növény-kiválasztás, csomag-összeállítás, gondozási tanács); nem hoz és nem hajt végre automatikusan jogi vagy hasonlóan jelentős hatású döntést természetes személyről (nincs automatizált szerződéskötés, fizetés, hitelbírálat, foglalkoztatási döntés).

### 2.2 Tárgyi hatály: AI-rendszer-e a Plantbase?

Az AI Act 3. cikk 1. pontja szerint AI-rendszer: "gépi alapú rendszer, amelyet úgy terveztek, hogy a telepítés után a különböző szintű autonómiával működjön, és amely... a kapott bemenetből... következtet arra, hogyan generáljon olyan kimeneteket, mint predikciók, tartalom, ajánlások vagy döntések." A Plantbase NL-->SQL fordítása, RAG-alapú válaszgenerálása és termékajánlása egyértelműen ez alá esik --> **AI-rendszer az AI Act 3. cikk (1) bekezdése értelmében**, tehát a Rendelet 2. cikk szerinti tárgyi hatálya alá tartozik.

### 2.3 Tiltott gyakorlatok (5. cikk) — nem áll fenn

Az 5. cikk kimerítő listát ad a tiltott AI-gyakorlatokról: tudatalatti/manipulatív technikák, sebezhetőség kihasználása, szociális pontozás (social scoring), kizárólag profilalkotáson alapuló bűnmegelőzési kockázatértékelés, arckép-adatbázis célzatlan "scrapinge", érzelemfelismerés munkahelyen/oktatásban, érzékeny jellemzők szerinti biometrikus kategorizálás, valós idejű távoli biometrikus azonosítás nyilvános téren bűnüldözési célból. **Egyik sem valósul meg** a Plantbase-ben: nincs biometrikus vagy érzelem-elemzés, nincs manipulatív mintázat, a rendszer egy szöveges katalógus-lekérdező/tanácsadó asszisztens. → **Nem tiltott gyakorlat.**

### 2.4 Magas kockázatú besorolás (6. cikk + III. melléklet)

**6. cikk (1) bekezdés** (biztonsági alkatrész teszt): a Plantbase nem képezi biztonsági alkatrészét egyetlen, az I. mellékletben felsorolt uniós harmonizációs jogszabály hatálya alá tartozó terméknek sem (gépek, játékok, felvonók, orvostechnikai eszközök stb.) → nem alkalmazandó.

**6. cikk (2) bekezdés + III. melléklet** — a nyolc kategória sorra véve:

III. melléklet pont / Terület / Plantbase-re vonatkozik?
1. / Biometria (azonosítás, kategorizálás, érzelemfelismerés) / Nem — nincs biometrikus funkció.
2. / Kritikus infrastruktúra (energia, víz, közlekedés stb.) / Nem.
3. / Oktatás és szakképzés (felvétel, értékelés) / Nem.
4. / Foglalkoztatás, munkavállaló-kezelés (toborzás, teljesítményértékelés, feladatkiosztás) / Nem — a rendszer nem értékel és nem irányít munkavállalókat.
5. / Alapvető köz-/magánszolgáltatások (hitelképesség — 5. pont b) alpont; biztosítási kockázat/díjazás; közellátási jogosultság; segélyhívás-osztályozás) / Nem — a Plantbase kiskereskedelmi termékajánlás, nem hitel-/biztosítási/segélyhívás-döntés.
6. / Bűnüldözés / Nem.
7. / Migráció, menekültügy, határellenőrzés / Nem.
8. / Igazságszolgáltatás, demokratikus folyamatok / Nem.

--> **Egyik III. mellékleti kategóriába sem tartozik: a Plantbase nem magas kockázatú AI-rendszer.**

Fontos ugyanakkor kiemelni a **6. cikk (3) bekezdésének utolsó albekezdését**: még ha egy rendszer a III. mellékletben szerepelne is, és fennállna a 6. cikk (3) bekezdés első albekezdésében felsorolt valamelyik derogáció (szűk eljárási feladat elvégzése; korábban elvégzett emberi munka javítása; döntési mintázat/eltérés észlelése emberi értékelés helyettesítése nélkül; előkészítő feladat), a **természetes személyek profilalkotását végző rendszerek ettől függetlenül mindig magas kockázatúnak minősülnek**. Ennek gyakorlati jelentőségét lásd a 2.6 pont határeset-elemzésében.

### 2.5 GPAI-modell szolgáltatói kötelezettségek — nem a Plantbase fejlesztőjét terhelik

Az EU AI Act 3. cikk 63. pontja szerinti general-purpose AI-modell (GPAI-modell) fogalma önmagában széles körű, sokféle feladatra alkalmas modellre vonatkozik (pl. Claude, GPT-family). A Plantbase ezekre **épülő alkalmazás** (AI-rendszer), API-n keresztül hívja őket — **nem fejleszt és nem hoz forgalomba GPAI-modellt**. Ebből következően az V. fejezet (51–56. cikk: modelldokumentáció, szerzői jogi TDM-szabályzat betartása, rendszerszintű kockázatú GPAI-modelleknél a 55. cikk szerinti kiegészítő kötelezettségek) **nem a Plantbase fejlesztőjét, hanem az Anthropicot és az OpenAI-t terheli** mint GPAI-modell-szolgáltatókat.

### 2.6 Végső besorolás

**A Plantbase minimális/korlátozott kockázatú AI-rendszer** az EU AI Act szerint:

- Nem tiltott (5. cikk), nem magas kockázatú (6. cikk + III. melléklet).
- **DE** az 50. cikk (1) bekezdése alkalmazandó: mivel a rendszer közvetlenül, természetes nyelven kommunikál természetes személyekkel, a szolgáltatónak biztosítania kell, hogy a felhasználó tudomást szerezzen arról, hogy AI-rendszerrel áll kapcsolatban — kivéve, ha ez a körülményekből egy ésszerűen tájékozott, figyelmes és körültekintő személy számára egyértelmű. A jelenlegi, explicit CLI-parancsként meghirdetett forma (`plantbase ask "<kérdés>"`) valószínűleg megfelel a "nyilvánvaló a körülményekből" kivételnek — ezt azonban érdemes dokumentálni, és újraértékelni, ha a rendszer chat-szerű felületet kap (l. 2.7, 5. pont).
- **4. cikk (AI-műveltség):** kockázati szinttől függetlenül minden szolgáltatóra és üzembe helyezőre vonatkozik, 2025. február 2. óta hatályos — a Plantbase-t kezelő/üzemeltető személyzet megfelelő AI-műveltségét biztosítani kell.
- A 95. cikk szerinti önkéntes magatartási kódexek nem-magas-kockázatú rendszerekre opcionálisan alkalmazhatók, kötelezettséget nem keletkeztetnek.

### 2.7 Szerep-elemzés: szolgáltató vagy üzembe helyező?

Az AI Act 3. cikk (3) bekezdése szerint **szolgáltató (provider)**: aki AI-rendszert (vagy GPAI-modellt) fejleszt, és azt saját neve vagy védjegye alatt forgalomba hozza vagy szolgáltatásba állítja (l. a "forgalomba hozatal" 3. cikk (9) és a "szolgáltatásba állítás" 3. cikk (11) fogalmait). A 3. cikk (4) bekezdése szerint **üzembe helyező (deployer)**: aki az AI-rendszert saját felügyelete alatt használja, kivéve a személyes, nem szakmai célú felhasználást.

**Jelenlegi állapot:** a fejlesztő megalkotja az AI-rendszert, ami a "fejleszti" kritériumot kimeríti. Amíg a rendszert kizárólag fejlesztik és tesztelik, és nincs sem forgalomba hozatali, sem szolgáltatásba állítási esemény harmadik fél felé, a **szolgáltatói kötelezettségek formálisan még nem "élesednek meg"** — de a szerep már ekkor **potenciálisan szolgáltatói**, és a compliance-t célszerű már ebben a fázisban beépíteni (olcsóbb, mint utólag).

**Élesítés esetén két forgatókönyv:**

1. **Saját üzleti használat** (pl. a fejlesztő vagy egy hozzá kötődő lakberendező-vállalkozás a Plantbase-t saját ügyfélmunkában használja): ekkor a fejlesztő/vállalkozás **egyidejűleg szolgáltató** (mert fejlesztette és szolgáltatásba állította) **és üzembe helyező** (mert saját szakmai tevékenysége körében használja — a "személyes, nem szakmai célú felhasználás" kivétel itt **nem** alkalmazható, mert a felhasználás üzleti kontextusban történik). A kettős szerep egyidejűleg fennáll, mindkét kötelezettségcsoportot (itt: a nem-magas-kockázatú kategóriára szabott 50. és 4. cikk) teljesíteni kell.
2. **Termék-/szolgáltatás-értékesítés harmadik feleknek** (pl. SaaS-modellben más lakberendező-vállalkozásoknak): a fejlesztő marad **szolgáltató**, a vásárló vállalkozások válnak **üzembe helyezővé**.

**Szerepváltás (25. cikk):** ha egy harmadik fél átveszi a rendszert és saját neve/védjegye alá helyezi, vagy lényegesen módosítja (pl. a célját úgy változtatja meg, hogy az immár a III. melléklet alá essen — l. 2.8), az a harmadik fél **válik új szolgáltatóvá**, kivéve, ha az eredeti szolgáltató szerződésben kifejezetten kizárta ezt a felhasználást, vagy egyéb módon rendezte a kötelezettségek megosztását.

### 2.8 Határeset-elemzés

Az alábbi, viszonylag kis változtatások egy szinttel feljebb tolnák a besorolást:

1. **Profilalkotás bevezetése — ez már a BRS-ben megcélzott v2 funkció.** A BRS "Bővítési képesség (későbbi)" pontja kifejezetten megemlíti: *"a lakberendező korábbi döntéseinek elemzése → jobb javaslat... Ehhez az ajánlás-történet tárolása kell"* (`docs/brs-plantbase.md`, 31. sor). Ha ez az előzmény-tár természetes személyekhez (végfelhasználó ügyfelekhez) köthető, és a rendszer ebből egyénre szabottan következtet a személy preferenciáira, gazdasági helyzetére vagy fizetési hajlandóságára (pl. egyénre szabott árazás), ez a GDPR 4. cikk (4) bekezdése szerinti "profilalkotásnak" minősül, amelyre az AI Act 3. cikk 52. pontja is visszautal. Ha egy III. mellékletbe tartozó rendszer profilalkotást végez, a **6. cikk (3) bekezdésének utolsó albekezdése alapján automatikusan magas kockázatúvá válik**, még a 6. cikk (3) első albekezdésének kivételei fennállása esetén is. Önmagában a katalógus-ajánlás nem III. mellékleti kategória, de a profilalkotásra épülő, egyénre szabott árazás/kockázatértékelés jellegű funkció közel kerülhet az **5. pont b) alpontjához** (hitelképesség/pénzügyi kockázat jellegű értékelés) — ez a legfigyelendőbb eszkalációs pont a roadmapen.
2. **Alkalmazotti teljesítményértékelés.** Ha a rendszert arra kezdenék használni, hogy a lakberendező-vállalkozás saját munkavállalóinak (pl. értékesítők) teljesítményét vagy feladatkiosztását AI-alapon értékelje/irányítsa → **III. melléklet 4. pont (foglalkoztatás)** → magas kockázatú.
3. **Hitelezés/finanszírozás funkció.** Ha "részletfizetés" vagy hitelbírálati funkció kerülne be, ahol a rendszer értékeli az ügyfél hitelképességét vagy fizetési kockázatát → **III. melléklet 5. pont b) alpontja** → magas kockázatú.
4. **Biometrikus szoba-/személyelemzés.** Ha kamerás funkció kerülne be (pl. a szoba fotó alapján a benne tartózkodó SZEMÉLYEK azonosítása/kategorizálása) → **III. melléklet 1. pont (biometria)** → magas kockázatú, bizonyos formák (pl. nyilvános téri valós idejű távoli biometrikus azonosítás bűnüldözési céllal) pedig akár az **5. cikk szerinti tiltott gyakorlat** kategóriájába is eshetnek.
5. **Web/voice felület végfelhasználóknak.** Önmagában nem emeli a kockázati szintet, de gyengíti az 50. cikk (1) bekezdés "nyilvánvaló a körülményekből" kivételét → explicit AI-jelölési kötelezettség válik egyértelművé, konkrét compliance-teendőként.

## 3. A Plantbase-hez kapcsolódó további szabályozások

### 3.1 GDPR (Rendelet (EU) 2016/679) — RELEVÁNS

A `products` katalógus önmagában nem tartalmaz természetes személyre vonatkozó adatot (szintetikus termékadat). Ugyanakkor:

- Az **FR4 naplózási követelmény** (`docs/brs-plantbase.md`, 58. sor) szerint minden interakció JSONL-be kerül: system prompt, üzenetek, generált SQL, eredmény, válasz, token-felhasználás. Ha a lakberendező a kérdésébe ügyfél-adatot ír (pl. ügyfélnév, lakáscím, háziállat megléte, büdzsé) → ez **személyes adat**, amely (a) a helyi `logs/` mappában tárolódik, (b) az Anthropic (Claude) és OpenAI (embedding/HyDE) API-hívások révén **elhagyja az EU-t** (mindkét szolgáltató USA-székhelyű) → a GDPR V. fejezete szerinti harmadik országbeli adattovábbítás kérdését veti fel (SCC/DPF garanciák ellenőrzése a szolgáltatói DPA-kban indokolt).
- **Adatminimalizálás (5. cikk (1) bekezdés c) pont) és tárolási korlátozás (5. cikk (1) bekezdés e) pont):** a `logs/` mappa jelenleg időbélyeg szerint, retenciós/törlési szabály nélkül gyűjt — mielőtt valós ügyféladat kerülne bele, retenciós szabályzat és/vagy anonimizálás indokolt.
- Ha a 2.8/1. pontban tárgyalt "ajánlás-történet" (profilalkotás) funkció bevezetésre kerül és természetes személyekhez köthető adatot tárol tartósan → adatkezelői minőség, jogalap (feltehetően jogos érdek vagy szerződés teljesítése) és érintetti jogok (hozzáférés, törlés, tiltakozás) biztosítása szükséges.

### 3.2 A felülvizsgált termékfelelősségi irányelv (Directive (EU) 2024/2853) — RELEVÁNS (tagállami átültetés 2026.12.09-ig)

Az irányelv 4. cikke kifejezetten kiterjeszti a "termék" fogalmát szoftverre és AI-rendszerekre, függetlenül az elérés módjától (helyi telepítés, felhő, SaaS). A Plantbase gondozási (RAG-alapú, `searchKnowledge`) és biztonsági jellegű (`pet_safe`, `kid_safe`) válaszai olyan ténybeli állítások, amelyek alapján a felhasználó biztonsági döntést hozhat (pl. mérgező növény gyerek/háziállat közelében). Egy hibás/hallucinált válasz miatti kár esetén — miután az irányelv tagállami jogba átültetésre kerül — ez vétkességtől független, hibás termékért való felelősséget alapozhat meg a szolgáltatóval szemben. A system prompt már tartalmaz idevágó védőkorlátot (*"Ha a searchKnowledge found: false-t ad... ne találj ki választ"*, `docs/system-prompt.md`, 50. sor); jogi szempontból érdemes ezt mint dokumentált kockázatcsökkentő intézkedést kezelni.

### 3.3 Szerzői jogi / DSM irányelv (Directive (EU) 2019/790), TDM-szabályok — KÖZVETVE RELEVÁNS

A Plantbase maga nem tanít modellt, és nem gyűjt tömegesen szöveget harmadik féltől; a RAG-tudásbázis dokumentumforrásait a fejlesztő válogatja/tölti be (`docs/RAG/chunking.md`). A szöveg- és adatbányászati (TDM) szerzői jogi megfelelés (DSM irányelv 4. cikk (3) bekezdés, amire az AI Act 53. cikk (1) bekezdés c) pontja is hivatkozik) elsősorban az Anthropic/OpenAI mint GPAI-modell-szolgáltatók kötelezettsége, nem a Plantbase fejlesztőjéé. Ha azonban a tudásbázisba harmadik féltől származó, jogvédett szöveg (pl. weboldalról másolt gondozási cikkek) kerül, az önálló, klasszikus szerzői jogi (nem AI Act) vizsgálatot igényel.

### 3.4 MDR (Rendelet (EU) 2017/745, orvostechnikai eszközök) — NEM RELEVÁNS

A Plantbase nem állít fel egészségügyi diagnózist és nem tesz terápiás állítást emberekre vonatkozóan, nem minősül orvostechnikai eszköznek vagy annak szoftverkomponensének. A `pet_safe`/`kid_safe` mezők toxicitási/biztonsági jellegű, de nem orvosi diagnosztikai célú információk. **Indoklás: nincs átfedés.**

### 3.5 DORA (Rendelet (EU) 2022/2554, digitális működési reziliencia) — NEM RELEVÁNS

A DORA hatálya a 2. cikkében felsorolt "pénzügyi szervezetekre" (hitelintézetek, biztosítók, befektetési vállalkozások stb.) és az ő ICT-harmadikfél-szolgáltatóikra korlátozódik. A Plantbase fejlesztője/üzemeltetője nem pénzügyi szervezet, és nem is pénzügyi szervezetnek nyújt ICT-szolgáltatást. **Indoklás: nincs átfedés.**

### 3.6 NIS2 (Irányelv (EU) 2022/2555, kiberbiztonság) — JELENLEG NEM RELEVÁNS, DE FIGYELENDŐ

A NIS2 hatálya alá tartozó szektorok (energia, közlekedés, banki/pénzügyi infrastruktúra, egészségügy, digitális infrastruktúra stb., I–II. melléklet) és a hozzájuk tartozó méretküszöbök egyike sem teljesül egy kiskereskedelmi/lakberendezési kisvállalkozás belső CLI-eszközére. **Indoklás:** jelenlegi méretben és felhasználási körben nincs átfedés; ha a termék sok kiskereskedő számára üzemeltetett, digitális infrastruktúra jellegű SaaS-szolgáltatássá nőné ki magát, a kérdést újra kell értékelni.
