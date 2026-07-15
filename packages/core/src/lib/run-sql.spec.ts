import { getReadOnlyPool } from './db-pool.js'
import { assertSelectOnly, runSql } from './run-sql.js'

vi.mock('./db-pool.js', () => ({
  getReadOnlyPool: vi.fn(),
}))

describe('assertSelectOnly', () => {
  it('should pass for a plain SELECT', () => {
    expect(() =>
      assertSelectOnly('SELECT * FROM products LIMIT 10'),
    ).not.toThrow()
  })

  it('should pass for a lowercase select with a trailing semicolon', () => {
    expect(() => assertSelectOnly('select id from products;')).not.toThrow()
  })

  it('should reject INSERT', () => {
    expect(() =>
      assertSelectOnly("INSERT INTO products (name) VALUES ('x')"),
    ).toThrow()
  })

  it('should reject UPDATE', () => {
    expect(() => assertSelectOnly('UPDATE products SET price = 0')).toThrow()
  })

  it('should reject DELETE', () => {
    expect(() => assertSelectOnly('DELETE FROM products')).toThrow()
  })

  it('should reject DROP TABLE', () => {
    expect(() => assertSelectOnly('DROP TABLE products')).toThrow()
  })

  it('should reject stacked statements after a SELECT', () => {
    expect(() => assertSelectOnly('SELECT 1; DROP TABLE products;')).toThrow()
  })

  it('should reject a forbidden keyword hidden inside a SELECT', () => {
    expect(() =>
      assertSelectOnly(
        'SELECT * FROM products; DELETE FROM products WHERE 1=1',
      ),
    ).toThrow()
  })

  it('should reject an empty query', () => {
    expect(() => assertSelectOnly('   ')).toThrow()
  })
})

describe('runSql', () => {
  it('runs the given query against the read-only pool and returns its rows', async () => {
    const rows = [{ id: 1, name: 'Aloe vera' }]
    const query = vi.fn().mockResolvedValue({ rows })
    vi.mocked(getReadOnlyPool).mockReturnValue({ query } as never)

    const result = await runSql('SELECT * FROM products')

    expect(query).toHaveBeenCalledWith('SELECT * FROM products')
    expect(result).toEqual(rows)
  })

  it('rejects a non-SELECT query without ever calling the pool', async () => {
    const query = vi.fn()
    vi.mocked(getReadOnlyPool).mockReturnValue({ query } as never)

    await expect(runSql('DELETE FROM products')).rejects.toThrow(
      'Csak SELECT lekérdezés engedélyezett.',
    )
    expect(query).not.toHaveBeenCalled()
  })
})
