import express from 'express'
import request from 'supertest'
import { createApp, errorHandler } from './app.js'

describe('createApp', () => {
  it('responds to GET /health with ok status', async () => {
    const app = createApp()

    const response = await request(app).get('/health')

    expect(response.status).toBe(200)
    expect(response.body).toEqual({ status: 'ok' })
  })

  it('returns a clean 500 with a generic message when a route throws, without leaking the error details', async () => {
    // createApp() already registers errorHandler as the last middleware, so
    // a route added after createApp() returns would sit *after* it in the
    // stack and never reach it. Instead, build a minimal app that mounts a
    // throwing route ahead of the real, exported errorHandler, exercising
    // the exact same error-handling code path createApp() wires up.
    const app = express()
    app.get('/__test-error', () => {
      throw new Error('boom - sensitive internal detail')
    })
    app.use(errorHandler)

    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    try {
      const response = await request(app).get('/__test-error')

      expect(response.status).toBe(500)
      expect(response.body).toEqual({ error: 'Szerver hiba történt.' })

      const rawBody = JSON.stringify(response.body)
      expect(rawBody).not.toContain('boom')
      expect(rawBody).not.toContain('at ')
      expect(response.text).not.toContain('boom')
      expect(response.text).not.toContain('<pre>')
    } finally {
      consoleErrorSpy.mockRestore()
    }
  })
})
