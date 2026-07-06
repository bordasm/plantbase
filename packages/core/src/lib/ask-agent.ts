import Anthropic from '@anthropic-ai/sdk'
import { listCategories } from './list-categories.js'
import { logInteraction } from './logger.js'
import { runSql } from './run-sql.js'
import { SYSTEM_PROMPT } from './system-prompt.js'

const MODEL = 'claude-sonnet-5'
const MAX_TOKENS = 1024
const MAX_TOOL_ROUNDS = 5

const RUN_SQL_TOOL: Anthropic.Tool = {
  name: 'runSql',
  description:
    'Read-only SQL (csak SELECT) lefuttatása a products katalóguson, és a sorok visszaadása.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'A futtatandó SELECT SQL lekérdezés.',
      },
    },
    required: ['query'],
  },
}

const LIST_CATEGORIES_TOOL: Anthropic.Tool = {
  name: 'listCategories',
  description:
    'A katalógusban ténylegesen szereplő kategóriák listázása. Paramétert nem vár.',
  input_schema: {
    type: 'object',
    properties: {},
  },
}

export interface AskAgentResult {
  answer: string
  systemPrompt: string
  messages: Anthropic.MessageParam[]
  generatedSql: string[]
  usage: { inputTokens: number; outputTokens: number }
}

function extractText(content: Anthropic.ContentBlock[]): string {
  return content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .filter(Boolean)
    .join('\n')
}

export async function askAgent(question: string): Promise<AskAgentResult> {
  const client = new Anthropic()
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: question },
  ]
  const generatedSql: string[] = []
  let inputTokens = 0
  let outputTokens = 0

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: [RUN_SQL_TOOL, LIST_CATEGORIES_TOOL],
      messages,
    })

    inputTokens += response.usage.input_tokens
    outputTokens += response.usage.output_tokens
    messages.push({ role: 'assistant', content: response.content })

    if (response.stop_reason !== 'tool_use') {
      const result: AskAgentResult = {
        answer: extractText(response.content),
        systemPrompt: SYSTEM_PROMPT,
        messages,
        generatedSql,
        usage: { inputTokens, outputTokens },
      }
      await logInteraction({ timestamp: new Date().toISOString(), ...result })
      return result
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue

      try {
        let content: string
        if (block.name === 'runSql') {
          const { query } = block.input as { query: string }
          generatedSql.push(query)
          content = JSON.stringify(await runSql(query))
        } else if (block.name === 'listCategories') {
          content = JSON.stringify(await listCategories())
        } else {
          throw new Error(`Ismeretlen tool: ${block.name}`)
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content,
        })
      } catch (err) {
        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: err instanceof Error ? err.message : String(err),
          is_error: true,
        })
      }
    }
    messages.push({ role: 'user', content: toolResults })
  }

  throw new Error('Túl sok tool-use kör, nem sikerült végleges választ adni.')
}
