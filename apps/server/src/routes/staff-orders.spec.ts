import request from 'supertest'
import { createApp } from '../app.js'
import { getAccountBySessionToken } from '../lib/session-store.js'
import { SESSION_COOKIE_NAME } from '../middleware/session.js'
import {
  listOrdersForStaff,
  getOrderForStaff,
  updateOrderStatus,
  correctOrder,
} from '../lib/orders-store.js'

vi.mock('../lib/session-store.js', () => ({
  getAccountBySessionToken: vi.fn(),
}))
vi.mock('@plantbase/core', () => ({
  streamAgentResponse: vi.fn(),
  searchKnowledge: vi.fn(),
}))
vi.mock('../lib/orders-store.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/orders-store.js')>()
  return {
    ...actual,
    listOrdersForStaff: vi.fn(),
    getOrderForStaff: vi.fn(),
    updateOrderStatus: vi.fn(),
    correctOrder: vi.fn(),
    buildOrderActionsForAccount: vi.fn(),
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

describe('GET /api/staff/orders', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const response = await request(createApp()).get('/api/staff/orders')
    expect(response.status).toBe(401)
  })

  it('returns 403 for a customer account', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(CUSTOMER_ACCOUNT)
    const response = await request(createApp())
      .get('/api/staff/orders')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
    expect(response.status).toBe(403)
  })

  it('returns the order list for a staff account', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(STAFF_ACCOUNT)
    vi.mocked(listOrdersForStaff).mockResolvedValue([])
    const response = await request(createApp())
      .get('/api/staff/orders')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ orders: [] })
  })

  it('passes the status query parameter through to the store', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(STAFF_ACCOUNT)
    vi.mocked(listOrdersForStaff).mockResolvedValue([])
    await request(createApp())
      .get('/api/staff/orders?status=teljesítve')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
    expect(listOrdersForStaff).toHaveBeenCalledWith('teljesítve')
  })
})

describe('GET /api/staff/orders/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404 for a nonexistent order', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(STAFF_ACCOUNT)
    vi.mocked(getOrderForStaff).mockResolvedValue(null)
    const response = await request(createApp())
      .get('/api/staff/orders/999')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
    expect(response.status).toBe(404)
  })

  it('returns the order and audit log for a staff account', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(STAFF_ACCOUNT)
    vi.mocked(getOrderForStaff).mockResolvedValue({
      order: { orderId: 1 } as never,
      auditLog: [],
    })
    const response = await request(createApp())
      .get('/api/staff/orders/1')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
    expect(response.status).toBe(200)
  })
})

describe('PATCH /api/staff/orders/:id/status', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 for a customer account', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(CUSTOMER_ACCOUNT)
    const response = await request(createApp())
      .patch('/api/staff/orders/1/status')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
      .send({ status: 'teljesítve' })
    expect(response.status).toBe(403)
  })

  it('returns 400 for an invalid status value', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(STAFF_ACCOUNT)
    const response = await request(createApp())
      .patch('/api/staff/orders/1/status')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
      .send({ status: 'nemletezo' })
    expect(response.status).toBe(400)
  })

  it('updates status for a staff account', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(STAFF_ACCOUNT)
    vi.mocked(updateOrderStatus).mockResolvedValue({ orderId: 1, status: 'teljesítve' } as never)
    const response = await request(createApp())
      .patch('/api/staff/orders/1/status')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
      .send({ status: 'teljesítve', payed: true })
    expect(response.status).toBe(200)
    expect(updateOrderStatus).toHaveBeenCalledWith(2, 1, { status: 'teljesítve', payed: true })
  })
})

describe('PATCH /api/staff/orders/:id', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 for a customer account', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(CUSTOMER_ACCOUNT)
    const response = await request(createApp())
      .patch('/api/staff/orders/1')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
      .send({ orderDesc: 'Javítás' })
    expect(response.status).toBe(403)
  })

  it('corrects a field for a staff account', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue(STAFF_ACCOUNT)
    vi.mocked(correctOrder).mockResolvedValue({ orderId: 1, orderDesc: 'Javítás' } as never)
    const response = await request(createApp())
      .patch('/api/staff/orders/1')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok`])
      .send({ orderDesc: 'Javítás' })
    expect(response.status).toBe(200)
    expect(correctOrder).toHaveBeenCalledWith(2, 1, { orderDesc: 'Javítás' })
  })
})
