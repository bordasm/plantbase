# Tudásbázis inkrementális karbantartása — architektúra specifikáció

> Ez a dokumentum azt írja le, hogyan tartanám szinkronban a `knowledge_chunks` vektortárat a forrás weboldal (jelenleg: a `seed/knowledge/` alá lementett, thesill.com-ról származó 202 cikk) tartalmával **folyamatos üzemben**, anélkül hogy minden frissítésnél a teljes korpuszt újra kellene vektorizálni. A jelenlegi `seed-knowledge.ts` script egy egyszeri, teljes újratöltést (`DELETE FROM knowledge_chunks` + mindent újraír) végez — ez a specifikáció az ennél olcsóbb, inkrementális utódot írja le.

## 1. Adatmodell-bővítés (előfeltétel)

A jelenlegi `knowledge_chunks` tábla (`id, source_file, title, source_url, category, chunk_index, content, embedding`) dokumentum-szintű metaadatot (cím, forrás, kategória) chunk-szinten, ismételve tárol, és nincs benne semmi, ami alapján eldönthető lenne, hogy egy dokumentum _változott-e_ a legutóbbi indexeléshez képest.

Ehhez egy **dokumentum-szintű követő tábla** szükséges, a chunkok tábla pedig erre hivatkozik:

```sql
knowledge_documents (
  id              serial primary key,
  source_url      text UNIQUE NOT NULL,  -- a dokumentum stabil, természetes kulcsa
  title           text NOT NULL,
  category        text NOT NULL,
  content_hash    text NOT NULL,         -- SHA-256, a TISZTÍTOTT (cleanDocument utáni) törzsszövegen
  last_seen_at    timestamptz NOT NULL,  -- utoljára mikor látta a forrásban (push vagy pull)
  missing_count   int NOT NULL DEFAULT 0,-- hányszor volt egymás után "nem található" (törlés-debounce, ld. 5.2)
  deleted_at      timestamptz            -- soft delete időbélyeg, NULL = aktív
)

knowledge_chunks (
  id            serial primary key,
  document_id   int NOT NULL REFERENCES knowledge_documents(id),
  chunk_index   int NOT NULL,
  content       text NOT NULL,
  embedding     vector(1536) NOT NULL
)
```

- **`source_url` a természetes kulcs**, nem a fájlnév — élő rendszerben a forrás weboldal ad URL-t, nem lokális `.md` fájlt (a jelenlegi `source_file` a `seed/knowledge/` bootstrap-específikus, ideiglenes állapot maradványa).
- **`content_hash` a tisztított törzsön** számolt (a `cleanDocument` kimenetén, NEM a nyers HTML/markdown-on) — ez már ma is bevett lépés a pipeline-ban (Task 1), és mert a `docs/RAG/chunking.md` elemzés szerint a forrás cikkek végén lévő marketing-boilerplate (`## Perfect Pairings For Your Plants` blokk) tartalma rotálódhat anélkül, hogy a tényleges gondozási tartalom változna — ha a nyers HTML-en hashelnénk, ilyen kozmetikai változás is fölösleges újraindexelést váltana ki.
- **A futásidejű `searchKnowledge` keresés nem változik** — továbbra is csak a `knowledge_chunks` táblát olvassa a read-only poolon; a `knowledge_documents` tábla kizárólag a karbantartási pipeline belső könyvelése.

## 2. Honnan tudom, hogy egy dokumentum változott?

Minden beérkező (push) vagy lekérdezett (pull) dokumentumra:

1. `cleanDocument(raw)` — a már meglévő, Task 1-ben megírt tiszta függvény lefuttatása a nyers tartalmon.
2. `newHash = sha256(cleaned.body)` kiszámítása.
3. `knowledge_documents` lekérdezése `source_url` alapján:
   - **nincs ilyen sor** → új dokumentum (ld. 3. pont).
   - **van sor, `newHash === content_hash`** → **nem változott**, nincs teendő (csak `last_seen_at = now()`, `missing_count = 0` frissítés).
   - **van sor, `newHash !== content_hash`** → **változott** (ld. 4. pont).

