import { useEffect, useState } from 'react'
import {
  listStaffEscalations,
  type StaffEscalation,
} from '../lib/escalations-api-client.js'
import { logout } from '../lib/api-client.js'
import { useAuth } from '../lib/auth-context.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent, CardHeader } from '../components/ui/card.js'

export function StaffEscalationsPage() {
  const { account, refresh } = useAuth()
  const [escalations, setEscalations] = useState<StaffEscalation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        setEscalations(await listStaffEscalations())
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
          Eszkalációk ({account?.salutation})
        </h1>
        <Button variant="outline" size="sm" onClick={handleLogout}>
          Kilépés
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p>Betöltés...</p>
      ) : (
        <Card>
          <CardHeader>
            <span className="text-sm text-gray-500">
              {escalations.length} eszkaláció
            </span>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="pb-2">#</th>
                  <th className="pb-2">Ügyfél</th>
                  <th className="pb-2">Összefoglaló</th>
                  <th className="pb-2">Időpont</th>
                </tr>
              </thead>
              <tbody>
                {escalations.map((esc) => (
                  <tr key={esc.id} className="border-t border-gray-100">
                    <td className="py-2">{esc.id}</td>
                    <td className="py-2">{esc.accountName}</td>
                    <td className="py-2">{esc.summary}</td>
                    <td className="py-2">
                      {new Date(esc.createdAt).toLocaleString('hu-HU')}
                    </td>
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
