import request from 'supertest'
import { createApp } from '../app.js'
import { searchKnowledge } from '@plantbase/core'
import { getAccountBySessionToken } from '../lib/session-store.js'
import { SESSION_COOKIE_NAME } from '../middleware/session.js'

vi.mock('@plantbase/core', () => ({
  searchKnowledge: vi.fn(),
}))
vi.mock('../lib/session-store.js', () => ({
  getAccountBySessionToken: vi.fn(),
}))

describe('GET /debug/knowledge', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const response = await request(createApp()).get('/debug/knowledge?query=öntözés')

    expect(response.status).toBe(401)
  })

  it('returns the search result and trace when authenticated', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue({
      id: 1, fullName: 'X', salutation: 'X', email: 'x@example.com', role: 'customer',
    })
    vi.mocked(searchKnowledge).mockResolvedValue({
      result: { found: true, chunks: [] },
      trace: {
        query: 'öntözés', hydeText: 'x', candidateCount: 0,
        scores: [], selectedChunkIds: [], found: true,
      },
    })

    const response = await request(createApp())
      .get('/debug/knowledge?query=öntözés')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok123`])

    expect(response.status).toBe(200)
    expect(response.body.result.found).toBe(true)
    expect(searchKnowledge).toHaveBeenCalledWith('öntözés')
  })

  it('returns 400 when the query parameter is missing', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue({
      id: 1, fullName: 'X', salutation: 'X', email: 'x@example.com', role: 'customer',
    })

    const response = await request(createApp())
      .get('/debug/knowledge')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok123`])

    expect(response.status).toBe(400)
  })
})
