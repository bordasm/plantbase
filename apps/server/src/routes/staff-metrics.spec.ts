import request from 'supertest'
import { createApp } from '../app.js'
import { getAccountBySessionToken } from '../lib/session-store.js'
import { SESSION_COOKIE_NAME } from '../middleware/session.js'
import { computeMetrics } from '../lib/metrics-store.js'

vi.mock('../lib/session-store.js', () => ({
  getAccountBySessionToken: vi.fn(),
}))
vi.mock('@plantbase/core', () => ({
  streamAgentResponse: vi.fn(),
  searchKnowledge: vi.fn(),
}))
vi.mock('../lib/metrics-store.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/metrics-store.js')>()
  return {
    ...actual,
    computeMetrics: vi.fn(),
  }
})

const CUSTOMER_ACCOUNT = {
  id: 1,
  fullName: 'X',
  salutation: 'X',
  email: 'x@example.com',
  role: 'customer',
}
const STAFF_ACCOUNT = {
  id: 2,
  fullName: 'Y',
  salutation: 'Y',
  email: 'y@example.com',
  role: 'staff',
}

describe('GET /api/staff/metrics', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const response = await request(createApp()).get('/api/staff/metrics')
    expect(response.status).toBe(401)
  })

  it('returns 403 for a customer account', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(CUSTOMER_ACCOUNT)
    const response = await request(createApp())
      .get('/api/staff/metrics')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
    expect(response.status).toBe(403)
  })

  it('returns metrics for a staff account', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(STAFF_ACCOUNT)
    vi.mocked(computeMetrics).mockResolvedValue({
      outOfHours: { count: 5, total: 100, percentage: 5 },
      escalationRate: { count: 10, total: 100, percentage: 10 },
      totalOrders: 90,
      totalEscalations: 10,
    })
    const response = await request(createApp())
      .get('/api/staff/metrics')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
    expect(response.status).toBe(200)
    expect(response.body).toEqual({
      outOfHours: { count: 5, total: 100, percentage: 5 },
      escalationRate: { count: 10, total: 100, percentage: 10 },
      totalOrders: 90,
      totalEscalations: 10,
    })
  })
})
