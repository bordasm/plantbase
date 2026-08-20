import { readdir, stat, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// packages/db/prisma/ -> 3 szint fel a repo gyökeréig: prisma -> db -> packages -> repo-gyökér.
export const DEFAULT_EMAILS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../emails',
)
const DEFAULT_RETENTION_DAYS = 30

export async function cleanupOldEmails(
  emailsDir: string = DEFAULT_EMAILS_DIR,
  retentionDays: number = DEFAULT_RETENTION_DAYS,
): Promise<string[]> {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  let entries: string[]
  try {
    entries = await readdir(emailsDir)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }

  const deleted: string[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue
    const filePath = join(emailsDir, entry)
    const stats = await stat(filePath)
    if (stats.mtimeMs < cutoff) {
      await unlink(filePath)
      deleted.push(entry)
    }
  }
  return deleted
}

async function main(): Promise<void> {
  const deleted = await cleanupOldEmails()
  if (deleted.length === 0) {
    console.log('Nincs törlendő e-mail-fájl.')
  } else {
    console.log(`${deleted.length} e-mail-fájl törölve:`)
    for (const name of deleted) console.log(`  - ${name}`)
  }
}

// Csak közvetlen futtatáskor (tsx-szel) fusson le automatikusan -- NE akkor,
// ha egy teszt importálja a cleanupOldEmails függvényt. Ez eltér a
// seed-staff.ts mintájától (ott nincs guard), mert ide egy önálló,
// a valódi /emails könyvtárat NEM érintő tesztnek importálhatónak kell
// lennie.
//
// A `import.meta.url === \`file://${process.argv[1]}\`` alak (a briefben
// vázolt kiindulási minta) Windows-on TÉNYLEGESEN hibás: az import.meta.url
// normalizált, perjeles URL-t ad (pl. file:///C:/foo/bar.ts), a
// process.argv[1] viszont nyers, backslash-es Windows-útvonal (pl.
// C:\foo\bar.ts) -- a kettő string-egyenlősége sosem teljesül, tehát a
// guard soha nem sülne el közvetlen futtatáskor sem. Ezt Step 3 kézi
// futtatással ténylegesen megerősítette (néma, kimenet nélküli futás).
// A javítás: process.argv[1]-et is fájl-URL-lé alakítjuk
// (pathToFileURL), így mindkét oldal azonos, normalizált formában
// hasonlítható össze -- ez Windows-on és POSIX-on egyaránt helyesen
// működik (ellenőrizve).
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main()
}
