# Plantbase — adatfolyam és adatvédelem

> Hol fut a modell, hova utazik az adat, mi nem hagyja el a saját környezetünket — a `docs/extension-for-customers.md` 87. sorának megfelelően.

## Külső szolgáltatások

| Szolgáltatás | Modell/API | Mit kap | Melyik kódútvonal |
| --- | --- | --- | --- |
| Anthropic API | `claude-sonnet-5` | A teljes chat-beszélgetés (ügyfél üzenetei + agent válaszai + tool-hívások eredményei) | `packages/core/src/lib/stream-agent.ts` (web-chat), `packages/core/src/lib/ask-agent.ts` (CLI) |
| Anthropic API | `claude-sonnet-5` | Az ügyfél neve/megszólítása + a rendelés adatai (a rendelés-visszaigazoló e-mail összeállításához) | `packages/core/src/lib/email/compose-order-email.ts` |
| Anthropic API | `claude-haiku-4-5-20251001` | A növénygondozási kérdés szövege + a tudásbázisból ANN-kereséssel előválogatott jelölt szövegrészek tartalma (relevancia-pontozáshoz) | `packages/core/src/lib/knowledge/rerank.ts` (a `search-knowledge.ts` hívja) |
| OpenAI API | `text-embedding-3-small` | A növénygondozási kérdés szövege (illetve a HyDE-dokumentum szövege — lásd lent), beágyazáshoz | `packages/core/src/lib/knowledge/embed-openai.ts` (a `search-knowledge.ts` hívja) |
| OpenAI API | `gpt-5-mini` | A növénygondozási kérdés szövege (HyDE lekérdezés-bővítéshez: egy rövid, plauzibilis válaszbekezdés generálása, ami aztán maga kerül beágyazásra a tényleges keresési vektorként) | `packages/core/src/lib/knowledge/hyde.ts` (a `search-knowledge.ts` hívja) |

Megjegyzés: a beágyazás bemenete valójában nem közvetlenül a felhasználói kérdés, hanem a HyDE-lépés kimenete (sikeres HyDE-hívás esetén) — lásd `packages/core/src/lib/knowledge/search-knowledge.ts`. Ha a HyDE-hívás hibázik, a rendszer a beágyazáshoz visszaesik az eredeti kérdés-szövegre; ha a rerank-hívás hibázik, a rendszer pontszám nélkül, a jelöltek eredeti sorrendje alapján válogat. Mindkét hiba csak logolódik (`logWarning`), a keresés nem áll le miattuk.

A fenti öt hívási pont a teljes lista — a `packages/core/src` (agent-eszközök, e-mail-összeállítás, tudásbázis-keresés RAG-rétege), az `apps/server/src` és az `apps/cli/src` átvizsgálása (`anthropic(`, `openai(`, `createOpenAI`, `@ai-sdk`, `new OpenAI`, `new Anthropic`, `@anthropic-ai`, `fetch(`, `axios` mintákra) nem talált más külső LLM- vagy API-hívást. Az `apps/web` `fetch`-hívásai kizárólag a saját `/api/...` backendünket célozzák, nem harmadik felet.

## Ami SOSEM hagyja el a saját környezetünket

- Az eszkalációs e-mail tartalma — SZÁNDÉKOSAN nincs hozzá LLM-hívás: `apps/server/src/lib/escalation-emails.ts` egy determinisztikus sztring-sablon, ami csak a `Prisma`-ból lekérdezett fiókadatokból és az eszkaláció már meglévő `summary` mezőjéből épül fel, külső hívás nélkül (a D al-projekt biztonsági döntése alapján).
- A teljes `accounts` tábla (név, e-mail, jelszó-hash) — csak a helyi Postgres-ben.
- Az `orders`/`order_audit_log`/`escalations` táblák — csak a helyi Postgres-ben (az eszkaláció `summary` mezője az agent saját, már meglévő beszélgetés-kontextusból származó összefoglalója, nem egy külön kimenő hívás eredménye).
- A `products`/`knowledge_chunks` katalógus-adat — csak a helyi Postgres-ben (a `knowledge_chunks.embedding` mező MÁR a beágyazott, OpenAI-nál előállított vektor, de az eredeti forrás-szöveg a helyi adatbázisban van).
- A szimulált e-mail-fájlok (`/emails`) — csak a helyi fájlrendszeren.

## Anonimizálás / adat-eltűnés

Lásd `docs/superpowers/specs/2026-08-20-privacy-design.md` — staff-indított, irreverzibilis fiók-anonimizálás (`POST /api/staff/accounts/:id/anonymize`) + az `/emails` könyvtár időkorlátos automatikus törlése (`packages/db/prisma/cleanup-old-emails.ts`, alapértelmezetten 30 nap).
