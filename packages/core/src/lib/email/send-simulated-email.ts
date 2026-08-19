import { mkdir, writeFile, access } from 'node:fs/promises'
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

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function resolveAvailableFilePath(
  emailsDir: string,
  baseName: string,
): Promise<string> {
  let candidate = join(emailsDir, `${baseName}.md`)
  let counter = 2
  while (await fileExists(candidate)) {
    candidate = join(emailsDir, `${baseName}_${counter}.md`)
    counter++
  }
  return candidate
}

export async function sendSimulatedEmail(
  input: SimulatedEmailInput,
): Promise<SimulatedEmailResult> {
  const emailsDir = input.emailsDir ?? DEFAULT_EMAILS_DIR
  const now = new Date()
  const slug = slugify(input.recipientLabel)
  const baseName = `email_${slug}_${formatFileDateTime(now)}`

  await mkdir(emailsDir, { recursive: true })
  const filePath = await resolveAvailableFilePath(emailsDir, baseName)

  const content = `# ${input.subject}

**Címzett:** ${input.recipientAddress}
**Dátum:** ${formatHumanDateTime(now)}

${input.body}
`
  await writeFile(filePath, content, 'utf-8')
  return { filePath }
}
