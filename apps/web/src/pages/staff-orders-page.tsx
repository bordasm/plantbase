import { useEffect, useState } from 'react'
import { listStaffOrders, type StaffOrder } from '../lib/orders-api-client.js'
import { logout } from '../lib/api-client.js'
import { useAuth } from '../lib/auth-context.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent, CardHeader } from '../components/ui/card.js'
import { StaffOrderDetailPage } from './staff-order-detail-page.js'

const STATUS_FILTERS = ['', 'új', 'folyamatban', 'lemondva', 'teljesítve']

export function StaffOrdersPage() {
  const { account, refresh } = useAuth()
  const [orders, setOrders] = useState<StaffOrder[]>([])
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setOrders(await listStaffOrders(statusFilter || undefined))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ismeretlen hiba történt.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [statusFilter])

  async function handleLogout() {
    await logout()
    await refresh()
  }

  if (selectedOrderId !== null) {
    return (
      <StaffOrderDetailPage
        orderId={selectedOrderId}
        onBack={() => {
          setSelectedOrderId(null)
          void load()
        }}
      />
    )
  }

  return (
    <div className="mx-auto max-w-4xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Rendelések ({account?.salutation})</h1>
        <Button variant="outline" size="sm" onClick={handleLogout}>
          Kilépés
        </Button>
      </div>
      <div className="mb-4 flex gap-2">
        {STATUS_FILTERS.map((status) => (
          <Button
            key={status || 'all'}
            variant={statusFilter === status ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(status)}
          >
            {status || 'összes'}
          </Button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p>Betöltés...</p>
      ) : (
        <Card>
          <CardHeader>
            <span className="text-sm text-gray-500">{orders.length} rendelés</span>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="pb-2">#</th>
                  <th className="pb-2">Státusz</th>
                  <th className="pb-2">Leírás</th>
                  <th className="pb-2">Ár</th>
                  <th className="pb-2">Fizetve</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.orderId}
                    className="cursor-pointer border-t border-gray-100 hover:bg-gray-50"
                    onClick={() => setSelectedOrderId(order.orderId)}
                  >
                    <td className="py-2">{order.orderId}</td>
                    <td className="py-2">{order.status}</td>
                    <td className="py-2">{order.orderDesc ?? '—'}</td>
                    <td className="py-2">{order.price ?? '—'}</td>
                    <td className="py-2">{order.payed ? 'igen' : 'nem'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
