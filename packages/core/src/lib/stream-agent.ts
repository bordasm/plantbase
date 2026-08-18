import { anthropic } from '@ai-sdk/anthropic'
import { streamText, stepCountIs, type ModelMessage } from 'ai'
import { AGENT_MODEL, MAX_TOOL_ROUNDS, buildAgentTools } from './agent-tools.js'
import { buildSystemPrompt } from './system-prompt.js'
import type { RetrievalTrace } from './logger.js'

export interface StreamAgentOptions {
  salutation?: string
}

export interface StreamAgentTrace {
  generatedSql: string[]
  retrieval: RetrievalTrace[]
}

export function streamAgentResponse(
  messages: ModelMessage[],
  options: StreamAgentOptions = {},
) {
  const trace: StreamAgentTrace = { generatedSql: [], retrieval: [] }
  const stream = streamText({
    model: anthropic(AGENT_MODEL),
    system: buildSystemPrompt(options.salutation),
    messages,
    stopWhen: stepCountIs(MAX_TOOL_ROUNDS),
    tools: buildAgentTools(trace),
  })
  return { stream, trace }
}
