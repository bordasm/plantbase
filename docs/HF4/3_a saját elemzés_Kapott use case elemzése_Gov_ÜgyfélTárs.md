# Gov ÜgyfélTárs — kapott use case EU AI Act szerinti elemzése

A kapott use case leírása:
"Ez egy önkormányzati asszisztens, ami segít kitölteni a szociális támogatási kérelmeket. Nem dönt semmiről, csak végigvezeti az ügyfelet a nyomtatványon, és előre jelzi neki, hogy »a megadott adatok alapján valószínűleg jogosult / nem jogosult«. Az ügyintézői oldalon minden beérkező ügyhöz egy automatikus »bonyolultsági címkét« tesz, hogy a kollégák tudják, mivel érdemes kezdeni. A döntést mindig ember hozza."

## 1. Kockázati szint
Ami különbség volt a saját elemzés és az LLM teszt közt, hogy az LLM-el ellentétben én nem bontottam ketté az agent-et a 2 fő funkcionalitásra (jogosultság elemzés, bonyolultság elemzés), hanem automatikusan a szigorúbban érintett funkciót néztem az egyes elemzési részeknél.

### Tiltott gyakorlat (5. cikk)

Az 5. cikk szerinti tiltott kategóriák a következők:
- tudatalatti/manipulatív technika
- sebezhetőség kihasználása
- szociális pontozás
- kizárólag profilalkotáson alapuló bűnmegelőzési kockázatértékelés
- célzatlan arckép-scraping
- érzelemfelismerés munkahelyen/oktatásban
- érzékeny jellemző szerinti biometrikus kategorizálás
- valós idejű távoli biometrikus azonosítás)
Az Ügyféltárs agent (innentől: agent) esetén egyikről sincs szó, mivel a rendszer nyomtatványok kitöltését támogatja.

Itt nincs lényegi különbség az LLM teszt és a saját elemzés között.

### Magas kockázati szint

Az agent jogosultság-értékelést végez, még ha a végső döntést ember hozza is meg. Ezzel egy természetes személy profilalkotását végzi, gazdaságilag. Emiatt és mivel nem valósul meg tiltott gyakorlat, így ** az agent magas kockázatú **.

Mivel megvan, hogy az agent magas kockázati besorolású, ezért én nem elemeztem tovább. Az LLM ennél jóval részletesebb elemzést készített.

## 2. Ki a szolgáltató és ki az üzembe helyező?

A leírásból nem derül ki, hogy ki az agent fejlesztője. Feltételezem, hogy egy IT fejlesztő cég fejlesztette, mivel valószínűleg egy önkormányzatnak nincs gazdasági lehetősége egy ilyen fejlesztésre. Mindenesetre ez tisztázandó. Ha igaz a feltételezés, akkor az IT fejlesztő cég a szolgáltató, ill. az agent mögötti LLM modell provider-e is az. Az üzemebe helyező pedig az önkormányzat.

Ennél a pontnál nem láttam érdemi különbséget az LLM teszt és a saját elemzésem között, bár az előbbi itt is jóval részletesebb.

-------------------------------------------------------------------------------------------------------------------------------

** LLM teszt **
** Az LLM teszt dokumentuma, amin nem változtattam semmit (ezért ide írom ezeket az információkat ezen generált dokumentumról): ** 3_Kapott use case elemzése_Gov_ÜgyfélTárs.md

** Az LLM teszt során használt modell: ** Opus 4.8 (1M context)

** Az LLM teszt prompt-ja és a chat-írata: **
❯ Kérem, hogy hozz létre egy markdown dokumentumot, melynek neve: 3_Kapott use case elemzése_Gov_ÜgyfélTárs.md
  A fájlt a /docs/HF4 könyvtárba mentsd.

  A fájlba egy use case EU AI Act szerinti elemzését írd meg.
  A use case:
  Ez egy önkormányzati asszisztens, ami segít kitölteni a szociális támogatási kérelmeket. Nem dönt semmiről, csak végigvezeti az ügyfelet a nyomtatványon, és előre jelzi neki, hogy „a megadott adatokalapján valószínűleg jogosult / nem jogosult". Az ügyintézői oldalon minden beérkező ügyhöz egy automatikus „bonyolultsági címkét" tesz, hogy a kollégák tudják, mivel érdemes kezdeni. A döntést mindig ember hozza.

  Kérlek adj EU AI Act szerinti besorolást a következők alapján:
  - Mik az érvek az egyes kockázati szintek mellett?
  - Ezek alapján hova sorolnád, és milyen feltételekkel?
  - Ki itt a szolgáltató és ki az üzembe helyező?

