** Golden set: **
** care-miscellaneous__ask-the-experts-spring-gardening-tips-from-the-sill-nybg.md **
- kérdés: Hogyan ne zsúfoljuk túl a virágoskertet?
- helyes válasz: "To avoid overcrowding a flower garden, start by spacing plants according to their mature size, not how they look in the pot. Group by growth habits and allow room for airflow to reduce disease risk. **Pro tip:** planting in odd-numbered clusters can create a full look without cramming too many plants together."
Ez egy különösen szemléletes eset — a rerank egy olyan chunkot hozott elő elsőnek (id 156, pontszám 9), ami a nyers vektortávolság top-5-ébe be sem fért.

1) Nyers vektortávolság:
1. [0.6258] Top Five Flowering Vines for Gardeners
2. [0.6483] Top Five Flowering Vines for Gardeners
3. [0.6548] Ask the Experts: Spring Gardening Tips (bevezető rész, nem a lényeg)
4. [0.6555] Top Five Flowering Vines for Gardeners
5. [0.6619] Tips for a Climate-Smart Garden
→ mind a kertdíszítésről/futónövényekről szól, egyik sem válaszol közvetlenül a "hogyan ne zsúfoljam túl" kérdésre.

2) HyDE + rerank:
Pontszámok: 156→9, 467→8, 463→8, 464→7, 306→7, 466→6, 462→6, ...
Kiválasztott: 156, 467, 463, 464, 306
1. Ask the Experts: Spring Gardening Tips
   "To avoid overcrowding a flower garden, start by spacing plants
    according to their mature size, not how they look in the pot..."

A lényeg: az 1. helyre került chunk (id 156) — ami szó szerint a kérdésre válaszol ("túlzsúfolás elkerülése: méret szerinti térköz") — a nyers vektortávolság top-5-ében nem is szerepelt (valahol a 20 ANN-jelölt közül a top-5 alatt lapult, mert a chunk szövege más témájú mondatokkal keveredik, ami rontja a nyers cosine-hasonlóságát). A HyDE (ami a válasz tartalmára, nem a kérdés szó szerinti megfogalmazására fókuszál) és a szélesebb 20-as jelöltkör + rerank együtt hozta felszínre ezt a valóban releváns találatot, amit a puszta vektortávolság elvesztett volna. 

** care-miscellaneous__ask-the-experts-spring-gardening-tips-from-the-sill-nybg.md **
- kérdés: A nap mely szakaszaiban a legjobb öntözni a kültéri kerteket, hogy megakadályozzuk a levelek megégését?
- helyes válasz: "The best time to water outdoor gardens is early in the morning when temperatures are cooler and the sun is not yet strong. This allows water to soak into the soil and reduces evaporation, while giving leaves time to dry during the day, preventing sunburn and fungal issues. Avoid watering in the midday or late evening to minimize leaf damage and disease risk."
Ez az egyik legerősebb példa a HyDE+rerank előnyére — a nyers vektortávolság teljesen félrement, mert a "levelek megégését" kifejezés szó szerinti hasonlósága a "levéltisztítás" cikkekhez vezetett, miközben a kérdés valódi témája (öntözés-időzítés) meg sem jelent a top-5-ben.

1) Nyers vektortávolság:
1. [0.6817] How To Spring Clean Your Houseplants     ← levéltisztításról szól, nem öntözésről!
2. [0.6861] How to Clean Houseplant Leaves            ← ugyanaz
3. [0.6947] The Best Pet-Safe Plants to Gift this Spring
4. [0.6951] How to Clean Houseplant Leaves
5. [0.6963] How to Clean Houseplant Leaves
→ egyik sem válaszol a tényleges kérdésre (öntözés időzítése a levélégés elkerülésére).

2) HyDE + rerank:
HyDE-szöveg: helyesen a hajnali/kora reggeli öntözést javasolja, elkerülve a déli meleget.
Pontszámok: 157→10, 1039→9, 416→8, 430→8, 1038→7, 159→7, 158→6, ...
Kiválasztott: 157, 1039, 416, 430, 159
1. Ask the Experts: Spring Gardening Tips — "The best time to water outdoor
   gardens is early in the morning when temperatures are cooler..."
2. Spring Houseplant Care Tips and Tricks
3. Gardening 101: How to Water Your Garden
4. Patio Gardening 101: Growing in Containers
5. Best Time to Water Your Plants

