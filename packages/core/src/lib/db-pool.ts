import pg from 'pg'

const { Pool } = pg

let pool: InstanceType<typeof Pool> | undefined

// Megosztott read-only kapcsolat (DATABASE_URL_READONLY) a runSql és a
// listCategories tool között -- architektura.md #2: az agent csak a
// read-only szerepkörön (plantbase_ro) keresztül éri el az adatot.
export function getReadOnlyPool(): InstanceType<typeof Pool> {
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL_READONLY })
  return pool
}
