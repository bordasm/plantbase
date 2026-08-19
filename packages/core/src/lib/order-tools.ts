import { tool, type ToolSet } from 'ai'
import { z } from 'zod'

export interface CreateOrderInput {
  orderDesc?: string
  price?: number
  email: boolean
  category?: string
  location?: string
  light?: string
  watering?: string
  currentHeightCm?: number
  maxHeightCm?: number
  currentPotCm?: number
  petSafe?: boolean
  kidSafe?: boolean
  airPurifying?: boolean
}

export interface OrderSummary {
  orderId: number
  status: string
  orderDesc: string | null
  price: number | null
  payed: boolean
  email: boolean
  createdAt: string
}

export interface OrderActions {
  createOrder(input: CreateOrderInput): Promise<{ orderId: number }>
  cancelOrder(
    orderId: number,
  ): Promise<{ ok: true } | { ok: false; reason: string }>
  listMyOrders(
    scope: 'all' | 'active',
  ): Promise<{ orders: OrderSummary[]; tooMany: boolean }>
  getOrderByNumber(orderId: number): Promise<OrderSummary | null>
}

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

const CreateOrderInputSchema = z.object({
  orderDesc: z
    .string()
    .optional()
    .describe('Rövid, emberi olvasásra szánt összegzés a rendelésről.'),
  price: z.number().optional().describe('A megbeszélt teljes ár (HUF).'),
  email: z
    .boolean()
    .describe(
      'Kér-e e-mail-értesítést a rendelésről az ügyfél — ezt MINDIG meg kell kérdezni létrehozás előtt.',
    ),
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

export function buildOrderTools(actions: OrderActions): ToolSet {
  return {
    createOrder: tool({
      description:
        'Új rendelés létrehozása a bejelentkezett ügyfél nevében. Csak azután hívd, hogy az ügyfél megerősítette, hogy rendelést szeretne indítani, ÉS megválaszolta, kér-e e-mail-értesítést.',
      inputSchema: CreateOrderInputSchema,
      execute: async (input) => actions.createOrder(input),
    }),
    cancelOrder: tool({
      description:
        'A bejelentkezett ügyfél saját, még nem teljesített/lemondott rendelésének lemondása.',
      inputSchema: z.object({
        orderId: z.number().describe('A lemondandó rendelés száma.'),
      }),
      execute: async ({ orderId }: { orderId: number }) =>
        actions.cancelOrder(orderId),
    }),
    listMyOrders: tool({
      description:
        'A bejelentkezett ügyfél rendeléseinek listázása. "all": az összes (max 5), "active": csak az aktív (új/folyamatban) rendelések (max 5).',
      inputSchema: z.object({
        scope: z.enum(['all', 'active']),
      }),
      execute: async ({ scope }: { scope: 'all' | 'active' }) =>
        actions.listMyOrders(scope),
    }),
    getOrderByNumber: tool({
      description:
        'A bejelentkezett ügyfél egy adott számú saját rendelésének lekérdezése.',
      inputSchema: z.object({
        orderId: z.number().describe('A lekérdezendő rendelés száma.'),
      }),
      execute: async ({ orderId }: { orderId: number }) =>
        actions.getOrderByNumber(orderId),
    }),
  }
}
