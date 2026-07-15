import { getReadOnlyPool } from './db-pool.js'
import { listCategories } from './list-categories.js'

vi.mock('./db-pool.js', () => ({
  getReadOnlyPool: vi.fn(),
}))

describe('listCategories', () => {
  it('returns the categories from the query result rows', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ category: 'Szobanövény' }, { category: 'Fűszernövény' }],
    })
    vi.mocked(getReadOnlyPool).mockReturnValue({ query } as never)

    const result = await listCategories()

    expect(result).toEqual(['Szobanövény', 'Fűszernövény'])
  })

  it('queries a distinct, ordered list of categories', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    vi.mocked(getReadOnlyPool).mockReturnValue({ query } as never)

    await listCategories()

    expect(query).toHaveBeenCalledWith(
      'SELECT DISTINCT category FROM products ORDER BY category',
    )
  })

  it('returns an empty array when there are no categories', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] })
    vi.mocked(getReadOnlyPool).mockReturnValue({ query } as never)

    const result = await listCategories()

    expect(result).toEqual([])
  })
})
