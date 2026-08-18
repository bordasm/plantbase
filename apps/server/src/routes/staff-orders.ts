import { Router } from 'express'
import { z } from 'zod'
import { requireAccount } from '../middleware/session.js'
import { requireRole } from '../middleware/role.js'
import {
  listOrdersForStaff,
  getOrderForStaff,
  updateOrderStatus,
  correctOrder,
} from '../lib/orders-store.js'

const STATUS_VALUES = ['új', 'folyamatban', 'lemondva', 'teljesítve'] as const
const CATEGORY_VALUES = [
  'szobanövény',
  'kerti',
  'pozsgás',
  'kaktusz',
  'fűszer',
  'fa-cserje',
  'lógó',
  'virágzó',
] as const
const LOCATION_VALUES = ['beltéri', 'kültéri', 'mindkettő'] as const
const LIGHT_VALUES = [
  'árnyék',
  'alacsony',
  'közepes',
  'erős',
  'direkt nap',
] as const
const WATERING_VALUES = [
  'ritka',
  'közepes',
  'gyakori',
  'állandóan nedves',
] as const

const StatusUpdateSchema = z.object({
  status: z.enum(STATUS_VALUES).optional(),
  payed: z.boolean().optional(),
})

const OrderCorrectionSchema = z.object({
  orderDesc: z.string().optional(),
  price: z.number().optional(),
  category: z.enum(CATEGORY_VALUES).optional(),
  location: z.enum(LOCATION_VALUES).optional(),
  light: z.enum(LIGHT_VALUES).optional(),
  watering: z.enum(WATERING_VALUES).optional(),
  currentHeightCm: z.number().optional(),
  maxHeightCm: z.number().optional(),
  currentPotCm: z.number().optional(),
  petSafe: z.boolean().optional(),
  kidSafe: z.boolean().optional(),
  airPurifying: z.boolean().optional(),
})

function parseOrderId(raw: unknown): number | null {
  if (typeof raw !== 'string') return null
  const orderId = Number(raw)
  return Number.isInteger(orderId) ? orderId : null
}

export const staffOrdersRouter: Router = Router()

staffOrdersRouter.get(
  '/api/staff/orders',
  requireAccount,
  requireRole('staff', 'admin'),
  async (req, res) => {
    const status =
      typeof req.query.status === 'string' ? req.query.status : undefined
    const orders = await listOrdersForStaff(status)
    res.status(200).json({ orders })
  },
)

staffOrdersRouter.get(
  '/api/staff/orders/:id',
  requireAccount,
  requireRole('staff', 'admin'),
  async (req, res) => {
    const orderId = parseOrderId(req.params.id)
    if (orderId === null) {
      res.status(400).json({ error: 'Érvénytelen rendelésszám.' })
      return
    }
    const result = await getOrderForStaff(orderId)
    if (!result) {
      res.status(404).json({ error: 'Nem található ilyen rendelés.' })
      return
    }
    res.status(200).json(result)
  },
)

staffOrdersRouter.patch(
  '/api/staff/orders/:id/status',
  requireAccount,
  requireRole('staff', 'admin'),
  async (req, res) => {
    const orderId = parseOrderId(req.params.id)
    if (orderId === null) {
      res.status(400).json({ error: 'Érvénytelen rendelésszám.' })
      return
    }
    const parsed = StatusUpdateSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message })
      return
    }
    // requireAccount + requireRole már biztosította, hogy req.account létezik.
    const updated = await updateOrderStatus(
      req.account!.id,
      orderId,
      parsed.data,
    )
    if (!updated) {
      res.status(404).json({ error: 'Nem található ilyen rendelés.' })
      return
    }
    res.status(200).json(updated)
  },
)

staffOrdersRouter.patch(
  '/api/staff/orders/:id',
  requireAccount,
  requireRole('staff', 'admin'),
  async (req, res) => {
    const orderId = parseOrderId(req.params.id)
    if (orderId === null) {
      res.status(400).json({ error: 'Érvénytelen rendelésszám.' })
      return
    }
    const parsed = OrderCorrectionSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message })
      return
    }
    const updated = await correctOrder(req.account!.id, orderId, parsed.data)
    if (!updated) {
      res.status(404).json({ error: 'Nem található ilyen rendelés.' })
      return
    }
    res.status(200).json(updated)
  },
)
