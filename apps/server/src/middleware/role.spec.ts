import type { Request, Response } from 'express'
import { requireRole } from './role.js'

function mockReqRes(account?: { role: string }) {
  const req = { account } as unknown as Request
  const json = vi.fn()
  const status = vi.fn().mockReturnValue({ json })
  const res = { status } as unknown as Response
  const next = vi.fn()
  return { req, res, next, json, status }
}

describe('requireRole', () => {
  it('calls next when the account has one of the allowed roles', () => {
    const { req, res, next } = mockReqRes({ role: 'staff' })

    requireRole('staff', 'admin')(req, res, next)

    expect(next).toHaveBeenCalledOnce()
  })

  it('responds 403 when the account role is not allowed', () => {
    const { req, res, next, status, json } = mockReqRes({ role: 'customer' })

    requireRole('staff', 'admin')(req, res, next)

    expect(status).toHaveBeenCalledWith(403)
    expect(json).toHaveBeenCalledWith({
      error: 'Nincs jogosultságod ehhez a művelethez.',
    })
    expect(next).not.toHaveBeenCalled()
  })

  it('responds 403 when there is no account at all', () => {
    const { req, res, next, status } = mockReqRes(undefined)

    requireRole('staff', 'admin')(req, res, next)

    expect(status).toHaveBeenCalledWith(403)
    expect(next).not.toHaveBeenCalled()
  })
})
