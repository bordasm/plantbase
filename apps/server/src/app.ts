import express, { type Express } from 'express'
import cookieParser from 'cookie-parser'
import { attachAccount } from './middleware/session.js'
import { authRouter } from './routes/auth.js'

export function createApp(): Express {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use(attachAccount)
  app.use(authRouter)

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  return app
}
