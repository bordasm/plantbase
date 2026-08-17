import type { NextFunction, Request, Response } from 'express'
import {
  getAccountBySessionToken,
  type SessionAccount,
} from '../lib/session-store.js'

export const SESSION_COOKIE_NAME =
  process.env.SESSION_COOKIE_NAME ?? 'plantbase_session'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- required: this is TypeScript's ambient global-augmentation pattern for extending Express's Request type, there is no ES2015-module equivalent for it.
  namespace Express {
    interface Request {
      account?: SessionAccount
    }
  }
}

export async function attachAccount(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE_NAME]
  if (typeof token === 'string') {
    const account = await getAccountBySessionToken(token)
    if (account) req.account = account
  }
  next()
}

export function requireAccount(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.account) {
    res.status(401).json({ error: 'Bejelentkezés szükséges.' })
    return
  }
  next()
}