Ez a hash-összehasonlítás a válasz mindkét kötelező kérdésre: _honnan tudod, hogy változott_ (a hash eltér) és _hogyan éred el, hogy ami nem változott, ne vektorizálódjon újra_ — ha a hash egyezik, a pipeline **azonnal visszatér**, mielőtt bármilyen OpenAI embedding-hívás történne. Ez a döntő költség-optimalizáció: egyetlen frissített cikk esetén csak annak a cikknek a néhány chunkja megy át újra a HyDE/embedding lépésen, nem a teljes 1115 chunk.

## 3. Mi történik az új dokumentummal?

```
1. INSERT INTO knowledge_documents (source_url, title, category, content_hash, last_seen_at)
2. chunkText(cleaned.body) → N chunk
3. embedTexts(chunks) → N embedding (OpenAI, csak ennyi hívás — nem az egész korpuszra)
4. INSERT INTO knowledge_chunks (document_id, chunk_index, content, embedding) — N sor
```

Nincs törlendő korábbi állapot, a teljes pipeline egyetlen tranzakcióban fut (ha bármelyik lépés hibázik, a tranzakció visszagördül — nem marad félkész dokumentum a táblákban).

## 4. Mi történik a módosított dokumentummal?

```
1. UPDATE knowledge_documents SET content_hash = newHash, title = ..., category = ..., last_seen_at = now() WHERE id = ...
2. DELETE FROM knowledge_chunks WHERE document_id = ...   -- a régi chunkok eldobása
3. chunkText(cleaned.body) → N (esetleg más számú) chunk
4. embedTexts(chunks) → N embedding
5. INSERT INTO knowledge_chunks (...) — N új sor
```

**Miért teljes chunk-csere, nem finomszemcsés (chunk-szintű) diff?** A chunkolás determinisztikus, de nem stabil-indexű: ha egy bekezdés a dokumentum elején bővül, az összes utána következő chunk tartalma/határa eltolódhat. Egy finomszemcsés "csak a ténylegesen változott chunkokat cseréld" logika bonyolult, hibalehetőség-érzékeny (elcsúszott `chunk_index`-ek), és a nyereség elhanyagolható — egy dokumentum átlagosan 3-6 chunkra bomlik (lásd `docs/RAG/chunking.md`), ennyi embedding-hívás újrafuttatása triviálisan olcsó (nagyságrendileg $0,0001 dokumentumonként, lásd a README költségbecslését). Ez tudatos YAGNI-döntés: a teljes dokumentum újra-chunkolása egyszerű, korrekt, és a költsége elhanyagolható a bonyolultabb megoldáshoz képest.

## 5. Mi történik a törölt dokumentum chunkjaival?

### 5.1 Push esetén (explicit törlés-esemény)

A forrás weboldal egy `{"event": "deleted", "source_url": "..."}` payloadot küld. Ekkor nincs bizonytalanság (a forrás direktben mondja, hogy törölve lett), ezért **debounce nélkül**, azonnal:

```
1. DELETE FROM knowledge_chunks WHERE document_id = (SELECT id FROM knowledge_documents WHERE source_url = ...)
2. UPDATE knowledge_documents SET deleted_at = now() WHERE source_url = ...   -- soft delete, NEM hard delete
```

### 5.2 Pull (batch) esetén — debounce szükséges

Az éjszakai batch nem kap explicit törlés-eseményt, csak azt látja, hogy egy korábban ismert `source_url` **nem szerepel** a mai lekérdezett listában. Ez lehet valódi törlés, de lehet **átmeneti hiba** is (a forrás weboldal aznap éjjel épp nem válaszolt egy oldalra, hálózati hiba, rate limit). Ezért:

```
Minden eddig ismert, aktív (deleted_at IS NULL) dokumentumra, ami a mai listában NEM szerepelt:
  UPDATE knowledge_documents SET missing_count = missing_count + 1 WHERE ...

Ha missing_count >= 3 (három egymást követő éjszakai futás nem találta):
  DELETE FROM knowledge_chunks WHERE document_id = ...
  UPDATE knowledge_documents SET deleted_at = now() WHERE ...
```

