import { Router } from 'express'
import { z } from 'zod'
import { streamAgentResponse } from '@plantbase/core'
import { convertToModelMessages, type UIMessage } from 'ai'
import { requireAccount } from '../middleware/session.js'
import { buildOrderActionsForAccount } from '../lib/orders-store.js'
import { buildEscalationActionsForAccount } from '../lib/escalations-store.js'

const ChatRequestSchema = z.object({
  messages: z.array(z.unknown()),
})

export const chatRouter: Router = Router()

chatRouter.post('/api/chat', requireAccount, async (req, res, next) => {
  const parsed = ChatRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Érvénytelen kérés.' })
    return
  }

  const uiMessages = parsed.data.messages as UIMessage[]
  const modelMessages = await convertToModelMessages(uiMessages)
  const { stream } = streamAgentResponse(modelMessages, {
    salutation: req.account?.salutation,
    orderActions: req.account
      ? buildOrderActionsForAccount(req.account.id)
      : undefined,
    escalationActions: req.account
      ? buildEscalationActionsForAccount(req.account.id)
      : undefined,
  })
  // A `pipeUIMessageStreamToResponse` Promise<void>-ot ad vissza (és az
  // `ai@7.0.66`-ban @deprecated, a következő major verzióban eltávolítják).
  // Ha a promise elutasul és ez kezeletlen marad, Node alapértelmezett
  // `--unhandled-rejections=throw` beállítása az EGÉSZ szervert leállítja,
  // nem csak ezt a kérést — ezért a `next`-nek adjuk a hibát, hogy a
  // globális `errorHandler` (app.ts) kezelje.
  void stream.pipeUIMessageStreamToResponse(res).catch(next)
})
