import { tool, type ToolSet } from 'ai'
import { z } from 'zod'

export interface EscalationActions {
  escalate(summary: string): Promise<{ escalationId: number }>
}

const EscalateInputSchema = z.object({
  summary: z
    .string()
    .describe(
      'Rövid, tényszerű összefoglaló arról, mit kért az ügyfél és miért nem tudtál segíteni.',
    ),
})

export function buildEscalationTools(actions: EscalationActions): ToolSet {
  return {
    escalateToStaff: tool({
      description:
        'A bejelentkezett ügyfél ügyének továbbítása ügyintézőhöz, amikor a kérés a Plantbase funkciójához tartozik, de nem tudsz rá válaszolni vagy nem tudod elvégezni.',
      inputSchema: EscalateInputSchema,
      execute: async ({ summary }: { summary: string }) =>
        actions.escalate(summary),
    }),
  }
}
