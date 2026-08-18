import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const SALT_ROUNDS = 12

const SEED_ACCOUNTS = [
  {
    fullName: 'Teszt Ügyintéző',
    salutation: 'Ügyintéző',
    email: 'staff@plantbase.hu',
    password: 'Staff1234',
    role: 'staff',
  },
  {
    fullName: 'Teszt Üzemeltető',
    salutation: 'Üzemeltető',
    email: 'admin@plantbase.hu',
    password: 'Admin1234',
    role: 'admin',
  },
]

async function main() {
  for (const account of SEED_ACCOUNTS) {
    const existing = await prisma.account.findUnique({
      where: { email: account.email },
    })
    if (existing) {
      console.log(`Már létezik: ${account.email}, kihagyva.`)
      continue
    }
    const passwordHash = await bcrypt.hash(account.password, SALT_ROUNDS)
    await prisma.account.create({
      data: {
        fullName: account.fullName,
        salutation: account.salutation,
        email: account.email,
        passwordHash,
        role: account.role,
      },
    })
    console.log(
      `Létrehozva: ${account.email} (${account.role}), jelszó: ${account.password}`,
    )
  }
}

main()
  .catch((e) => {
    console.error('Staff seed hiba:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
