import {
  buildEscalationTools,
  type EscalationActions,
} from './escalation-tools.js'
import { describe, it, expect, vi } from 'vitest'

function mockActions(): EscalationActions {
  return { escalate: vi.fn() }
}

describe('buildEscalationTools', () => {
  it('escalateToStaff delegates to actions.escalate with the summary', async () => {
    const actions = mockActions()
    vi.mocked(actions.escalate).mockResolvedValue({ escalationId: 42 })
    const tools = buildEscalationTools(actions)

    const result = await tools.escalateToStaff.execute(
      { summary: 'Az ügyfél egy funkciót kér, ami nincs a katalógusban.' },
      { toolCallId: 't1', messages: [], context: {} },
    )

    expect(actions.escalate).toHaveBeenCalledWith(
      'Az ügyfél egy funkciót kér, ami nincs a katalógusban.',
    )
    expect(result).toEqual({ escalationId: 42 })
  })
})
