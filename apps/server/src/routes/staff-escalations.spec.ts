import request from 'supertest'
import { createApp } from '../app.js'
import { getAccountBySessionToken } from '../lib/session-store.js'
import { SESSION_COOKIE_NAME } from '../middleware/session.js'
import { listEscalationsForStaff } from '../lib/escalations-store.js'

vi.mock('../lib/session-store.js', () => ({
  getAccountBySessionToken: vi.fn(),
}))
vi.mock('@plantbase/core', () => ({
  streamAgentResponse: vi.fn(),
  searchKnowledge: vi.fn(),
}))
vi.mock('../lib/escalations-store.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/escalations-store.js')>()
  return {
    ...actual,
    listEscalationsForStaff: vi.fn(),
    buildEscalationActionsForAccount: vi.fn(),
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

describe('GET /api/staff/escalations', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const response = await request(createApp()).get('/api/staff/escalations')
    expect(response.status).toBe(401)
  })

  it('returns 403 for a customer account', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(CUSTOMER_ACCOUNT)
    const response = await request(createApp())
      .get('/api/staff/escalations')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
    expect(response.status).toBe(403)
  })

  it('returns the escalation list for a staff account', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(STAFF_ACCOUNT)
    vi.mocked(listEscalationsForStaff).mockResolvedValue([])
    const response = await request(createApp())
      .get('/api/staff/escalations')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ escalations: [] })
  })
})
