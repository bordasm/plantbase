import Anthropic from '@anthropic-ai/sdk'
import { searchKnowledge } from './knowledge/search-knowledge.js'
import { listCategories } from './list-categories.js'
import { logInteraction, type RetrievalTrace } from './logger.js'
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

const SEARCH_KNOWLEDGE_TOOL: Anthropic.Tool = {
  name: 'searchKnowledge',
  description:
    'Növénygondozási tudásbázis (öntözés, fény, kártevők, egyéb gondozási témák) keresése a felhasználó kérdéséhez kapcsolódó cikk-részletek visszaadására.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'A keresendő gondozási kérdés.',
      },
    },
    required: ['query'],
  },
}

export interface AskAgentResult {
  answer: string
  systemPrompt: string
  messages: Anthropic.MessageParam[]
  generatedSql: string[]
  retrieval: RetrievalTrace[]
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
  const retrieval: RetrievalTrace[] = []
  let inputTokens = 0
  let outputTokens = 0

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: [RUN_SQL_TOOL, LIST_CATEGORIES_TOOL, SEARCH_KNOWLEDGE_TOOL],
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
        retrieval,
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
        } else if (block.name === 'searchKnowledge') {
          const { query } = block.input as { query: string }
          const { result, trace } = await searchKnowledge(query)
          retrieval.push(trace)
          content = JSON.stringify(result)
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
