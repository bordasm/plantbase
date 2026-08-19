import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sendSimulatedEmail } from './send-simulated-email.js'

describe('sendSimulatedEmail', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'plantbase-email-test-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('creates a filename matching the spec examples (customer)', async () => {
    vi.setSystemTime(new Date(2026, 7, 17, 19, 17)) // 2026.08.17. 19:17
    const { filePath } = await sendSimulatedEmail({
      recipientLabel: 'Kovács Béla',
      recipientAddress: 'bela@example.com',
      subject: 'Rendelés visszaigazolás',
      body: 'Teszt.',
      emailsDir: dir,
    })
    expect(filePath).toBe(join(dir, 'email_kovacs_bela_20260817_1917.md'))
    vi.useRealTimers()
  })

  it('creates a filename matching the spec examples (ügyfélszolgálat)', async () => {
    vi.setSystemTime(new Date(2026, 7, 17, 19, 16))
    const { filePath } = await sendSimulatedEmail({
      recipientLabel: 'ügyfélszolgálat',
      recipientAddress: 'ugyfelszolgalat@plantbase.hu',
      subject: 'Eszkaláció',
      body: 'Teszt.',
      emailsDir: dir,
    })
    expect(filePath).toBe(join(dir, 'email_ugyfelszolgalat_20260817_1916.md'))
    vi.useRealTimers()
  })

  it('strips consecutive diacritics and punctuation', async () => {
    const { filePath } = await sendSimulatedEmail({
      recipientLabel: "Őri Ünő-Áron O'Brien",
      recipientAddress: 'x@example.com',
      subject: 'S',
      body: 'B',
      emailsDir: dir,
    })
    expect(filePath).toMatch(/email_ori_uno_aron_o_brien_\d{8}_\d{4}\.md$/)
  })

  it('appends a numeric suffix on filename collision instead of overwriting', async () => {
    vi.setSystemTime(new Date(2026, 7, 17, 19, 17))
    const first = await sendSimulatedEmail({
      recipientLabel: 'Kovács Béla',
      recipientAddress: 'bela@example.com',
      subject: 'Első',
      body: 'Első tartalom.',
      emailsDir: dir,
    })
    const second = await sendSimulatedEmail({
      recipientLabel: 'Kovács Béla',
      recipientAddress: 'bela@example.com',
      subject: 'Második',
      body: 'Második tartalom.',
      emailsDir: dir,
    })
    expect(second.filePath).not.toBe(first.filePath)
    expect(second.filePath).toBe(
      join(dir, 'email_kovacs_bela_20260817_1917_2.md'),
    )
    const firstContent = await readFile(first.filePath, 'utf-8')
    expect(firstContent).toContain('Első tartalom.')
    vi.useRealTimers()
  })

  it('handles concurrent sends for the same recipient without clobbering files (TOCTOU race)', async () => {
    vi.setSystemTime(new Date(2026, 7, 17, 19, 17))
    const N = 5
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        sendSimulatedEmail({
          recipientLabel: 'Kovács Béla',
          recipientAddress: 'bela@example.com',
          subject: `Tárgy ${i}`,
          body: `Tartalom ${i}`,
          emailsDir: dir,
        }),
      ),
    )
    vi.useRealTimers()

    const filePaths = results.map((r) => r.filePath)
    expect(new Set(filePaths).size).toBe(N)

    const contents = await Promise.all(
      filePaths.map((p) => readFile(p, 'utf-8')),
    )
    const bodies = contents.map((c) => {
      const match = /Tartalom (\d+)/.exec(c)
      return match?.[1]
    })
    expect(new Set(bodies).size).toBe(N)
  })

  it('writes the expected markdown structure', async () => {
    const { filePath } = await sendSimulatedEmail({
      recipientLabel: 'Teszt Elek',
      recipientAddress: 'teszt@example.com',
      subject: 'Tárgy sor',
      body: 'Törzs szöveg.',
      emailsDir: dir,
    })
    const content = await readFile(filePath, 'utf-8')
    expect(content).toContain('# Tárgy sor')
    expect(content).toContain('**Címzett:** teszt@example.com')
    expect(content).toContain('Törzs szöveg.')
  })

  it('creates the emails directory if it does not exist yet', async () => {
    const nested = join(dir, 'nested', 'path')
    const { filePath } = await sendSimulatedEmail({
      recipientLabel: 'Teszt',
      recipientAddress: 'teszt@example.com',
      subject: 'S',
      body: 'B',
      emailsDir: nested,
    })
    await expect(readFile(filePath, 'utf-8')).resolves.toContain('B')
  })

  it('resolves the default emailsDir to the real repo-root emails/ directory', async () => {
    // Nincs emailsDir megadva -- a teszt-fájl UGYANABBÓL a könyvtárból számolja
    // ki a várt repo-gyökér emails/ útvonalat (a saját import.meta.url-jéből,
    // ugyanazzal az 5-szintes felfelé lépéssel, mint az implementáció), majd
    // ellenőrzi, hogy a ténylegesen létrehozott fájl valóban ott van -- ez egy
    // független (nem tautologikus) ellenőrzés, mert a várt útvonalat itt,
    // külön számoljuk ki, nem az implementációból importáljuk.
    const expectedRepoRootEmailsDir = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../../emails',
    )
    const { filePath } = await sendSimulatedEmail({
      recipientLabel: 'Repo Root Teszt',
      recipientAddress: 'x@example.com',
      subject: 'S',
      body: 'B',
    })
    try {
      expect(filePath.startsWith(expectedRepoRootEmailsDir)).toBe(true)
    } finally {
      await rm(filePath, { force: true })
    }
  })
})
