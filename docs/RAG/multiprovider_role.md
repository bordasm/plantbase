** Multi-provider szereposztás a RAG-pipeline-ban: melyik modell mit csinál, és miért **

A `searchKnowledge` tool pipeline-ja tudatosan két különböző LLM-providerre (Anthropic, OpenAI) van szétosztva. Nem formális szétosztás (ahol csak egy kötelező elem — az embedding — menne a másik providerhez), hanem érdemi, feladat-alapú: a *retrieval-előkészítés* OpenAI-nál van, az *ítélkezés + orchestráció* Anthropicnál.

## Szereposztás

| Lépés | Modell | Provider |
|---|---|---|
| Embedding (index + query/HyDE-doc) | `text-embedding-3-small` | OpenAI |
| HyDE hipotetikus válasz generálása | `gpt-5-mini` | OpenAI |
| Rerank (relevancia-pontozás, 0-10) | `claude-haiku-4-5-20251001` | Anthropic |
| Végső válasz szintézis + grounding + tool-use orchestráció | `claude-sonnet-5` | Anthropic |

(A pontos modell-azonosítók a ténylegesen commitolt kódból: `packages/core/src/lib/knowledge/embed-openai.ts`, `hyde.ts`, `rerank.ts`, illetve `packages/core/src/lib/ask-agent.ts`.)

## Indoklás — miért pont ez a szereposztás

**Elv:** a *retrieval-előkészítés* (gyors/olcsó generálás + vektorszámítás, nem igényel mély érvelést) OpenAI-nál marad — ami amúgy is kötelező az embeddinghez, így nem nyitunk extra providert feleslegesen. A *döntéshozatal/ítélkezés* (mi releváns, mi a végső válasz) Anthropicnál marad, ami már ma is a termék döntéshozó rétege (az `askAgent` már eleve Anthropic Sonnet-re épült, mielőtt a RAG bekerült volna).

**Embedding — OpenAI `text-embedding-3-small`**
Adottság volt a feladatban (kisebb OpenAI embedding modell). Ez az egyetlen OpenAI-elem, ami mindenképp kellett — a többi OpenAI-szerep erre épül rá tudatosan (lásd lent), nem függetlenül lett odarakva.

**HyDE — OpenAI `gpt-5-mini`**
- Olcsó, gyors, egylövéses generatív lépés: egy rövid, plauzibilis válaszbekezdést kell írnia a kérdésre, amit aztán embedelünk.
- A HyDE lényege, hogy a *plauzibilis*, nem a *helyes* válasz is javítja a retrievalt (a hipotetikus szöveg szókincse közelebb áll a valódi találati dokumentumok szókincséhez, mint a felhasználó kérdésének megfogalmazása) — ehhez nem kell mély érvelés vagy tool-use, egy kis, gyors modell tökéletesen elég.
- Mivel az embeddinghez már kötelező az OpenAI-kapcsolat, ésszerű ugyanazon a providernél tartani ezt az olcsó generatív előkészítő lépést is, nem nyitni egy harmadik felesleges API-felületet.

**Rerank — Anthropic `claude-haiku-4-5-20251001`**
- A kódbázis már Anthropic tool-use mintát használ strukturált JSON kikényszerítésére (a meglévő `runSql`/`listCategories` tool schema-k) — a rerank ugyanezt a mintát (`tool_choice: {type: 'tool', name: 'submitScores'}`) újrahasznosítja egy `submitScores` tool-lal, Zod-validált válasszal.
- Ez már *ítélkezés* (mi releváns a kérdéshez), nem gyors generálás — ezért került át Anthropichoz, a döntéshozó oldalra, annak ellenére, hogy egy kis/olcsó Anthropic modell (Haiku), nem a fő Sonnet.
- Konzisztencia: ugyanaz a provider-család hozza a relevancia-ítéletet, mint amelyik a végső választ szintetizálja belőle — ha a rerank és a végső válasz "nem értene egyet", könnyebb debugolni, ha mindkettő Anthropic minőségi sávban van, nem egy harmadik gyártó ítélkezik úgy, hogy közben egy másik gyártó épít rá választ.

**Végső válasz szintézis + orchestráció — Anthropic `claude-sonnet-5`**
- Ez már ma is az agent "agya": a meglévő tool-use loop (`askAgent`) ezzel a modellel fut, bővült egy új `searchKnowledge` tool-lal a meglévő `runSql`/`listCategories` mellé.
- A grounding (forráshivatkozás a válasz végén "Források:" alatt) és az őszinte "nincs találat" viselkedés system prompt-szintű szabály — ehhez a modellnek kell tartania magát a `searchKnowledge` `found: true/false` eredményéhez, ami megbízható instrukció-követést igényel; ez a meglévő, már bevált Sonnet-orchestrátor feladata marad, nem lett külön kiszervezve.

## Mérlegelt, de elvetett alternatívák

**B) Minimál-OpenAI:** csak az embedding megy OpenAI-hoz, minden generatív lépés (HyDE, rerank, válasz) Anthropic. Egyszerűbb, kevesebb külső API-felület — de a multi-provider routing ekkor formális maradna (csak az embedding hívja ténylegesen az OpenAI-t), nem érdemi feladat-alapú szétosztás.

**C) Költség-optimalizált:** HyDE ÉS rerank is OpenAI mini, Anthropic csak a végső válaszért. Legolcsóbb, de elveszíti a kódbázisban már bevált Anthropic tool-use strukturált kimenet mintáját a reranknél, és egy más gyártó modellje dönt arról, mi releváns, miközben egy másik gyártó épít erre a végső válasznál — nehezebb debugolni a minőségromlást, ha a kettő "nem ért egyet".

**Végső döntés: A javasolt szereposztás** — tiszta elvi határvonal (ki dönt vs. ki generál gyorsan), újrahasznosítja a meglévő Anthropic tool-use mintát a reranknél, és az OpenAI-oldal pontosan annyi feladatot kap, amennyi mindenképp odavaló (embedding + egy olcsó generatív lépés), nem többet.
