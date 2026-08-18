import { Prisma, prisma } from '@plantbase/db'
import type {
  CreateOrderInput,
  OrderActions,
  OrderSummary,
} from '@plantbase/core'

const MAX_LIST_RESULTS = 5
const CANCELLABLE_STATUSES = ['új', 'folyamatban']

interface OrderRow {
  orderId: number
  accountId: number
  status: string
  orderDesc: string | null
  price: unknown
  payed: boolean
  email: boolean
  category: string | null
  location: string | null
  light: string | null
  watering: string | null
  currentHeightCm: number | null
  maxHeightCm: number | null
  currentPotCm: number | null
  petSafe: boolean | null
  kidSafe: boolean | null
  airPurifying: boolean | null
  createdAt: Date
  updatedAt: Date
}

export interface StaffOrderDetail extends OrderSummary {
  accountId: number
  category: string | null
  location: string | null
  light: string | null
  watering: string | null
  currentHeightCm: number | null
  maxHeightCm: number | null
  currentPotCm: number | null
  petSafe: boolean | null
  kidSafe: boolean | null
  airPurifying: boolean | null
  updatedAt: string
}

export interface AuditEntry {
  id: number
  accountId: number
  action: string
  previousData: unknown
  newData: unknown
  createdAt: string
}

// Audit-log Json oszlopok csak sima, szerializálható értéket fogadnak el;
// az OrderRow-nak (pl. `price: unknown`, `createdAt: Date`) nincs index
// szignatúrája, ezért JSON-kör-úttal alakítjuk Prisma InputJsonValue-kompatibilis
// sima objektummá.
type JsonSnapshot =
  string | number | boolean | null | JsonSnapshot[] | JsonSnapshotObject
type JsonSnapshotObject = { [key: string]: JsonSnapshot }

function toJsonSnapshot(order: OrderRow): JsonSnapshotObject {
  return JSON.parse(JSON.stringify(order)) as JsonSnapshotObject
}

// Belső, nem exportált sentinel-hibák: a tranzakción belül dobjuk őket, hogy
// az üzletiszabály-ellenőrzés (pl. jogosultság, státusz) ugyanazt a sort
// lássa, amelyre az audit-napló previousData mezője is épül — ne külön,
// tranzakció előtti olvasásból. A hívó a catch ágban alakítja vissza a
// megszokott { ok: false, reason } / null visszatérési formára.
class OrderActionRefusal extends Error {
  constructor(public readonly reason: string) {
    super(reason)
  }
}

class OrderNotFoundForUpdate extends Error {}

const MAX_SERIALIZABLE_ATTEMPTS = 3

/**
 * READ COMMITTED alatt a tranzakción belüli olvasás sem teszi atomivá az
 * "olvas-ellenőriz-ír" hármast: a sorzár feloldása után a Postgres az UPDATE
 * feltételét (EvalPlanQual) az ÚJ sorverzióra futtatja újra, és mivel a
 * WHERE csak order_id-re szűr, az írás akkor is végigmegy, ha közben egy
 * párhuzamos tranzakció megváltoztatta a státuszt (pl. egy ügyfél lemondása
 * visszaírhatna egy időközben "teljesítve" rendelést "lemondva"-ra).
 * Serializable izoláció mellett a Postgres maga utasítja el az ütköző
 * tranzakciót (SQLSTATE 40001 -> Prisma P2034), amit itt korlátozott
 * számban újrapróbálunk.
 */
async function runSerializable<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: 'Serializable' })
    } catch (err) {
      const retryable =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2034'
      if (!retryable || attempt >= MAX_SERIALIZABLE_ATTEMPTS) throw err
    }
  }
}

/**
 * Igaz, ha a patch egyetlen mezője sem tér el a meglévő sor értékétől --
 * ilyenkor felesleges írni és audit-sort létrehozni (üres "mentés" gomb).
 */
function isNoOpPatch(
  existing: OrderRow,
  patch: Record<string, unknown>,
): boolean {
  const current = existing as unknown as Record<string, unknown>
  return Object.keys(patch).every((key) => {
    const before = current[key]
    const after = patch[key]
    if (before === after) return true
    // A price Prisma Decimal-ként jön vissza, a patch-ben viszont szám van --
    // referencia szerint sosem egyeznének, ezért numerikusan hasonlítjuk.
    if (typeof after === 'number' && before !== null && before !== undefined) {
      return Number(before) === after
    }
    return false
  })
}

function toSummary(order: OrderRow): OrderSummary {
  return {
    orderId: order.orderId,
    status: order.status,
    orderDesc: order.orderDesc,
    price: order.price === null ? null : Number(order.price),
    payed: order.payed,
    email: order.email,
    createdAt: order.createdAt.toISOString(),
  }
}

function toStaffDetail(order: OrderRow): StaffOrderDetail {
  return {
    ...toSummary(order),
    accountId: order.accountId,
    category: order.category,
    location: order.location,
    light: order.light,
    watering: order.watering,
    currentHeightCm: order.currentHeightCm,
    maxHeightCm: order.maxHeightCm,
    currentPotCm: order.currentPotCm,
    petSafe: order.petSafe,
    kidSafe: order.kidSafe,
    airPurifying: order.airPurifying,
    updatedAt: order.updatedAt.toISOString(),
  }
}