A lényeg: a "levelek megégése" szókapcsolat a nyers embedding-hasonlóságot félrevezette a levéltisztítás/levéldísz témák felé (mert szóban közel áll a "levél" témához), miközben a HyDE lépés helyesen ragadta meg a kérdés valódi szándékát (öntözés-időzítés a hőstressz elkerülésére), és emiatt a rerank 5 releváns, egymást megerősítő cikket talált — ez pontosan az az eset, amire a HyDE-t (Hypothetical Document Embeddings) kitalálták: amikor a kérdés megfogalmazása és a releváns dokumentum szókincse eltér egymástól. 

** care-miscellaneous__best-time-to-water-your-plants.md **
- kérdés: Mikor a legjobb öntözni a beltéri növényeket?
- helyes válasz: "The best time to water indoor plants is during the morning hours, before the sunshine is in full force."
Ez egy kiváló találati példa — a korpuszban van pontosan erre írt cikk ("Best Time to Water Your Plants"), és mindkét módszer megtalálta.

1) Nyers vektortávolság:
1. [0.5975] Ask the Experts: Spring Gardening Tips (kültéri kertről szól)
2. [0.6073] Ask the Experts: Spring Gardening Tips (ültetéstervezésről)
3. [0.6096] Best Time to Water Your Plants          ← ez a valódi célcikk, csak 3.
4. [0.6108] Our 6 Most Popular Houseplants for Fall  ← nem is öntözésről szól
5. [0.6170] Finding the Right Space For Your Plant    ← elhelyezésről, nem öntözésről

2) HyDE + rerank:
Pontszámok: 158→10, 159→9, 160→8, 416→8, 1039→8, 430→8, ...
Kiválasztott (≥6 küszöb, top 5): 158, 159, 160, 416, 430
1. Best Time to Water Your Plants (id 158) — a legmagasabb pontszám, 1.
2. Best Time to Water Your Plants (id 159)
3. Best Time to Water Your Plants (id 160)
4. Gardening 101: How to Water Your Garden
5. Patio Gardening 101: Growing in Containers

A különbség itt nagyon szemléletes: a nyers vektortávolság a pontosan releváns "Best Time to Water Your Plants" cikket csak a 3. helyre sorolta, két lazábban kapcsolódó (kerttervezés, őszi szobanövény-toplista) cikk elé — mert azok is sok "öntözés/beltéri/növény" szót tartalmaznak, csak nem a kérdés lényegére válaszolnak. A rerank ezzel szemben helyesen az öntözés-időzítésről szóló mindhárom chunkot (158/159/160, ugyanabból a cikkből) rangsorolta a legelső három helyre, és a top-5 minden tagja ténylegesen az öntözés időzítéséről szól — nincs köztük "csak témába vágó, de válaszra nem releváns" találat.

** plants-101__10-best-low-light-indoor-plants-for-your-home-or-office.md **
- kérdés: Mi a 10 legjobb alacsony fényigényű növény?
- helyes válasz: "The 10 best low-light plants: Snake Plant, Pothos, ZZ Plant, Parlor Palm, Philodendron, Aglaonema, Dracaena, Prayer Plants, Anthurium, and Peace Lily"
Ez a kérdés nagyon jól lefedett témára fut — mindkét módszer erős találatokat ad, magas pontszámokkal (a rerank szinte minden jelöltnél 4-10 közötti pontot adott, ami azt jelzi, hogy a téma alaposan szerepel a korpuszban).

1) Nyers vektortávolság:
1. [0.5185] 10 Best Low Light Indoor Plants for Your Home or Office
2. [0.5254] 10 Best Low Light Indoor Plants for Your Home or Office
3. [0.5443] Easy Indoor Plants That Can Survive Low Light
4. [0.5514] Easy Indoor Plants That Can Survive Low Light
5. [0.5522] Easy Indoor Plants That Can Survive Low Light

2) HyDE + rerank:
HyDE-szöveg: konkrét fajlistát generált (ZZ-növény, szanszeviéria, pothos, békeliliom, stb.) — bár ez csak a keresést segíti, nem a végső válasz.
Pontszámok: id 475→10, 476→10, 474→10, 956→10, 478→9, 479→9, ... (szinte minden jelölt 6+ fölött)
Kiválasztott: 475, 476, 474, 956, 478
1. 10 Best Low Light Indoor Plants — Snake Plant (kígyónövény)
2. 10 Best Low Light Indoor Plants — ZZ Plant
3. 10 Best Low Light Indoor Plants — bevezető szakasz
4. Easy Indoor Plants That Can Survive Low Light — Snake Plant
5. 10 Best Low Light Indoor Plants — Philodendron

