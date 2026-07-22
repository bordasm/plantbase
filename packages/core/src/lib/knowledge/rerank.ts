import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

export const RERANK_MODEL = 'claude-haiku-4-5-20251001'

const RerankResponseSchema = z.object({
  scores: z.array(
    z.object({
      id: z.number(),
      score: z.number(),
    }),
  ),
})

const SUBMIT_SCORES_TOOL: Anthropic.Tool = {
  name: 'submitScores',
  description:
    'Relevancia-pontszám (0-10) beküldése minden jelölt szövegrészhez, a kérdéshez viszonyítva.',
  input_schema: {
    type: 'object',
    properties: {
      scores: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            score: { type: 'number' },
          },
          required: ['id', 'score'],
        },
      },
    },
    required: ['scores'],
  },
}

export interface RerankCandidate {
  id: number
  content: string
}

export interface RerankScore {
  id: number
  score: number
}

export async function rerankChunks(
  question: string,
  candidates: RerankCandidate[],
): Promise<RerankScore[]> {
  const client = new Anthropic()
  const candidateList = candidates
    .map((candidate) => `[${candidate.id}] ${candidate.content}`)
    .join('\n\n')

  const response = await client.messages.create({
    model: RERANK_MODEL,
    max_tokens: 1024,
    tools: [SUBMIT_SCORES_TOOL],
    tool_choice: { type: 'tool', name: 'submitScores' },
    messages: [
      {
        role: 'user',
        content: `Kérdés: ${question}\n\nJelöltek:\n${candidateList}\n\nPontozz 0-10-ig mindegyik jelölt relevanciáját a kérdéshez a submitScores tool hívásával.`,
      },
    ],
  })

  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  )
  if (!toolUse) {
    throw new Error('A rerank modell nem hívta meg a submitScores toolt.')
  }

  return RerankResponseSchema.parse(toolUse.input).scores
}