A 3-as küszöb egy tudatos védelem az ál-pozitív törlés ellen: egyetlen sikertelen batch-futás (pl. a forrás oldal aznap nem elérhető) nem törli ki a teljes tudásbázist — csak egy tartósan, 3 egymást követő éjszakán át hiányzó dokumentum számít ténylegesen töröltnek.

### 5.3 Miért soft delete a `knowledge_documents`-en, de hard delete a `knowledge_chunks`-on?

- A **chunkok** (vektorok) nagyok, és a futásidejű keresésnek azonnal el kell tűnniük — nincs értelme megtartani egy törölt cikk embeddingjeit, mert azok soha többé nem lehetnek helyes találatok.
- A **dokumentum metaadat-sora** (`knowledge_documents`) olcsó és hasznos auditálásra/hibakeresésre ("mikor és miért tűnt el ez a cikk?"), ezért `deleted_at`-tel megjelölve, de nem törölve marad — egy külön, ritkán futó karbantartó job (pl. havonta) fizikailag törölheti a 90 napnál régebbi, soft-deleted sorokat, ha a tárhely szempontja indokolja. Ez a specifikáció scope-ján kívül eső finomítás (YAGNI most).

## 6. Mikor / mi triggereli az újraindexelést?

### Opció A — Push (preferált)

A forrás weboldal minden létrehozás/módosítás/törlés eseménynél HTTP webhookot küld egy általunk üzemeltetett, kis, dedikált végpontnak.

**Új komponens szükséges**: a projekt jelenleg kizárólag CLI-alkalmazás, nincs futó HTTP szerver. Egy minimális webhook-fogadó szolgáltatás (`apps/webhook-listener`, egy új Nx app) szükséges — a projekt "nincs felesleges framework" szellemével összhangban egy vékony HTTP-listener (pl. csak a Node beépített `http` modulja, vagy egy minimális útválasztó), NEM egy teljes webalkalmazás-keretrendszer.

**Payload** (a forrás oldal küldi):

```json
{
  "event": "created" | "updated" | "deleted",
  "source_url": "https://www.thesill.com/blogs/plants-101/...",
  "title": "...",
  "category": "plants-101",
  "content": "<a cikk aktuális, teljes markdown/HTML törzse — 'created'/'updated' esetén>"
}
```

Ha a forrás oldal technikailag csak egy "változott" pinget tud küldeni tartalom nélkül (`content` mező hiányzik), a listener szinkron visszalekéri a `source_url`-t (egyetlen HTTP GET), mielőtt a pipeline-t indítaná — ez a rugalmasabb, de lassabb változat.

**Biztonság**: a payloadot HMAC-aláírással kell hitelesíteni (megosztott titok, `.env`-ben, pl. `WEBHOOK_SECRET`) — a listener elutasít minden kérést érvénytelen aláírással, hogy ne lehessen hamis "változott" eseményeket küldeni, ami felesleges (és fizetős, OpenAI-hívásokat generáló) újraindexelést váltana ki.

**Feldolgozás**: a listener a beérkező, hitelesített eseményt közvetlenül átadja a megosztott `syncDocument()` függvénynek (ld. 7. pont) — szinkron, kérésenként egy dokumentum. A várható forgalom (egy 202 cikkes gondozási blog frissítési gyakorisága) alapján ez bőven elég; ha a mennyiség később nőne, egy üzenetsor (pl. egy egyszerű DB-alapú job-tábla) beiktatása utólagos finomítás, nem induló követelmény.

**Előny**: azonnali frissülés (a tudásbázis percek alatt szinkronba kerül egy cikk-változással), nincs felesleges polling, nincs napi "vak" teljes lista-letöltés.

### Opció B — Pull (ha a push nem megoldható)

Ha a forrás weboldal üzemeltetője nem vállalja a webhook-küldés fejlesztését, egy **éjszakai, időzített batch job** (`packages/db/prisma/reindex-batch.ts`, a meglévő `seed-knowledge.ts` mintáját követve) végzi a szinkront:

