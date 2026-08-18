import bcrypt from 'bcryptjs'
import { z } from 'zod'

const SALT_ROUNDS = 12

export const PasswordSchema = z
  .string()
  .min(8, 'A jelszónak legalább 8 karakter hosszúnak kell lennie.')
  .regex(/[a-z]/, 'A jelszónak tartalmaznia kell kisbetűt.')
  .regex(/[A-Z]/, 'A jelszónak tartalmaznia kell nagybetűt.')
  .regex(/[0-9]/, 'A jelszónak tartalmaznia kell számot.')

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
