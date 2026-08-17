import { buildAgentTools, type AgentToolTrackers } from './agent-tools.js'
import { runSql } from './run-sql.js'
import { listCategories } from './list-categories.js'
import { searchKnowledge } from './knowledge/search-knowledge.js'

vi.mock('./run-sql.js', () => ({ runSql: vi.fn() }))
vi.mock('./list-categories.js', () => ({ listCategories: vi.fn() }))
vi.mock('./knowledge/search-knowledge.js', () => ({ searchKnowledge: vi.fn() }))

describe('buildAgentTools', () => {
  let trackers: AgentToolTrackers

  beforeEach(() => {
    vi.clearAllMocks()
    trackers = { generatedSql: [], retrieval: [] }
  })

  it('runs runSql and records the generated query', async () => {
    vi.mocked(runSql).mockResolvedValue([{ id: 1 }])
    const tools = buildAgentTools(trackers)

    const result = await tools.runSql.execute(
      { query: 'SELECT 1' },
      { toolCallId: 't1', messages: [], context: {} },
    )

    expect(runSql).toHaveBeenCalledWith('SELECT 1')
    expect(result).toEqual([{ id: 1 }])
    expect(trackers.generatedSql).toEqual(['SELECT 1'])
  })

  it('runs listCategories without arguments', async () => {
    vi.mocked(listCategories).mockResolvedValue(['kaktusz'])
    const tools = buildAgentTools(trackers)

    const result = await tools.listCategories.execute(
      {},
      { toolCallId: 't2', messages: [], context: {} },
    )

    expect(listCategories).toHaveBeenCalledOnce()
    expect(result).toEqual(['kaktusz'])
  })

  it('runs searchKnowledge and records the retrieval trace', async () => {
    vi.mocked(searchKnowledge).mockResolvedValue({
      result: { found: true, chunks: [] },
      trace: {
        query: 'öntözés',
        hydeText: 'x',
        candidateCount: 1,
        scores: [],
        selectedChunkIds: [],
        found: true,
      },
    })
    const tools = buildAgentTools(trackers)

    const result = await tools.searchKnowledge.execute(
      { query: 'öntözés' },
      { toolCallId: 't3', messages: [], context: {} },
    )

    expect(searchKnowledge).toHaveBeenCalledWith('öntözés')
    expect(result).toEqual({ found: true, chunks: [] })
    expect(trackers.retrieval).toHaveLength(1)
  })
})
