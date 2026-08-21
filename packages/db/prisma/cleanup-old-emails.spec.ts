import { mkdir, mkdtemp, rm, writeFile, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cleanupOldEmails, DEFAULT_EMAILS_DIR } from './cleanup-old-emails.js'

describe('cleanupOldEmails', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'plantbase-cleanup-test-'))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('deletes .md files older than the retention period, keeps recent ones', async () => {
    const oldFile = join(dir, 'email_old_20260101_1200.md')
    const recentFile = join(dir, 'email_recent_20260819_1200.md')
    await writeFile(oldFile, 'régi tartalom')
    await writeFile(recentFile, 'friss tartalom')

    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000)
    await utimes(oldFile, fortyDaysAgo, fortyDaysAgo)
    // recentFile mtime-ja a writeFile miatt "most" -- nincs mit módosítani rajta.

    const deleted = await cleanupOldEmails(dir, 30)

    expect(deleted).toEqual(['email_old_20260101_1200.md'])
    await expect(
      rm(oldFile, { force: false }).catch((e) => e.code),
    ).resolves.toBe('ENOENT')
    await expect(
      writeFile(recentFile, 'still there', { flag: 'r+' }),
    ).resolves.toBeUndefined()
  })

  it('ignores non-.md files even if old', async () => {
    const oldNonMd = join(dir, 'not-an-email.txt')
    await writeFile(oldNonMd, 'x')
    const longAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000)
    await utimes(oldNonMd, longAgo, longAgo)

    const deleted = await cleanupOldEmails(dir, 30)

    expect(deleted).toEqual([])
  })

  it('skips directory entries instead of crashing on unlink', async () => {
    const oldFolder = join(dir, 'old-folder.md')
    await mkdir(oldFolder)
    const longAgo = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000)
    await utimes(oldFolder, longAgo, longAgo).catch(() => {
      // Egyes fájlrendszereken a könyvtár mtime-ja nem állítható be tetszőlegesen --
      // ez a teszt szempontjából nem lényeges, a lényeg, hogy a hívás ne dobjon.
    })

    await expect(cleanupOldEmails(dir, 30)).resolves.not.toContain(
      'old-folder.md',
    )
  })

  it('returns an empty array if the directory does not exist, without throwing', async () => {
    const missingDir = join(dir, 'nincs-ilyen-alkonyvtar')

    await expect(cleanupOldEmails(missingDir, 30)).resolves.toEqual([])
  })

  it('resolves the default emailsDir to the real repo-root emails/ directory', () => {
    // Nincs emailsDir megadva -- a teszt-fájl UGYANABBÓL a könyvtárból (packages/db/prisma)
    // számolja ki a várt repo-gyökér emails/ útvonalat (a saját import.meta.url-jéből,
    // ugyanazzal a 3-szintes felfelé lépéssel, mint az implementáció), majd
    // ellenőrzi, hogy a DEFAULT_EMAILS_DIR ténylegesen erre mutat -- ez egy
    // független (nem tautologikus) ellenőrzés, mert a várt útvonalat itt,
    // külön számoljuk ki, nem az implementációból importáljuk. A valódi
    // emails/ könyvtárat nem érinti (nincs fájlművelet).
    const expectedRepoRootEmailsDir = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../../emails',
    )

    expect(DEFAULT_EMAILS_DIR).toBe(expectedRepoRootEmailsDir)
  })
})
