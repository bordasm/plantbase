import { ping } from './ping.js'

describe('ping', () => {
  it('should return pong', () => {
    expect(ping()).toEqual('pong')
  })
})
