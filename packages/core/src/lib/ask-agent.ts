import { anthropic } from '@ai-sdk/anthropic'
import { generateText, stepCountIs, type ModelMessage } from 'ai'
import { AGENT_MODEL, MAX_TOOL_ROUNDS, buildAgentTools } from './agent-tools.js'
import { logInteraction, type RetrievalTrace } from './logger.js'
import { buildSystemPrompt } from './system-prompt.js'

export interface AskAgentOptions {
  salutation?: string
}

export interface AskAgentResult {
  answer: string
  systemPrompt: string
  messages: ModelMessage[]
  generatedSql: string[]
  retrieval: RetrievalTrace[]
  usage: { inputTokens: number; outputTokens: number }
}

export async function askAgent(
  question: string,
  options: AskAgentOptions = {},
): Promise<AskAgentResult> {
  const generatedSql: string[] = []
  const retrieval: RetrievalTrace[] = []
  const systemPrompt = buildSystemPrompt(options.salutation)
  const inputMessages: ModelMessage[] = [{ role: 'user', content: question }]

  const result = await generateText({
    model: anthropic(AGENT_MODEL),
    system: systemPrompt,
    messages: inputMessages,
    stopWhen: stepCountIs(MAX_TOOL_ROUNDS),
    tools: buildAgentTools({ generatedSql, retrieval }),
  })

  if (!result.text) {
    throw new Error('Túl sok tool-use kör, nem sikerült végleges választ adni.')
  }

  const finalResult: AskAgentResult = {
    answer: result.text,
    systemPrompt,
    messages: [...inputMessages, ...result.responseMessages],
    generatedSql,
    retrieval,
    usage: {
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
    },
  }
  await logInteraction({ timestamp: new Date().toISOString(), ...finalResult })
  return finalResult
}
