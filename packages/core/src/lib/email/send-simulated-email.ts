import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// packages/core/src/lib/email/ (vagy dist/lib/email/ build után, ugyanolyan
// mélységben) -> 5 szint fel a repo gyökeréig: email -> lib -> src(dist) ->
// core -> packages -> repo-gyökér.
const DEFAULT_EMAILS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../emails',
)

export interface SimulatedEmailInput {
  recipientLabel: string
  recipientAddress: string
  subject: string
  body: string
  emailsDir?: string
}

export interface SimulatedEmailResult {
  filePath: string
}

function slugify(label: string): string {
  const normalized = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
  const slug = normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return slug || 'ismeretlen'
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function formatFileDateTime(date: Date): string {
  const datePart = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
  const timePart = `${pad(date.getHours())}${pad(date.getMinutes())}`
  return `${datePart}_${timePart}`
}

function formatHumanDateTime(date: Date): string {
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}. ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

async function writeFirstAvailable(
  emailsDir: string,
  baseName: string,
  content: string,
): Promise<string> {
  for (let counter = 1; ; counter++) {
    const candidate = join(
      emailsDir,
      counter === 1 ? `${baseName}.md` : `${baseName}_${counter}.md`,
    )
    try {
      await writeFile(candidate, content, { encoding: 'utf-8', flag: 'wx' })
      return candidate
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    }
  }
}

export async function sendSimulatedEmail(
  input: SimulatedEmailInput,
): Promise<SimulatedEmailResult> {
  const emailsDir = input.emailsDir ?? DEFAULT_EMAILS_DIR
  const now = new Date()
  const slug = slugify(input.recipientLabel)
  const baseName = `email_${slug}_${formatFileDateTime(now)}`

  await mkdir(emailsDir, { recursive: true })

  const content = `# ${input.subject}

**Címzett:** ${input.recipientAddress}
**Dátum:** ${formatHumanDateTime(now)}

${input.body}
`
  const filePath = await writeFirstAvailable(emailsDir, baseName, content)
  return { filePath }
}
