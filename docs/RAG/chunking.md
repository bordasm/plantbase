** Elolvastattam és elemeztettem a Claude Code-al a 202 fájlt a \seed\knowledge könyvtárban. Az elemzése eredménye: **
Elolvastam (statisztikailag és néhány teljes minta alapján is), és a struktúra elég egyértelmű mintát mutat. Íme az elemzés:
Amit a korpuszban találtam
- Forrás és méret: mind a thesill.com blogjából scrape-elt cikk, 5 kategóriában (plants-101: 112, ask-the-sill: 38, outdoor-plant-care: 25, care-miscellaneous: 24, the-basics: 3). Átlag ~960 szó/fájl (medián 927, min 439, max 2510) — ezek rövid, egy-témás cikkek, nem hosszú technikai dokumentumok.
- Egységes YAML frontmatter mind a 202 fájlban: title, source, category.
- Kritikus lelet: 100%-ban jelen lévő marketing-boilerplate. Minden egyes fájl végén szó szerint ugyanaz a ## Perfect Pairings For Your Plants termékajánló blokk + ##### Words By The Sill lábléc + záró Do Some Plant Shopping sor szerepel. Egy mintafájlnál ez 711 szóból 236-ot tett ki (~33%). Ez zajforrás, ami minden fájlban azonos szöveggel ismétlődik.
- A heading-struktúra megbízhatatlan. A cikkek H1/H3/H4/H5/H6-ot vegyesen, inkonzisztensen használnak (pl. az Apple Trees cikkben ### Planting Your Apple Tree közvetlenül ### Sunlight követi, tartalom nélkül közte; a ###### gyakran csak egy díszes pull-quote, nem valódi szekció). Ez azt jelenti, hogy tisztán heading-alapú vágás nem megbízható — üres vagy nagyon egyenetlen méretű chunkokat termelne.
- Táblázat, kódblokk gyakorlatilag nincs a mintákban — sima folyószöveg, helyenként FAQ-szerű alcímekkel.
- Megjegyzés mellékesen: a products tábla (Prisma séma) magyar mezőket/neveket használ, a tudásbázis angol — ez a nyelvi eltérés a beágyazó modell megválasztásánál (multilingual embedding) lesz releváns, nem a chunkingnál.

** Mindezek alapján a chunking stratégia a következő: **
1. Determinisztikus előtisztítás (chunking előtt, kötelező lépés)
  - Frontmatter kiemelése metaadatként (title, source, category), nem a chunk szövegébe ágyazva.
  - Minden karakter törlése a ## Perfect Pairings For Your Plants sortól a fájl végéig (fix string-egyezés, mind a 202 fájlban működik).
  - A H1-duplikátum (frontmatter title-lel megegyezik) és az alatta lévő egysoros kategória-label (pl. "Plants 101") eldobása.
2. Rekurzív, mérethatáros vágás heading-preferenciával — nem szigorú "1 heading = 1 chunk"
  - Elválasztó-prioritás: bekezdéshatár (\n\n) → heading-sor → mondathatár. A heading csak preferált vágási pont, nem kötelező határ — így az inkonzisztens header-mélység nem tör el semmit.
  - Célméret: ~250–350 token (kb. 180–260 szó), ~10–15% átfedéssel.
  - Indoklás a méretre: a medián cikk ~930 szó, ez a mérettel 3–4 chunkra bomlik cikkenként — pont annyira, hogy egy chunk kb. egy alkérdésnek felel meg (fényigény / öntözés / páratartalom / FAQ-pont), ami illeszkedik ahhoz, hogy a felhasználók valószínűleg egy-egy konkrét gondozási szempontra kérdeznek rá, nem a teljes cikkre.
  - Ne legyen fix, mindenhol egyforma heading-alapú vágás (pl. "vágj minden ##-nál"), mert a minta szerint ez néhol egy-mondatos, néhol 5 bekezdéses chunkokat adna ugyanabban a korpuszban — kiegyensúlyozatlan retrieval-minőséghez vezetne.
3. Minden chunkhoz kötött metaadat: title, source, category, doc-id — ez teszi lehetővé a forrás visszamutatását a válaszban, és opcionális kategória-szűrést (pl. "kültéri" kérdésnél az outdoor-plant-care előresúlyozása).
4. A projekt szellemével összhangban (architektura.md: "Saját agent-loop... agent-framework nélkül, hogy a mechanika látható maradjon") érdemes a splittert is kézzel megírni (~30-50 sor), nem LangChain-t bevonni csak a chunkingért — ez konzisztens azzal, hogy az askAgent is kézzel írt tool-use loop.

* További indoklás: *
- Miért nem tiszta heading-alapú vágás? Mert empirikusan igazolt, hogy a scrape-elt headingek megbízhatatlanok (inkonzisztens mélység, üres szekciók) — ez heading-split esetén rendkívül egyenetlen chunkméretet adna, ami rontja a retrieval pontosságát.
- Miért nem nagy, fix méretű chunk (pl. 1 chunk = 1 teljes cikk)? Mert a cikkek átlag ~960 szavasak — egy ekkora chunk a beágyazó modellben elmossa a különböző alszempontokat (fény vs. öntözés vs. kártevők), rontva a pontos kérdésekre adott találati relevanciát.
- Miért nem nagyon kicsi (pl. mondatonkénti) chunk? Mert a bekezdések 80–150 szavas gondolati egységek, mondatonkénti vágás szétszakítaná az összefüggő kontextust (pl. tünet→ok párokat, mint a Christmas Cactus cikkben).
- Miért kritikus a boilerplate-eltávolítás mint első lépés? Mert ez byte-azonos mind a 202 fájlban — ha benne marad, ~200 majdnem duplikált "termékajánló" chunk kerülne a vektortárba, amelyek generikus kérdéseknél (pl. "mit ajánlasz kezdőknek?") versenyeznének a valódi gondozási tartalommal a top-k találatok között, rontva a válaszminőséget minden lekérdezésnél — ez messze a legnagyobb kockázat ebben a korpuszban, nagyobb, mint maga a chunkméret megválasztása.