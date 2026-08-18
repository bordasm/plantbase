import { buildOrderTools, type OrderActions } from './order-tools.js'
import { describe, it, expect, vi } from 'vitest'

function mockActions(): OrderActions {
  return {
    createOrder: vi.fn(),
    cancelOrder: vi.fn(),
    listMyOrders: vi.fn(),
    getOrderByNumber: vi.fn(),
  }
}

describe('buildOrderTools', () => {
  it('createOrder delegates to actions.createOrder with the given input', async () => {
    const actions = mockActions()
    vi.mocked(actions.createOrder).mockResolvedValue({ orderId: 42 })
    const tools = buildOrderTools(actions)

    const result = await tools.createOrder.execute(
      { email: true, category: 'kaktusz' },
      { toolCallId: 't1', messages: [], context: {} },
    )

    expect(actions.createOrder).toHaveBeenCalledWith({
      email: true,
      category: 'kaktusz',
    })
    expect(result).toEqual({ orderId: 42 })
  })

  it('cancelOrder delegates to actions.cancelOrder with the order id', async () => {
    const actions = mockActions()
    vi.mocked(actions.cancelOrder).mockResolvedValue({ ok: true })
    const tools = buildOrderTools(actions)

    const result = await tools.cancelOrder.execute(
      { orderId: 7 },
      { toolCallId: 't2', messages: [], context: {} },
    )

    expect(actions.cancelOrder).toHaveBeenCalledWith(7)
    expect(result).toEqual({ ok: true })
  })

  it('listMyOrders delegates to actions.listMyOrders with the scope', async () => {
    const actions = mockActions()
    vi.mocked(actions.listMyOrders).mockResolvedValue({
      orders: [],
      tooMany: false,
    })
    const tools = buildOrderTools(actions)

    const result = await tools.listMyOrders.execute(
      { scope: 'active' },
      { toolCallId: 't3', messages: [], context: {} },
    )

    expect(actions.listMyOrders).toHaveBeenCalledWith('active')
    expect(result).toEqual({ orders: [], tooMany: false })
  })

  it('getOrderByNumber delegates to actions.getOrderByNumber with the order id', async () => {
    const actions = mockActions()
    vi.mocked(actions.getOrderByNumber).mockResolvedValue(null)
    const tools = buildOrderTools(actions)

    const result = await tools.getOrderByNumber.execute(
      { orderId: 99 },
      { toolCallId: 't4', messages: [], context: {} },
    )

    expect(actions.getOrderByNumber).toHaveBeenCalledWith(99)
    expect(result).toBeNull()
  })
})
