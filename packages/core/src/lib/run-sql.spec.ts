import { assertSelectOnly } from './run-sql.js'

describe('assertSelectOnly', () => {
  it('should pass for a plain SELECT', () => {
    expect(() => assertSelectOnly('SELECT * FROM products LIMIT 10')).not.toThrow()
  })

  it('should pass for a lowercase select with a trailing semicolon', () => {
    expect(() => assertSelectOnly('select id from products;')).not.toThrow()
  })

  it('should reject INSERT', () => {
    expect(() => assertSelectOnly("INSERT INTO products (name) VALUES ('x')")).toThrow()
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
    expect(() => assertSelectOnly('SELECT * FROM products; DELETE FROM products WHERE 1=1')).toThrow()
  })

  it('should reject an empty query', () => {
    expect(() => assertSelectOnly('   ')).toThrow()
  })
})
