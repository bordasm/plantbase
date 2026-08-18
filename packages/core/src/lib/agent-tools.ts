import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { searchKnowledge } from './knowledge/search-knowledge.js'
import { listCategories } from './list-categories.js'
import { runSql } from './run-sql.js'
import type { RetrievalTrace } from './logger.js'

export const AGENT_MODEL = 'claude-sonnet-5'
export const MAX_TOOL_ROUNDS = 5

export interface AgentToolTrackers {
  generatedSql: string[]
  retrieval: RetrievalTrace[]
}

export function buildAgentTools(trackers: AgentToolTrackers): ToolSet {
  return {
    runSql: tool({
      description:
        'Read-only SQL (csak SELECT) lefuttatása a products katalóguson, és a sorok visszaadása.',
      inputSchema: z.object({
        query: z.string().describe('A futtatandó SELECT SQL lekérdezés.'),
      }),
      execute: async ({ query }: { query: string }) => {
        trackers.generatedSql.push(query)
        return runSql(query)
      },
    }),
    listCategories: tool({
      description:
        'A katalógusban ténylegesen szereplő kategóriák listázása. Paramétert nem vár.',
      inputSchema: z.object({}),
      execute: async () => listCategories(),
    }),
    searchKnowledge: tool({
      description:
        'Növénygondozási tudásbázis (öntözés, fény, kártevők, egyéb gondozási témák) keresése a felhasználó kérdéséhez kapcsolódó cikk-részletek visszaadására.',
      inputSchema: z.object({
        query: z.string().describe('A keresendő gondozási kérdés.'),
      }),
      execute: async ({ query }: { query: string }) => {
        const { result, trace } = await searchKnowledge(query)
        trackers.retrieval.push(trace)
        return result
      },
    }),
  }
}
