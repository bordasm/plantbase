import request from 'supertest'
import { createApp } from '../app.js'
import { getAccountBySessionToken } from '../lib/session-store.js'
import { SESSION_COOKIE_NAME } from '../middleware/session.js'
import { anonymizeAccount, listAccountsForStaff } from '../lib/accounts-store.js'

vi.mock('../lib/session-store.js', () => ({
  getAccountBySessionToken: vi.fn(),
}))
vi.mock('@plantbase/core', () => ({
  streamAgentResponse: vi.fn(),
  searchKnowledge: vi.fn(),
}))
vi.mock('../lib/accounts-store.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../lib/accounts-store.js')>()
  return {
    ...actual,
    anonymizeAccount: vi.fn(),
    listAccountsForStaff: vi.fn(),
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

describe('GET /api/staff/accounts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const response = await request(createApp()).get('/api/staff/accounts')
    expect(response.status).toBe(401)
  })

  it('returns 403 for a customer account', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(CUSTOMER_ACCOUNT)
    const response = await request(createApp())
      .get('/api/staff/accounts')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
    expect(response.status).toBe(403)
  })

  it('returns the account list for a staff account', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(STAFF_ACCOUNT)
    vi.mocked(listAccountsForStaff).mockResolvedValue([])
    const response = await request(createApp())
      .get('/api/staff/accounts')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ accounts: [] })
  })
})

describe('POST /api/staff/accounts/:id/anonymize', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const response = await request(createApp()).post(
      '/api/staff/accounts/1/anonymize',
    )
    expect(response.status).toBe(401)
  })

  it('returns 403 for a customer account', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(CUSTOMER_ACCOUNT)
    const response = await request(createApp())
      .post('/api/staff/accounts/1/anonymize')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
    expect(response.status).toBe(403)
  })

  it('returns 400 for an invalid account id', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(STAFF_ACCOUNT)
    const response = await request(createApp())
      .post('/api/staff/accounts/not-a-number/anonymize')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
    expect(response.status).toBe(400)
  })

  it('returns 404 when the store reports not_found', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(STAFF_ACCOUNT)
    vi.mocked(anonymizeAccount).mockResolvedValue('not_found')
    const response = await request(createApp())
      .post('/api/staff/accounts/999/anonymize')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
    expect(response.status).toBe(404)
  })

  it('returns 409 when the store reports already_anonymized', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(STAFF_ACCOUNT)
    vi.mocked(anonymizeAccount).mockResolvedValue('already_anonymized')
    const response = await request(createApp())
      .post('/api/staff/accounts/1/anonymize')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
    expect(response.status).toBe(409)
  })

  it('returns 200 with ok:true on success', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(STAFF_ACCOUNT)
    vi.mocked(anonymizeAccount).mockResolvedValue('ok')
    const response = await request(createApp())
      .post('/api/staff/accounts/1/anonymize')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true })
    expect(anonymizeAccount).toHaveBeenCalledWith(1)
  })
})
