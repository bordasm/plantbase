**Tárgy:** Plantbase — javasolt EU AI Act besorolás, kérés véleményezésre

Tisztelt Jogi Csapat, Kedves Kollegák!

A Plantbase nevű projekttel kapcsolatban kérném a véleményeteket az EU AI Act (Rendelet (EU) 2024/1689) szerinti besorolásról, mielőtt a fejlesztést tovább visszük. Alább röviden összefoglalom a besoroláshoz szükséges tényeket, a saját javaslatomat és indoklását, illetve a nyitott kérdéseket.

**Mi a projekt?**
A Plantbase egy lakberendezőknek szóló termékajánló asszisztens. Ez technikailag egy parancssorból működtetett AI ügynök, amely természetes nyelvű kérdést fordít adatbázis lekérdezésre egy növény-katalógus felett, azt read-only lefuttatja, és természetes nyelvű választ ad; emellett egy tudásbázis-keresést is végez növénygondozási témákban (öntözés, fény, kártevők). A háttérben Anthropic Claude és OpenAI modelleket hívunk API-n keresztül — mi magunk nem fejlesztünk AI-modellt, hanem egy erre épülő alkalmazást.

**Ki használja?** Elsődlegesen egy lakberendező (üzleti felhasználó), másodlagosan otthoni felhasználók — jelenleg kizárólag helyi parancssoron keresztül. Web- vagy hangfelület, illetve többfelhasználós/jogosultsági rendszer még nincs, és a jelenlegi tervek szerint egyelőre nem is lesz.

**Milyen adatot kezel?** A katalógus szintetikus termékadat (nem személyes adat). Ugyanakkor minden interakciót naplózunk (a kérdést, a generált adatbázis lekérdezést, az eredményt és a választ) — ha a felhasználó a kérdésébe ügyfél-adatot ír (pl. nevet, lakáscímet, háziállat meglétét), az személyes adatnak minősül, és a naplóban, illetve az Anthropic/OpenAI API-hívásokban (mindkettő USA-székhelyű) is megjelenik.

**Milyen döntést hoz vagy befolyásol?** A rendszer kizárólag ajánl/informál — növényt választ, csomagot állít össze, gondozási tanácsot ad. Nem hoz és nem hajt végre automatikusan jogi vagy hasonlóan jelentős hatású döntést (nincs automatizált szerződéskötés, fizetés vagy hitelbírálat); a végső döntést mindig ember hozza.

**Mi történik, ha téved?** Rossz növényt vagy pontatlan gondozási/biztonsági információt (pl. `pet_safe`/`kid_safe` mezőknél) ajánlhat, ami rossz vásárlási döntéshez vagy — legrosszabb esetben — háziállatot/gyereket veszélyeztető növény téves "biztonságosnak" jelöléséhez vezethet. A rendszer promptja tartalmaz védőkorlátot bizonytalan válasz esetére, de ez nem jogi garancia.

**Javasolt besorolás:** a fenti tények alapján a Plantbase **nem tiltott** (AI Act 5. cikk) és **nem magas kockázatú** rendszer (6. cikk + III. melléklet — egyik ott felsorolt terület, pl. hitelezés, foglalkoztatás, biometria sem érintett). Ugyanakkor mivel közvetlenül, természetes nyelven kommunikál emberekkel, feltehetően vonatkozik rá az **50. cikk (1) bekezdés szerinti átláthatósági kötelezettség** (AI-mivolt jelzése), és mindenképp vonatkozik rá a **4. cikk szerinti AI-műveltségi elvárás**. A részletes indoklást a mellékelt `Plantbase EU AI Act elemzés.md` dokumentum tartalmazza, cikkely-/Annex-hivatkozásokkal.

Külön szeretném felhívni a figyelmet két pontra: (1) a naplózás miatt potenciálisan felmerülő **GDPR-kérdés** (adattovábbítás USA-beli AI-szolgáltatókhoz, retenció), és (2) egy tervezett, de még nem megvalósított **v2 funkció** (ügyfelenkénti "ajánlás-történet" tárolása), ami — ha személyes adaton alapuló profilalkotássá alakul — a besorolást magasabb kockázati szintre tolhatja.

**Kérésem:** kérnélek titeket, hogy erősítsétek meg (vagy korrigáljátok) a fenti besorolást és indoklást, és javasoljatok konkrét következő lépéseket — különösen a naplózás/adattovábbítás GDPR-megfelelőségére és a v2 profilalkotási funkció bevezetése előtti teendőkre vonatkozóan. Örülnék egy rövid egyeztetésnek is, ha inkább az alkalmasabb.

Köszönöm előre is a segítséget!

Üdvözlettel,
Bordás Márton
