import { useState, type FormEvent } from 'react'
import { register } from '../lib/api-client.js'
import { useAuth } from '../lib/auth-context.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'
import { Label } from '../components/ui/label.js'
import { Card, CardContent, CardHeader } from '../components/ui/card.js'

export function RegisterPage({ onSwitchToLogin }: { onSwitchToLogin: () => void }) {
  const { refresh } = useAuth()
  const [fullName, setFullName] = useState('')
  const [salutation, setSalutation] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await register({ fullName, salutation, email, password, passwordConfirm })
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
        <h1 className="text-lg font-semibold">Regisztráció</h1>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={handleSubmit}>
          <div>
            <Label htmlFor="fullName">Teljes név</Label>
            <Input id="fullName" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="salutation">Megszólítás</Label>
            <Input id="salutation" required value={salutation} onChange={(e) => setSalutation(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="email">E-mail cím</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="password">Jelszó</Label>
            <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="passwordConfirm">Jelszó mégegyszer</Label>
            <Input id="passwordConfirm" type="password" required value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Regisztráció...' : 'Regisztráció'}
          </Button>
        </form>
        <button
          type="button"
          className="mt-3 w-full text-sm text-gray-600 underline"
          onClick={onSwitchToLogin}
        >
          Már van fiókod? Belépés
        </button>
      </CardContent>
    </Card>
  )
}