export function buildOrderActionsForAccount(accountId: number): OrderActions {
  return {
    async createOrder(input: CreateOrderInput) {
      const order = (await prisma.$transaction(async (tx) => {
        const created = await tx.order.create({
          data: {
            accountId,
            status: 'új',
            orderDesc: input.orderDesc ?? null,
            price: input.price ?? null,
            email: input.email,
            category: input.category ?? null,
            location: input.location ?? null,
            light: input.light ?? null,
            watering: input.watering ?? null,
            currentHeightCm: input.currentHeightCm ?? null,
            maxHeightCm: input.maxHeightCm ?? null,
            currentPotCm: input.currentPotCm ?? null,
            petSafe: input.petSafe ?? null,
            kidSafe: input.kidSafe ?? null,
            airPurifying: input.airPurifying ?? null,
          },
        })
        await tx.orderAuditLog.create({
          data: {
            orderId: created.orderId,
            accountId,
            action: 'created',
            newData: created,
          },
        })
        return created
      })) as OrderRow
      return { orderId: order.orderId }
    },

    async cancelOrder(orderId: number) {
      try {
        await runSerializable(async (tx) => {
          const existing = (await tx.order.findUnique({
            where: { orderId },
          })) as OrderRow | null
          if (!existing || existing.accountId !== accountId) {
            throw new OrderActionRefusal('Nem található ilyen rendelés.')
          }
          if (!CANCELLABLE_STATUSES.includes(existing.status)) {
            throw new OrderActionRefusal('Ez a rendelés már nem mondható le.')
          }
          const updated = await tx.order.update({
            where: { orderId },
            data: { status: 'lemondva' },
          })
          await tx.orderAuditLog.create({
            data: {
              orderId,
              accountId,
              action: 'cancelled',
              previousData: toJsonSnapshot(existing),
              newData: updated,
            },
          })
        })
        return { ok: true }
      } catch (err) {
        if (err instanceof OrderActionRefusal) {
          return { ok: false, reason: err.reason }
        }
        throw err
      }
    },

    async listMyOrders(scope: 'all' | 'active') {
      const where =
        scope === 'active'
          ? { accountId, status: { in: ['új', 'folyamatban'] } }
          : { accountId }
      const orders = (await prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: MAX_LIST_RESULTS + 1,
      })) as OrderRow[]
      const tooMany = orders.length > MAX_LIST_RESULTS
      return {
        orders: orders.slice(0, MAX_LIST_RESULTS).map(toSummary),
        tooMany,
      }
    },

    async getOrderByNumber(orderId: number) {
      const order = (await prisma.order.findUnique({
        where: { orderId },
      })) as OrderRow | null
      if (!order || order.accountId !== accountId) return null
      return toSummary(order)
    },
  }
}

export async function listOrdersForStaff(
  status?: string,
): Promise<StaffOrderDetail[]> {
  const orders = (await prisma.order.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: 50,
  })) as OrderRow[]
  return orders.map(toStaffDetail)
}

export async function getOrderForStaff(
  orderId: number,
): Promise<{ order: StaffOrderDetail; auditLog: AuditEntry[] } | null> {
  const order = (await prisma.order.findUnique({
    where: { orderId },
  })) as OrderRow | null
  if (!order) return null
  const auditLog = await prisma.orderAuditLog.findMany({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
  })
  return {
    order: toStaffDetail(order),
    auditLog: auditLog.map((entry) => ({
      id: entry.id,
      accountId: entry.accountId,
      action: entry.action,
      previousData: entry.previousData,
      newData: entry.newData,
      createdAt: entry.createdAt.toISOString(),
    })),
  }
}

export async function updateOrderStatus(
  actorAccountId: number,
  orderId: number,
  patch: { status?: string; payed?: boolean },
): Promise<StaffOrderDetail | null> {
  try {
    const updated = (await runSerializable(async (tx) => {
      const existing = (await tx.order.findUnique({
        where: { orderId },
      })) as OrderRow | null
      if (!existing) throw new OrderNotFoundForUpdate()
      // Üres mentés: nincs mit írni, és félrevezető audit-sort sem hagyunk.
      if (isNoOpPatch(existing, patch)) return existing
      const result = await tx.order.update({
        where: { orderId },
        data: patch,
      })
      await tx.orderAuditLog.create({
        data: {
          orderId,
          accountId: actorAccountId,
          action: 'status_changed',
          previousData: toJsonSnapshot(existing),
          newData: result,
        },
      })
      return result
    })) as OrderRow
    return toStaffDetail(updated)
  } catch (err) {
    if (err instanceof OrderNotFoundForUpdate) return null
    throw err
  }
}

export async function correctOrder(
  actorAccountId: number,
  orderId: number,
  patch: Record<string, unknown>,
): Promise<StaffOrderDetail | null> {
  try {
    const updated = (await runSerializable(async (tx) => {
      const existing = (await tx.order.findUnique({
        where: { orderId },
      })) as OrderRow | null
      if (!existing) throw new OrderNotFoundForUpdate()
      // Üres mentés: nincs mit írni, és félrevezető audit-sort sem hagyunk.
      if (isNoOpPatch(existing, patch)) return existing
      const result = await tx.order.update({
        where: { orderId },
        data: patch,
      })
      await tx.orderAuditLog.create({
        data: {
          orderId,
          accountId: actorAccountId,
          action: 'corrected',
          previousData: toJsonSnapshot(existing),
          newData: result,
        },
      })
      return result
    })) as OrderRow
    return toStaffDetail(updated)
  } catch (err) {
    if (err instanceof OrderNotFoundForUpdate) return null
    throw err
  }
}
