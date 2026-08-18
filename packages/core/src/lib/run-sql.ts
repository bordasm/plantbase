import { getReadOnlyPool } from './db-pool.js'

const FORBIDDEN_KEYWORDS =
  /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|call|do|vacuum|explain)\b/i

// A runSql tool kizárólag a katalógust szolgálja ki: a products tábla az
// egyetlen megengedett forrás. A knowledge_chunks NEM tartozik ide -- azt a
// searchKnowledge saját beágyazás-kereső útvonala kérdezi le közvetlenül a
// pool-on (lásd knowledge/search-knowledge.ts), nem ezen a tool-on át.
const ALLOWED_TABLES = ['products']

// `FROM`/`JOIN` utáni tábla-nevek kiszedése. Nem teljes SQL-parser, és nem is
// az akar lenni: ez másodlagos védelmi réteg az elsődleges, DB-szintű
// jogosultság-korlátozás mögött (a plantbase_ro szerepkör nem lát rá az
// orders/order_audit_log táblákra -- lásd a
// 20260818194644_restrict_readonly_role_to_catalog migrációt).
const TABLE_REFERENCE = /\b(?:from|join)\s+([a-z_][\w$]*(?:\.[a-z_][\w$]*)*)/gi

// Explicit tiltólista: ezeket a tábla-neveket sehol nem engedjük szerepelni a
// (komment- és string-literál-mentesített) lekérdezésben, függetlenül attól,
// hogy FROM/JOIN után, vessővel elválasztott FROM-listában, vagy bármilyen
// más szintaktikai formában bukkannak fel. Ez lefedi azt az esetet is,
// amikor a FROM/JOIN-adjacency regex kimarad (pl. `FROM products p, accounts
// a`), mert nem próbálja megparse-olni a FROM-klauzula teljes szerkezetét.
// Nincs `g` flag: ezt a regexet kizárólag `.test()`-tel használjuk, a `g`
// flag pedig a megosztott, modul-szintű regex-objektumon `lastIndex`
// állapotot tartana fenn a hívások között, ami hibás (állapotfüggő)
// eredményhez vezetne ismételt híváskor.
const DENYLISTED_TABLES =
  /\b(orders|order_audit_log|accounts|sessions|_prisma_migrations)\b/i

// Komment és string-literál eltávolítása egy munkapéldányból, kizárólag a
// tábla-név ellenőrzéshez -- a ténylegesen futtatott query stringet ez NEM
// módosítja. Enélkül egy `FROM/**/accounts` vagy `FROM --x\naccounts` alakú
// lekérdezés megkerülhetné a `\s+` mintát kereső regexeket.
function stripCommentsAndStrings(query: string): string {
  return query
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
}

/**
 * Csak SELECT engedélyezett -- alkalmazás-szintű védelem a DB-szintű
 * read-only szerepkör (plantbase_ro, lásd docker/init-readonly-role.sql)
 * mellett, hogy a hiba korán, beszédes üzenettel bukjon.
 */
export function assertSelectOnly(query: string): void {
  const trimmed = query.trim().replace(/;+\s*$/, '')
  if (trimmed.length === 0) {
    throw new Error('Üres SQL lekérdezés.')
  }
  if (trimmed.includes(';')) {
    throw new Error('Csak egyetlen SQL utasítás engedélyezett.')
  }
  if (!/^select\b/i.test(trimmed)) {
    throw new Error('Csak SELECT lekérdezés engedélyezett.')
  }
  if (FORBIDDEN_KEYWORDS.test(trimmed)) {
    throw new Error('A lekérdezés tiltott kulcsszót tartalmaz.')
  }
  assertAllowedTables(trimmed)
}

function assertAllowedTables(query: string): void {
  // Idézőjeles azonosítót (`"accounts"`) a runSql tool egyetlen jogos
  // (products-katalógus) használati esete sem igényel -- ez a legolcsóbb
  // módja annak, hogy egy csupasz-azonosítót kereső scannert megkerüljön.
  if (query.includes('"')) {
    throw new Error('A lekérdezés idézőjeles azonosítót nem tartalmazhat.')
  }

  const stripped = stripCommentsAndStrings(query)

  if (DENYLISTED_TABLES.test(stripped)) {
    throw new Error(
      `A lekérdezés csak a következő táblá(k)ra irányulhat: ${ALLOWED_TABLES.join(', ')}.`,
    )
  }

  for (const match of stripped.matchAll(TABLE_REFERENCE)) {
    const parts = match[1].split('.')
    const table = parts[parts.length - 1].toLowerCase()
    if (!ALLOWED_TABLES.includes(table)) {
      throw new Error(
        `A lekérdezés csak a következő táblá(k)ra irányulhat: ${ALLOWED_TABLES.join(', ')}.`,
      )
    }
  }
}

export async function runSql(
  query: string,
): Promise<Record<string, unknown>[]> {
  assertSelectOnly(query)
  const result = await getReadOnlyPool().query(query)
  return result.rows
}
