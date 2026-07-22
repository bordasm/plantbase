import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type Anthropic from '@anthropic-ai/sdk'

export interface RetrievalTrace {
  query: string
  hydeText: string
  candidateCount: number
  scores: { id: number; score: number }[]
  selectedChunkIds: number[]
  found: boolean
}

export interface InteractionLogEntry {
  timestamp: string
  systemPrompt: string
  messages: Anthropic.MessageParam[]
  generatedSql: string[]
  retrieval: RetrievalTrace[]
  answer: string
  usage: { inputTokens: number; outputTokens: number }
}

export interface WarningLogEntry {
  timestamp: string
  event: string
  message: string
}

const LOG_DIR = join(process.cwd(), 'logs')

// Egy logfájl / folyamat-futás (a CLI indulásának időbélyegével), minden
// interakció (kérdés) egy-egy JSONL sorként kerül bele -- FR4.
let logFileName: string | undefined

function getLogFileName(): string {
  logFileName ??= `${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`
  return logFileName
}

export async function logInteraction(
  entry: InteractionLogEntry,
): Promise<void> {
  await mkdir(LOG_DIR, { recursive: true })
  await appendFile(
    join(LOG_DIR, getLogFileName()),
    `${JSON.stringify(entry)}\n`,
    'utf-8',
  )
}

export async function logWarning(entry: WarningLogEntry): Promise<void> {
  await mkdir(LOG_DIR, { recursive: true })
  await appendFile(
    join(LOG_DIR, 'warnings.jsonl'),
    `${JSON.stringify(entry)}\n`,
    'utf-8',
  )
}
