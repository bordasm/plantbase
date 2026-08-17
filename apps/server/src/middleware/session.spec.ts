import type { Request, Response } from 'express'
import { attachAccount, requireAccount, SESSION_COOKIE_NAME } from './session.js'
import { getAccountBySessionToken } from '../lib/session-store.js'

vi.mock('../lib/session-store.js', () => ({
  getAccountBySessionToken: vi.fn(),
}))

function mockReqRes(cookies: Record<string, string> = {}) {
  const req = { cookies, account: undefined } as unknown as Request & {
    account?: unknown
  }
  const json = vi.fn()
  const status = vi.fn().mockReturnValue({ json })
  const res = { status } as unknown as Response
  const next = vi.fn()
  return { req, res, next, json, status }
}

describe('attachAccount', () => {
  beforeEach(() => vi.clearAllMocks())

  it('attaches the account to the request when the cookie is a valid session', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue({
      id: 1,
      fullName: 'X',
      salutation: 'X',
      email: 'x@example.com',
      role: 'customer',
    })
    const { req, res, next } = mockReqRes({ [SESSION_COOKIE_NAME]: 'tok' })

    await attachAccount(req, res, next)

    expect(req.account).toEqual({
      id: 1,
      fullName: 'X',
      salutation: 'X',
      email: 'x@example.com',
      role: 'customer',
    })
    expect(next).toHaveBeenCalledOnce()
  })

  it('leaves the account undefined and still calls next when there is no cookie', async () => {
    const { req, res, next } = mockReqRes()

    await attachAccount(req, res, next)

    expect(req.account).toBeUndefined()
    expect(next).toHaveBeenCalledOnce()
  })
})

describe('requireAccount', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls next when req.account is set', () => {
    const { req, res, next } = mockReqRes()
    ;(req as unknown as { account: unknown }).account = { id: 1 }

    requireAccount(req, res, next)

    expect(next).toHaveBeenCalledOnce()
  })

  it('responds 401 when req.account is missing', () => {
    const { req, res, next, status, json } = mockReqRes()

    requireAccount(req, res, next)

    expect(status).toHaveBeenCalledWith(401)
    expect(json).toHaveBeenCalledWith({ error: 'Bejelentkezés szükséges.' })
    expect(next).not.toHaveBeenCalled()
  })
})
