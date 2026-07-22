import { appendFile, mkdir } from 'node:fs/promises'
import type { InteractionLogEntry } from './logger.js'

vi.mock('node:fs/promises', () => ({
  appendFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}))

function sampleEntry(
  overrides: Partial<InteractionLogEntry> = {},
): InteractionLogEntry {
  return {
    timestamp: '2026-07-16T00:00:00.000Z',
    systemPrompt: 'system prompt',
    messages: [],
    generatedSql: [],
    retrieval: [],
    answer: 'answer',
    usage: { inputTokens: 1, outputTokens: 2 },
    ...overrides,
  }
}

describe('logInteraction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('creates the logs directory before writing', async () => {
    const { logInteraction } = await import('./logger.js')

    await logInteraction(sampleEntry())

    expect(mkdir).toHaveBeenCalledWith(expect.stringMatching(/logs$/), {
      recursive: true,
    })
  })

  it('appends the entry as a JSONL line to a .jsonl file under logs/', async () => {
    const { logInteraction } = await import('./logger.js')
    const entry = sampleEntry()

    await logInteraction(entry)

    expect(appendFile).toHaveBeenCalledWith(
      expect.stringMatching(/logs[\\/].*\.jsonl$/),
      `${JSON.stringify(entry)}\n`,
      'utf-8',
    )
  })

  it('reuses the same log file across multiple calls in one process', async () => {
    const { logInteraction } = await import('./logger.js')

    await logInteraction(sampleEntry())
    await logInteraction(sampleEntry({ answer: 'second answer' }))

    const [firstPath] = vi.mocked(appendFile).mock.calls[0]
    const [secondPath] = vi.mocked(appendFile).mock.calls[1]
    expect(secondPath).toBe(firstPath)
  })
})

describe('logWarning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('appends the warning as a JSONL line to logs/warnings.jsonl', async () => {
    const { logWarning } = await import('./logger.js')
    const entry = {
      timestamp: '2026-07-22T00:00:00.000Z',
      event: 'hyde_failed',
      message: 'timeout',
    }

    await logWarning(entry)

    expect(appendFile).toHaveBeenCalledWith(
      expect.stringMatching(/logs[\\/]warnings\.jsonl$/),
      `${JSON.stringify(entry)}\n`,
      'utf-8',
    )
  })
})
