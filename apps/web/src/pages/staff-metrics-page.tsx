import { useEffect, useState } from 'react'
import {
  getStaffMetrics,
  type MetricsSnapshot,
} from '../lib/metrics-api-client.js'
import { logout } from '../lib/api-client.js'
import { useAuth } from '../lib/auth-context.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent, CardHeader } from '../components/ui/card.js'

export function StaffMetricsPage() {
  const { account, refresh } = useAuth()
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        setMetrics(await getStaffMetrics())
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Ismeretlen hiba történt.',
        )
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  async function handleLogout() {
    await logout()
    await refresh()
  }

  return (
    <div className="mx-auto max-w-4xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">
          Metrikák ({account?.salutation})
        </h1>
        <Button variant="outline" size="sm" onClick={handleLogout}>
          Kilépés
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p>Betöltés...</p>
      ) : metrics ? (
        <div className="grid grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <span className="text-sm text-gray-500">
                Munkaidőn kívüli kiszolgálás aránya
              </span>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">
                {metrics.outOfHours.percentage}%
              </p>
              <p className="text-sm text-gray-500">
                ({metrics.outOfHours.count} / {metrics.outOfHours.total}{' '}
                esetből)
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <span className="text-sm text-gray-500">
                Eszkalációs (hiba) arány
              </span>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">
                {metrics.escalationRate.percentage}%
              </p>
              <p className="text-sm text-gray-500">
                ({metrics.escalationRate.count} / {metrics.escalationRate.total}{' '}
                esetből)
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <span className="text-sm text-gray-500">Összes rendelés</span>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{metrics.totalOrders}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <span className="text-sm text-gray-500">Összes eszkaláció</span>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">
                {metrics.totalEscalations}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
