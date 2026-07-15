import pg from 'pg'

vi.mock('pg', () => ({
  default: { Pool: vi.fn() },
}))

describe('getReadOnlyPool', () => {
  const originalConnectionString = process.env.DATABASE_URL_READONLY

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  afterEach(() => {
    process.env.DATABASE_URL_READONLY = originalConnectionString
  })

  it('creates a Pool using DATABASE_URL_READONLY as the connection string', async () => {
    process.env.DATABASE_URL_READONLY = 'postgres://ro@localhost/plantbase'
    const { getReadOnlyPool } = await import('./db-pool.js')

    getReadOnlyPool()

    expect(vi.mocked(pg.Pool)).toHaveBeenCalledWith({
      connectionString: 'postgres://ro@localhost/plantbase',
    })
  })

  it('reuses the same pool instance on subsequent calls instead of reconnecting', async () => {
    const { getReadOnlyPool } = await import('./db-pool.js')

    const first = getReadOnlyPool()
    const second = getReadOnlyPool()

    expect(second).toBe(first)
    expect(vi.mocked(pg.Pool)).toHaveBeenCalledTimes(1)
  })
})