Megfigyelés: itt mindkét módszer helyesen a két releváns cikket ("10 Best Low Light Indoor Plants" és "Easy Indoor Plants...") hozta fel, nincs a top-5-ben eltévedt/irreleváns találat egyik oldalon sem — ez egy jól lefedett, "könnyű" eset, ellentétben a korábbi Forsythia/alma példákkal. A fő különbség itt inkább finomhangolás: a rerank a konkrét fajneveket tartalmazó, direkt hasznos részeket (Snake Plant, ZZ Plant, Philodendron) preferálta az általánosabb bevezető szövegekkel szemben, míg a nyers vektortávolság kicsit jobban kevert be általánosabb, kevésbé konkrét bekezdéseket is. 

** plants-101__how-to-care-for-a-meyer-lemon-tree.md **
- kérdés: Milyen fényre van szüksége egy Meyer citromfának?
- helyes válasz: "they need at least **6 to 8 hours of direct sunlight** every day."
Ismét egy jól lefedett, pontos találat — mindkét módszer megtalálja a "How To Care for a Meyer Lemon" cikket, és itt jól látszik a küszöb-szűrés működése is: csak 3 chunk érte el a 6-os határt (nem mindig pontosan 5 kerül be, csak ami tényleg elég releváns).

1) Nyers vektortávolság:
1. [0.4952] How To Care for a Meyer Lemon — "Sunlight: Full sun. Requires 6–8 hour..."
2. [0.5040] How To Care for a Meyer Lemon (páratartalom)
3. [0.5074] How To Care for a Meyer Lemon (öntözés)
4. [0.5169] How To Care for a Meyer Lemon (bevezető)
5. [0.5824] How To Care for a Meyer Lemon (gyümölcshozás)

2) HyDE + rerank:
Pontszámok: 642→10, 643→10, 945→6, 944→5, 943→5, 942→5, ... (utána mind ≤4)
Kiválasztott (csak 3, nem 5 — a többi nem érte el a küszöböt): 642, 643, 945
1. How To Care for a Meyer Lemon — pontosan a fény-specifikáció
2. How To Care for a Meyer Lemon — általános gondozási áttekintés
3. Everything You Need To Know About Lighting — általános fény-terminológia (mit jelent a "teljes napfény")

Megfigyelés: itt a két módszer nagyrészt egyetért (mindkettő a Meyer Lemon cikket találja meg elsőként), de a rerank egy hasznos kiegészítést is behozott a top-5 helyett top-3-ba: az "Everything You Need To Know About Lighting" cikket, ami definiálja, mit jelent a "teljes napfény"/"bright light" kifejezés — ezzel kontextust ad a Meyer Lemon cikk fény-terminológiájához. Ezzel szemben a nyers vektortávolság top-5-e kizárólag ugyanabból az egy cikkből hozott 5 különböző bekezdést (öntözés, páratartalom, gyümölcshozás is belekerült, pedig a kérdés csak a fényről szólt) — kevésbé fókuszált a válaszra nézve, mint a rerank 3 célzott találata. 


** A negatív teszt eredménye: **
* PS C:\D\Work\Ismeret\AI_ML_DL_TL\RobotDreams_AIAgents\Plantbase> node apps/cli/dist/main.js ask "Mikor tört ki a 2. világháború?" *
Ez a kérdés nem kapcsolódik a növénygondozáshoz vagy a Plantbase katalógushoz, így ebben nem tudok segíteni. Ha növényválasztásban, csomagösszeállításban vagy növénygondozási kérdésben (öntözés, fény, kártevők stb.) szeretnél segítséget, szívesen állok rendelkezésre!

* PS C:\D\Work\Ismeret\AI_ML_DL_TL\RobotDreams_AIAgents\Plantbase> node apps/cli/dist/main.js ask "Milyen növények léteztek az őskorban?" *
Ez a kérdés nem a Plantbase katalógusához vagy a növénygondozási tudásbázishoz kapcsolódik, hanem őslénytani/botanikatörténeti témát érint. Az én eszközeim webshop-katalógus lekérdezésére (termékek, kategóriák) és növénygondozási tanácsokra (öntözés, fény, kártevők stb.) szolgálnak, nem történeti/tudományos ismeretterjesztésre.

Tudok viszont segíteni például:
- konkrét növényfajok/kategóriák keresésében a katalógusban,
- növénygondozási kérdésekben (pl. fény-, öntözésigény, kártevők),
- lakásba/kertbe illő növénycsomag összeállításában.

Ha esetleg arra vagy kíváncsi, hogy a katalógusban szereplő növények közül melyek "ősi", régóta kultivált fajok (pl. pozsgások, páfrányok), azt szívesen megnézem – szólj!