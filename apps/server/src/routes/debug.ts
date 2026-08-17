import { Router } from 'express'
import { z } from 'zod'
import { searchKnowledge } from '@plantbase/core'
import { requireAccount } from '../middleware/session.js'

const QuerySchema = z.object({
  query: z.string().trim().min(1, 'A query paraméter kötelező.'),
})

export const debugRouter: Router = Router()

debugRouter.get('/debug/knowledge', requireAccount, async (req, res) => {
  const parsed = QuerySchema.safeParse(req.query)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message })
    return
  }
  const output = await searchKnowledge(parsed.data.query)
  res.status(200).json(output)
})
