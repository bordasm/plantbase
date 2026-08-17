import request from 'supertest'
import { createApp } from './app.js'

describe('createApp', () => {
  it('responds to GET /health with ok status', async () => {
    const app = createApp()

    const response = await request(app).get('/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
  })
})
