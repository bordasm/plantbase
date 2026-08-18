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

  it('should reject a syntactically valid single SELECT against orders', () => {
    expect(() =>
      assertSelectOnly('SELECT * FROM orders WHERE account_id = 1 LIMIT 10'),
    ).toThrow('A lekérdezés csak a következő táblá(k)ra irányulhat: products.')
  })

  it('should reject a SELECT against order_audit_log', () => {
    expect(() =>
      assertSelectOnly('select previous_data from order_audit_log'),
    ).toThrow('A lekérdezés csak a következő táblá(k)ra irányulhat: products.')
  })

  it('should reject a JOIN that pulls in a non-allow-listed table', () => {
    expect(() =>
      assertSelectOnly(
        'SELECT p.name FROM products p JOIN orders o ON o.category = p.category',
      ),
    ).toThrow('A lekérdezés csak a következő táblá(k)ra irányulhat: products.')
  })

  it('should reject a schema-qualified reference to a non-allow-listed table', () => {
    expect(() =>
      assertSelectOnly('SELECT * FROM public.order_audit_log'),
    ).toThrow('A lekérdezés csak a következő táblá(k)ra irányulhat: products.')
  })

  it('should still allow a schema-qualified products query', () => {
    expect(() =>
      assertSelectOnly('SELECT name FROM public.products LIMIT 5'),
    ).not.toThrow()
  })

  it('should reject a comma-style FROM list smuggling in a non-allow-listed table', () => {
    expect(() =>
      assertSelectOnly('SELECT * FROM products p, accounts a LIMIT 3'),
    ).toThrow('A lekérdezés csak a következő táblá(k)ra irányulhat: products.')
  })

  it('should reject a double-quoted identifier', () => {
    expect(() =>
      assertSelectOnly('SELECT email FROM "accounts" LIMIT 3'),
    ).toThrow('A lekérdezés idézőjeles azonosítót nem tartalmazhat.')
  })

  it('should reject a table name hidden behind a block comment', () => {
    expect(() => assertSelectOnly('SELECT * FROM/**/accounts')).toThrow(
      'A lekérdezés csak a következő táblá(k)ra irányulhat: products.',
    )
  })

  it('should reject a comma-style FROM list referencing sessions', () => {
    expect(() =>
      assertSelectOnly('SELECT * FROM products p, sessions s'),
    ).toThrow('A lekérdezés csak a következő táblá(k)ra irányulhat: products.')
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
