import { getReadOnlyPool } from './db-pool.js'

export async function listCategories(): Promise<string[]> {
  const result = await getReadOnlyPool().query<{ category: string }>(
    'SELECT DISTINCT category FROM products ORDER BY category',
  )
  return result.rows.map((row) => row.category)
}