● Fetch(https://artificialintelligenceact.eu/annex/3/)
Received 311.6KB (200 OK)

● Web Search("EU AI Act recital 53 narrow procedural task examples "classify" "incoming documents" derogation Article 6(3)")
Did 1 search in 7s

● Fetch(https://artificialintelligenceact.eu/article/27/)
Received 313KB (200 OK)

● Fetch(https://artificialintelligenceact.eu/article/14/)
Received 313KB (200 OK)

● Fetch(https://artificialintelligenceact.eu/article/86/)
Received 302.8KB (200 OK)

● Fetch(https://artificialintelligenceact.eu/article/26/)
Received 318.1KB (200 OK)

● Web Search("EU AI Act Article 3 point 12 "intended purpose" definition")
Did 1 search in 4s

● Write(docs\HF4\3_Kapott use case elemzése_Gov_ÜgyfélTárs.md)
Wrote 86 lines to docs\HF4\3_Kapott use case elemzése_Gov_ÜgyfélTárs.md
# Gov ÜgyfélTárs — kapott use case EU AI Act szerinti elemzése

, csak végigvezeti az ügyfelet a nyomtatványon, és előre jelzi neki, hogy »a megadott adatok alapján valószínűleg jogosult / nem jogosult«. A
z ügyintézői oldalon minden beérkező ügyhöz egy automatikus »bonyolultsági címkét« tesz, hogy a kollégák tudják, mivel érdemes kezdeni. A dön
tést mindig ember hozza."*
> Jogszabályi alap: Rendelet (EU) 2024/1689 (Artificial Intelligence Act, a továbbiakban: AI Act).

## 1. A use case szétbontása — két funkcionálisan eltérő komponens
A "Gov ÜgyfélTárs" néven leírt asszisztens valójában **két, jogilag eltérően megítélendő funkciót** foglal magába, ezért ezeket külön kell el
emezni, mielőtt egy közös végkövetkeztetést vonnánk le:
… +157 lines

Elkészült a docs/HF4/3_Kapott use case elemzése_Gov_ÜgyfélTárs.md.

Röviden a fő megállapítások:

- A use case-t két funkcióra bontottam (ügyfél-oldali jogosultsági előrejelzés vs. ügyintézői bonyolultsági címke), mert eltérő a kockázati profiljuk, és ez adja az elemzés gerincét.
- Jogosultsági előrejelzés → magas kockázatú, jól indokolható érvvel: az Annex III 5(a) pont szó szerint "jogosultság értékelését" (nem döntését!) nevesíti, plusz a 6. cikk (3) bekezdés utolsó albekezdése szerinti profiling-visszakapcsoló (a jogosultsági predikció GDPR-értelemben profilalkotás), plusz a "materially influencing the outcome" kritérium (a "valószínűleg nem jogosult" üzenet elrettentő hatása). Az "úgyis ember dönt" érv itt nem menti ki.
- Bonyolultsági címke → feltételesen NEM magas kockázatú, konkrét Recital 53-hivatkozással (a "beérkező dokumentumok kategorizálása" kifejezett példa a szűk eljárási feladat derogációra) — de csak ha ügyviteli adaton alapul, nem ügyfél-profilon, és nem befolyásolja érdemben a döntést/időzítést.
- Végső besorolás: mivel a két funkció valószínűleg egy termékként fut, a teljes rendszert magas kockázatúként célszerű kezelni, hacsak nincs jogilag/architekturálisan szétválasztva. Kitértem az Art. 14 (emberi felügyelet — a formális jóváhagyás önmagában nem elég), Art. 26(11) (ügyfél-tájékoztatási kötelezettség), Art. 27 (kötelező alapjogi hatásvizsgálat, mert az önkormányzat "közjogi testület") és Art. 86 (magyarázathoz való jog) kötelezettségekre is.
- Szolgáltató/üzembe helyező: két forgatókönyvet vázoltam (külső govtech-szállító vs. önkormányzati saját fejlesztés), mert ez a use case-ből nem derül ki — ezt nyitott kérdésként jelöltem az 5. pontban.

Nem commitoltam — szólj, ha szeretnéd.