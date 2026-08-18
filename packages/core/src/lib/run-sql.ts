import { getReadOnlyPool } from './db-pool.js'

// A halmaz-operátorok (union/intersect/except) azért tiltottak, mert velük
// egyetlen utasításon belül -- pontosvessző, tehát "több utasítás" nélkül --
// be lehet csempészni egy második SELECT-et egy másik táblára. A tool jogos,
// egy-táblás katalógus-lekérdezéseinek soha nincs szükségük ilyesmire.
const FORBIDDEN_KEYWORDS =
  /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|call|do|vacuum|explain|union|intersect|except)\b/i

// A runSql tool kizárólag a katalógust szolgálja ki: a products tábla az
// egyetlen megengedett forrás. A knowledge_chunks NEM tartozik ide -- azt a
// searchKnowledge saját beágyazás-kereső útvonala kérdezi le közvetlenül a
// pool-on (lásd knowledge/search-knowledge.ts), nem ezen a tool-on át.
const ALLOWED_TABLES = ['products']

// `FROM`/`JOIN` utáni tábla-nevek kiszedése. Nem teljes SQL-parser, és nem is
// az akar lenni: ez másodlagos védelmi réteg az elsődleges, DB-szintű
// jogosultság-korlátozás mögött (a plantbase_ro szerepkör nem lát rá az
// orders/order_audit_log táblákra -- lásd a
// 20260818194644_restrict_readonly_role_to_catalog migrációt --, sem az
// accounts/sessions táblákra -- lásd a
// 20260818203503_restrict_readonly_role_from_accounts_sessions migrációt).
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

// Egy dollár-idézett string nyitó tag-je (`$$` vagy `$tag$`) a pozíció
// elején. A `$1` paraméter-helyőrző szándékosan NEM illeszkedik rá.
const DOLLAR_QUOTE_TAG = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/

// Komment és string-literál eltávolítása egy munkapéldányból, kizárólag a
// tábla-név ellenőrzéshez -- a ténylegesen futtatott query stringet ez NEM
// módosítja. Enélkül egy `FROM/**/accounts` vagy `FROM --x\naccounts` alakú
// lekérdezés megkerülhetné a `\s+` mintát kereső regexeket.
//
// EGYETLEN, balról jobbra haladó menetben dolgozunk, mert a token-fajták
// sorrendje itt biztonsági kérdés: a korábbi, egymás utáni `.replace()`
// hívásokból álló változat előbb a kommenteket szedte ki, csak utána a
// string-literálokat, így két KÜLÖN string-literálba írt `/*` és `*/`
// részlet közé rejtve el lehetett tüntetni valódi SQL-t a tábla-név
// scanner elől (élesben kihasznált rés volt:
// `... WHERE name = '/*' UNION SELECT token FROM accounts WHERE token = '*/'`).
// A helyes SQL-lexelési szabály az, hogy a string-literál határai
// ELSŐBBSÉGET élveznek: egy `/*` vagy `--` a literálon belül csak adat.
// Ezt egyetlen menet tudja garantálni.
//
// A lezáratlan literál/komment a query végéig nyel -- ez nem rés, mert az
// ilyen lekérdezést maga a Postgres is szintaktikai hibával utasítja el.
function stripCommentsAndStrings(query: string): string {
  let out = ''
  let i = 0

  while (i < query.length) {
    const char = query[i]
    const next = query[i + 1]

    // Sor-komment: `--`-tól a sor végéig.
    if (char === '-' && next === '-') {
      const end = query.indexOf('\n', i)
      i = end === -1 ? query.length : end
      out += ' '
      continue
    }

    // Blokk-komment. A Postgres-ben ezek EGYMÁSBA ÁGYAZHATÓK, ezért a
    // nyitó/záró párokat számoljuk, nem az első `*/`-nél zárunk.
    if (char === '/' && next === '*') {
      let depth = 1
      i += 2
      while (i < query.length && depth > 0) {
        if (query[i] === '/' && query[i + 1] === '*') {
          depth += 1
          i += 2
        } else if (query[i] === '*' && query[i + 1] === '/') {
          depth -= 1
          i += 2
        } else {
          i += 1
        }
      }
      out += ' '
      continue
    }

    // Dollár-idézett string (`$$...$$`, `$tag$...$tag$`): a benne lévő
    // aposztróf nem nyit literált, ezért külön kell kezelni.
    if (char === '$') {
      const tag = DOLLAR_QUOTE_TAG.exec(query.slice(i))?.[0]
      if (tag) {
        const end = query.indexOf(tag, i + tag.length)
        i = end === -1 ? query.length : end + tag.length
        out += " '' "
        continue
      }
    }

    // Egyszeres idézőjeles string-literál. A `''` a literálon belüli
    // escape-elt aposztróf; `E'...'` prefix esetén a `\` is escape-el.
    if (char === "'") {
      const backslashEscapes =
        (query[i - 1] === 'e' || query[i - 1] === 'E') &&
        (i < 2 || !/[\w$]/.test(query[i - 2]))
      i += 1
      while (i < query.length) {
        if (backslashEscapes && query[i] === '\\') {
          i += 2
          continue
        }
        if (query[i] === "'") {
          if (query[i + 1] === "'") {
            i += 2
            continue
          }
          i += 1
          break
        }
        i += 1
      }
      out += "''"
      continue
    }

    out += char
    i += 1
  }

  return out
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
