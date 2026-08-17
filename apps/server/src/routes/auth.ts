import { Router, type Request, type Response } from 'express'
import { z } from 'zod'
import { prisma } from '@plantbase/db'
import {
  PasswordSchema,
  hashPassword,
  verifyPassword,
} from '../lib/password.js'
import { createSession, deleteSession } from '../lib/session-store.js'
import { SESSION_COOKIE_NAME } from '../middleware/session.js'
import { requireAccount } from '../middleware/session.js'

const RegisterSchema = z
  .object({
    fullName: z.string().trim().min(1, 'A teljes név megadása kötelező.'),
    salutation: z.string().trim().min(1, 'A megszólítás megadása kötelező.'),
    email: z.string().trim().email('Érvénytelen e-mail cím.'),
    password: PasswordSchema,
    passwordConfirm: z.string(),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: 'A két jelszó nem egyezik.',
    path: ['passwordConfirm'],
  })

const LoginSchema = z.object({
  email: z.string().trim().email('Érvénytelen e-mail cím.'),
  password: z.string().min(1, 'A jelszó megadása kötelező.'),
})

const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: false,
}

export const authRouter: Router = Router()

authRouter.post('/api/auth/register', async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  const { fullName, salutation, email, password } = parsed.data

  const existing = await prisma.account.findUnique({ where: { email } })
  if (existing) {
    res.status(409).json({ error: 'Ez az e-mail cím már regisztrálva van.' })
    return
  }

  const passwordHash = await hashPassword(password)
  const account = await prisma.account.create({
    data: { fullName, salutation, email, passwordHash, role: 'customer' },
  })

  const { token, expiresAt } = await createSession(account.id)
  res.cookie(SESSION_COOKIE_NAME, token, {
    ...SESSION_COOKIE_OPTIONS,
    expires: expiresAt,
  })
  res.status(201).json({
    id: account.id,
    fullName: account.fullName,
    salutation: account.salutation,
    email: account.email,
    role: account.role,
  })
})

authRouter.post('/api/auth/login', async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  const { email, password } = parsed.data

  const account = await prisma.account.findUnique({ where: { email } })
  if (!account || !(await verifyPassword(password, account.passwordHash))) {
    res.status(401).json({ error: 'Hibás e-mail vagy jelszó.' })
    return
  }

  const { token, expiresAt } = await createSession(account.id)
  res.cookie(SESSION_COOKIE_NAME, token, {
    ...SESSION_COOKIE_OPTIONS,
    expires: expiresAt,
  })
  res.status(200).json({
    id: account.id,
    fullName: account.fullName,
    salutation: account.salutation,
    email: account.email,
    role: account.role,
  })
})

authRouter.post('/api/auth/logout', async (req, res) => {
  const token = req.cookies?.[SESSION_COOKIE_NAME]
  if (typeof token === 'string') await deleteSession(token)
  res.clearCookie(SESSION_COOKIE_NAME)
  res.status(204).send()
})

authRouter.get(
  '/api/auth/me',
  requireAccount,
  (req: Request, res: Response) => {
    res.status(200).json(req.account)
  },
)
