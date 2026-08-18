import { PasswordSchema, hashPassword, verifyPassword } from './password.js'

describe('PasswordSchema', () => {
  it('accepts a password with lower, upper, digit, min 8 chars', () => {
    expect(PasswordSchema.safeParse('Abcdef12').success).toBe(true)
  })

  it('rejects a password shorter than 8 characters', () => {
    const result = PasswordSchema.safeParse('Ab1defg')
    expect(result.success).toBe(false)
  })

  it('rejects a password without an uppercase letter', () => {
    expect(PasswordSchema.safeParse('abcdef12').success).toBe(false)
  })

  it('rejects a password without a lowercase letter', () => {
    expect(PasswordSchema.safeParse('ABCDEF12').success).toBe(false)
  })

  it('rejects a password without a digit', () => {
    expect(PasswordSchema.safeParse('Abcdefgh').success).toBe(false)
  })
})

describe('hashPassword / verifyPassword', () => {
  it('hashes a password and verifies it back correctly', async () => {
    const hash = await hashPassword('Abcdef12')

    expect(hash).not.toBe('Abcdef12')
    await expect(verifyPassword('Abcdef12', hash)).resolves.toBe(true)
    await expect(verifyPassword('wrongPass1', hash)).resolves.toBe(false)
  })
})
