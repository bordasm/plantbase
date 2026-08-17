import request from 'supertest'
import { createApp } from '../app.js'
import { streamAgentResponse } from '@plantbase/core'
import { getAccountBySessionToken } from '../lib/session-store.js'
import { SESSION_COOKIE_NAME } from '../middleware/session.js'

vi.mock('@plantbase/core', () => ({
  streamAgentResponse: vi.fn(),
}))
vi.mock('../lib/session-store.js', () => ({
  getAccountBySessionToken: vi.fn(),
}))

describe('POST /api/chat', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    const response = await request(createApp())
      .post('/api/chat')
      .send({ messages: [] })

    expect(response.status).toBe(401)
    expect(streamAgentResponse).not.toHaveBeenCalled()
  })

  it('calls streamAgentResponse with the account salutation when authenticated', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue({
      id: 1,
      fullName: 'Kovács Béla',
      salutation: 'Béla',
      email: 'bela@example.com',
      role: 'customer',
    })
    vi.mocked(streamAgentResponse).mockReturnValue({
      stream: {
        pipeUIMessageStreamToResponse: (res: { end: () => void }) => {
          res.end()
          return Promise.resolve()
        },
      },
      trace: { generatedSql: [], retrieval: [] },
    } as never)

    const response = await request(createApp())
      .post('/api/chat')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok123`])
      .send({
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'Szia' }] }],
      })

    expect(response.status).toBe(200)
    expect(streamAgentResponse).toHaveBeenCalledOnce()
    const [, options] = vi.mocked(streamAgentResponse).mock.calls[0]
    expect(options).toEqual({ salutation: 'Béla' })
  })

  it('returns 400 when messages is missing', async () => {
    vi.mocked(getAccountBySessionToken).mockResolvedValue({
      id: 1,
      fullName: 'Kovács Béla',
      salutation: 'Béla',
      email: 'bela@example.com',
      role: 'customer',
    })

    const response = await request(createApp())
      .post('/api/chat')
      .set('Cookie', [`${SESSION_COOKIE_NAME}=tok123`])
      .send({})

    expect(response.status).toBe(400)
    expect(streamAgentResponse).not.toHaveBeenCalled()
  })
})
