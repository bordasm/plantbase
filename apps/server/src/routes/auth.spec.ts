import request from 'supertest'
import { prisma } from '@plantbase/db'
import { createApp } from '../app.js'
import {
  createSession,
  deleteSession,
  getAccountBySessionToken,
} from '../lib/session-store.js'
import { SESSION_COOKIE_NAME } from '../middleware/session.js'

vi.mock('@plantbase/db', () => ({
  prisma: {
    account: { create: vi.fn(), findUnique: vi.fn() },
  },
}))
vi.mock('../lib/session-store.js', () => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getAccountBySessionToken: vi.fn(),
}))

describe('POST /api/auth/register', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a customer account and sets the session cookie', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.account.create).mockResolvedValue({
      id: 1,
      fullName: 'Kovács Béla',
      salutation: 'Béla',
      email: 'bela@example.com',
      role: 'customer',
    } as never)
    vi.mocked(createSession).mockResolvedValue({
      token: 'tok123',
      expiresAt: new Date(Date.now() + 1000),
    })

    const response = await request(createApp())
      .post('/api/auth/register')
      .send({
        fullName: 'Kovács Béla',
        salutation: 'Béla',
        email: 'bela@example.com',
        password: 'Abcdef12',
        passwordConfirm: 'Abcdef12',
      })

    expect(response.status).toBe(201)
    expect(response.body).toEqual({
      id: 1,
      fullName: 'Kovács Béla',
      salutation: 'Béla',
      email: 'bela@example.com',
      role: 'customer',
    })
    expect(response.headers['set-cookie'][0]).toContain(SESSION_COOKIE_NAME)
  })

  it('rejects when the two passwords do not match', async () => {
    const response = await request(createApp())
      .post('/api/auth/register')
      .send({
        fullName: 'X',
        salutation: 'X',
        email: 'x@example.com',
        password: 'Abcdef12',
        passwordConfirm: 'Abcdef13',
      })

    expect(response.status).toBe(400)
  })

  it('rejects a weak password', async () => {
    const response = await request(createApp())
      .post('/api/auth/register')
      .send({
        fullName: 'X',
        salutation: 'X',
        email: 'x@example.com',
        password: 'weak',
        passwordConfirm: 'weak',
      })

    expect(response.status).toBe(400)
  })

  it('returns 409 when the email is already registered', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue({ id: 1 } as never)

    const response = await request(createApp())
      .post('/api/auth/register')
      .send({
        fullName: 'X',
        salutation: 'X',
        email: 'bela@example.com',
        password: 'Abcdef12',
        passwordConfirm: 'Abcdef12',
      })

    expect(response.status).toBe(409)
  })
})

describe('POST /api/auth/login', () => {
  beforeEach(() => vi.clearAllMocks())

  it('logs in with correct credentials and sets the session cookie', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue({
      id: 1,
      fullName: 'Kovács Béla',
      salutation: 'Béla',
      email: 'bela@example.com',
      role: 'customer',
      passwordHash: await (
        await import('../lib/password.js')
      ).hashPassword('Abcdef12'),
    } as never)
    vi.mocked(createSession).mockResolvedValue({
      token: 'tok123',
      expiresAt: new Date(Date.now() + 1000),
    })

    const response = await request(createApp())
      .post('/api/auth/login')
      .send({ email: 'bela@example.com', password: 'Abcdef12' })

    expect(response.status).toBe(200)
    expect(response.headers['set-cookie'][0]).toContain(SESSION_COOKIE_NAME)
  })

  it('returns 401 with a generic message for a wrong password', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue({
      id: 1,
      passwordHash: await (
        await import('../lib/password.js')
      ).hashPassword('Abcdef12'),
    } as never)

    const response = await request(createApp())
      .post('/api/auth/login')
      .send({ email: 'bela@example.com', password: 'wrongPass1' })

    expect(response.status).toBe(401)
    expect(response.body).toEqual({ error: 'Hibás e-mail vagy jelszó.' })
  })

  it('returns 401 with the same generic message for an unknown email', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue(null)

    const response = await request(createApp())
      .post('/api/auth/login')
      .send({ email: 'unknown@example.com', password: 'Abcdef12' })

    expect(response.status).toBe(401)
    expect(response.body).toEqual({ error: 'Hibás e-mail vagy jelszó.' })
  })

  it('returns 401 with the same generic message for an anonymized account', async () => {
    vi.mocked(prisma.account.findUnique).mockResolvedValue({
      id: 1,
      passwordHash: await (
        await import('../lib/password.js')
      ).hashPassword('Abcdef12'),
      anonymizedAt: new Date('2026-08-01'),
    } as never)

    const response = await request(createApp())
      .post('/api/auth/login')
      .send({ email: 'bela@example.com', password: 'Abcdef12' })

    expect(response.status).toBe(401)
    expect(response.body).toEqual({ error: 'Hibás e-mail vagy jelszó.' })
  })
})

describe('POST /api/auth/logout', () => {
  it('deletes the session and clears the cookie', async () => {
    const response = await request(createApp())
      .post('/api/auth/logout')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok123`])

    expect(response.status).toBe(204)
    expect(deleteSession).toHaveBeenCalledWith('tok123')
  })
})

describe('GET /api/auth/me', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const response = await request(createApp()).get('/api/auth/me')

    expect(response.status).toBe(401)
  })

  it('returns the account when authenticated', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue({
      id: 1,
      fullName: 'Kovács Béla',
      salutation: 'Béla',
      email: 'bela@example.com',
      role: 'customer',
    })

    const response = await request(createApp())
      .get('/api/auth/me')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok123`])

    expect(response.status).toBe(200)
    expect(response.body.email).toBe('bela@example.com')
  })
})