```
1. A forrás weboldal cikklistájának lekérdezése (pl. sitemap.xml, vagy egy lista-oldal
   feltérképezése) → a jelenleg élő source_url-ek teljes halmaza.
2. Minden URL-re: letöltés → cleanDocument → hash-összevetés a knowledge_documents-szel
   → skip / új dokumentum / módosított dokumentum (ld. 2-4. pont).
3. Minden eddig ismert, aktív dokumentumra, ami a mai listában nem szerepelt:
   missing_count növelése, 3 egymást követő hiány után törlés (ld. 5.2 pont).
4. Összegző log: hány új / módosított / törölt / változatlan dokumentum volt.
```

**Trigger mechanizmus**: OS-szintű ütemező hívja meg a scriptet — helyi/fejlesztői környezetben Windows Feladatütemező vagy `cron` (Linux/WSL), pl. minden éjjel 02:00-kor: `npx tsx prisma/reindex-batch.ts` a `packages/db` könyvtárból. Éles/felhő-környezetben ez egy natívabb ütemezővel (pl. felhő cron-job, GitHub Actions scheduled workflow) triviálisan helyettesíthető — a triggerelő mechanizmus cserélhető, a mögötte futó logika ugyanaz.

**Hátrány a push-hoz képest**: akár 24 órás késés egy változás és annak a tudásbázisba kerülése között; napi teljes lista-bejárás (több hálózati kérés, mint egy célzott push-esemény); a törléshez debounce (3 nap) kell, ami a push-nál nem szükséges.

### Mindkét opció közös magja

A push és a pull trigger is **ugyanazt a megosztott logikát** hívja — nem két külön implementáció:

```ts
// packages/core/src/lib/knowledge/sync-document.ts
export async function syncDocument(doc: {
  sourceUrl: string
  title: string
  category: string
  rawContent: string
}): Promise<'skipped' | 'inserted' | 'updated'>
```

Ez a függvény végzi a 2-4. pontban leírt tisztítás → hash-összevetés → (skip | insert | update) döntést és a hozzá tartozó DB-műveleteket. A webhook-listener (push) és a `reindex-batch.ts` (pull) egyaránt csak ezt hívja meg, dokumentumonként — a duplikáció elkerülése (DRY) és a konzisztens viselkedés (mindkét úton ugyanaz a hash-logika, ugyanaz a chunkolás) érdekében.

## 7. Idempotencia és konkurencia

- A `syncDocument()` **idempotens**: ugyanazt a dokumentumot kétszer egymás után (pl. egy webhook-retry + ugyanazon az éjszakán lefutó batch átfedése miatt) feldolgozva a második hívás a hash-egyezés miatt azonnal `'skipped'`-del tér vissza, nincs dupla munkavégzés.
- `source_url` UNIQUE constraint a `knowledge_documents`-en garantálja, hogy egyidejű beszúrási kísérletek (két egyidejű webhook ugyanarra az URL-re) nem hoznak létre duplikált dokumentum-sorokat — a második kísérlet `ON CONFLICT (source_url) DO UPDATE`-tel fut, nem hibázik el.

## 8. Architektúra-ábra

\docs\RAG\architektura-diagram.jpg 

## 9. Kizárt a scope-ból (YAGNI)

- **Chunk-szintű finomszemcsés diff** — teljes dokumentum-csere elegendő (ld. 4. pont indoklása).
- **Üzenetsor (queue) a webhook-fogadó elé** — a várható forgalom mellett a szinkron, kérésenkénti feldolgozás elég; utólag hozzáadható, ha a mennyiség indokolja.
- **`knowledge_documents` fizikai (hard) törlése** — csak soft delete, a takarítás egy külön, ritkán futó karbantartó job feladata, ha egyáltalán szükséges.
- **Webhook payload sématervezés a valós forrás API-jához igazítva** — ez a specifikáció egy ésszerű, általános payload-formát feltételez; a tényleges mezőnevek a forrás weboldal fejlesztőivel egyeztetve alakulnak ki, ha a push opció megvalósul.
