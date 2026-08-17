import { Router } from 'express'
import { z } from 'zod'
import { streamAgentResponse } from '@plantbase/core'
import { convertToModelMessages, type UIMessage } from 'ai'
import { requireAccount } from '../middleware/session.js'

const ChatRequestSchema = z.object({
  messages: z.array(z.unknown()),
})

export const chatRouter: Router = Router()

chatRouter.post('/api/chat', requireAccount, async (req, res) => {
  const parsed = ChatRequestSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Érvénytelen kérés.' })
    return
  }

  const uiMessages = parsed.data.messages as UIMessage[]
  const modelMessages = await convertToModelMessages(uiMessages)
  const { stream } = streamAgentResponse(modelMessages, {
    salutation: req.account?.salutation,
  })
  stream.pipeUIMessageStreamToResponse(res)
})
