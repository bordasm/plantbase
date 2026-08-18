import type { NextFunction, Request, Response } from 'express'

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.account || !roles.includes(req.account.role)) {
      res.status(403).json({ error: 'Nincs jogosultságod ehhez a művelethez.' })
      return
    }
    next()
  }
}
