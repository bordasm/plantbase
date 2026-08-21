import { useEffect, useState } from 'react'
import {
  listStaffAccounts,
  anonymizeStaffAccount,
  type StaffAccount,
} from '../lib/accounts-api-client.js'
import { logout } from '../lib/api-client.js'
import { useAuth } from '../lib/auth-context.js'
import { Button } from '../components/ui/button.js'
import { Card, CardContent, CardHeader } from '../components/ui/card.js'

export function StaffAccountsPage() {
  const { account, refresh } = useAuth()
  const [accounts, setAccounts] = useState<StaffAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setAccounts(await listStaffAccounts())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ismeretlen hiba történt.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function handleAnonymize(accountId: number) {
    if (
      !window.confirm(
        'Biztosan anonimizálod ezt a fiókot? Ez a művelet nem vonható vissza.',
      )
    ) {
      return
    }
    try {
      await anonymizeStaffAccount(accountId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ismeretlen hiba történt.')
    }
  }

  async function handleLogout() {
    await logout()
    await refresh()
  }

  return (
    <div className="mx-auto max-w-4xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">
          Fiókok ({account?.salutation})
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
              {accounts.length} fiók
            </span>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500">
                  <th className="pb-2">#</th>
                  <th className="pb-2">Név</th>
                  <th className="pb-2">E-mail</th>
                  <th className="pb-2">Szerepkör</th>
                  <th className="pb-2">Művelet</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((acc) => (
                  <tr key={acc.id} className="border-t border-gray-100">
                    <td className="py-2">{acc.id}</td>
                    <td className="py-2">{acc.fullName}</td>
                    <td className="py-2">{acc.email}</td>
                    <td className="py-2">{acc.role}</td>
                    <td className="py-2">
                      {acc.anonymizedAt ? (
                        <span className="text-gray-400">Anonimizálva</span>
                      ) : acc.id === account?.id ? (
                        <span className="text-gray-400">Saját fiók</span>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleAnonymize(acc.id)}
                        >
                          Anonimizálás
                        </Button>
                      )}
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
