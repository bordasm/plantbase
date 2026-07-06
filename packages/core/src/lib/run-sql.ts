import pg from 'pg'

const { Pool } = pg

let pool: InstanceType<typeof Pool> | undefined

function getPool(): InstanceType<typeof Pool> {
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL_READONLY })
  return pool
}

const FORBIDDEN_KEYWORDS =
  /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|call|do|vacuum|explain)\b/i

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
}

export async function runSql(query: string): Promise<Record<string, unknown>[]> {
  assertSelectOnly(query)
  const result = await getPool().query(query)
  return result.rows
}
