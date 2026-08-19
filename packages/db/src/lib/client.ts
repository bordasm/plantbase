import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient()

// Ez a csomag az egyetlen Prisma-hozzáférési határ, ezért a `Prisma`
// névteret is innen adjuk tovább (pl. PrismaClientKnownRequestError-hoz,
// amivel az apps/server a szerializációs ütközéseket -- P2034 -- ismeri fel).
export { Prisma } from '@prisma/client'
