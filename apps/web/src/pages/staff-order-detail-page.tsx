import { useEffect, useState } from 'react'
import {
  getStaffOrder,
  updateStaffOrderStatus,
  correctStaffOrder,
  type StaffOrder,
  type AuditEntry,
} from '../lib/orders-api-client.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { Label } from '../components/ui/label.js'
import { Card, CardContent, CardHeader } from '../components/ui/card.js'

const STATUS_VALUES = ['új', 'folyamatban', 'lemondva', 'teljesítve']

export function StaffOrderDetailPage({
  orderId,
  onBack,
}: {
  orderId: number
  onBack: () => void
}) {
  const [order, setOrder] = useState<StaffOrder | null>(null)
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])
  const [status, setStatus] = useState('')
  const [payed, setPayed] = useState(false)
  const [orderDesc, setOrderDesc] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    const { order: fetched, auditLog: fetchedLog } =
      await getStaffOrder(orderId)
    setOrder(fetched)
    setAuditLog(fetchedLog)
    setStatus(fetched.status)
    setPayed(fetched.payed)
    setOrderDesc(fetched.orderDesc ?? '')
  }

  useEffect(() => {
    async function loadInitial() {
      setLoadError(null)
      try {
        await load()
      } catch (err) {
        setLoadError(
          err instanceof Error ? err.message : 'Ismeretlen hiba történt.',
        )
      }
    }
    void loadInitial()
  }, [orderId])

  async function handleStatusSave() {
    setSaving(true)
    setError(null)
    try {
      await updateStaffOrderStatus(orderId, { status, payed })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ismeretlen hiba történt.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCorrectionSave() {
    setSaving(true)
    setError(null)
    try {
      await correctStaffOrder(orderId, { orderDesc })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ismeretlen hiba történt.')
    } finally {
      setSaving(false)
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl p-4">
        <Button variant="outline" size="sm" onClick={onBack}>
          Vissza
        </Button>
        <p className="mt-4 text-sm text-red-600">{loadError}</p>
      </div>
    )
  }

  if (!order) return <div className="p-4">Betöltés...</div>

  return (
    <div className="mx-auto max-w-2xl p-4">
      <Button variant="outline" size="sm" onClick={onBack}>
        Vissza
      </Button>
      <Card className="mt-4">
        <CardHeader>
          <h1 className="text-lg font-semibold">#{order.orderId} rendelés</h1>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div>
            <Label htmlFor="status">Státusz</Label>
            <select
              id="status"
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS_VALUES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="payed"
              type="checkbox"
              checked={payed}
              onChange={(e) => setPayed(e.target.checked)}
            />
            <Label htmlFor="payed">Fizetve</Label>
          </div>
          <Button onClick={handleStatusSave} disabled={saving}>
            Státusz mentése
          </Button>

          <div>
            <Label htmlFor="orderDesc">Leírás javítása</Label>
            <Input
              id="orderDesc"
              value={orderDesc}
              onChange={(e) => setOrderDesc(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            onClick={handleCorrectionSave}
            disabled={saving}
          >
            Leírás mentése
          </Button>

          <div>
            <h2 className="mt-4 text-sm font-semibold">Napló</h2>
            <ul className="mt-2 space-y-1 text-xs text-gray-600">
              {auditLog.map((entry) => (
                <li key={entry.id}>
                  {entry.createdAt} — {entry.action} (fiók #{entry.accountId})
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
