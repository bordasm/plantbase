import { useState, type FormEvent } from 'react'
import { login } from '../lib/api-client.js'
import { useAuth } from '../lib/auth-context.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { Label } from '../components/ui/label.js'
import { Card, CardContent, CardHeader } from '../components/ui/card.js'

export function LoginPage({ onSwitchToRegister }: { onSwitchToRegister: () => void }) {
  const { refresh } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login({ email, password })
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ismeretlen hiba történt.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="mx-auto mt-16 max-w-sm">
      <CardHeader>
        <h1 className="text-lg font-semibold">Belépés</h1>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div>
            <Label htmlFor="email">E-mail cím</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">Jelszó</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Belépés...' : 'Belépés'}
          </Button>
        </form>
        <button
          type="button"
          className="mt-3 w-full text-sm text-gray-600 underline"
          onClick={onSwitchToRegister}
        >
          Nincs még fiókod? Regisztráció
        </button>
      </CardContent>
    </Card>
  )
}
