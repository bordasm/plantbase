import { useState } from 'react'
import { AuthProvider, useAuth } from './lib/auth-context.js'
import { RegisterPage } from './pages/register-page.js'
import { LoginPage } from './pages/login-page.js'
import { ChatPage } from './pages/chat-page.js'
import { StaffOrdersPage } from './pages/staff-orders-page.js'
import { StaffEscalationsPage } from './pages/staff-escalations-page.js'
import { Button } from './components/ui/button.js'

function StaffArea() {
  const [tab, setTab] = useState<'orders' | 'escalations'>('orders')

  return (
    <div>
      <div className="mx-auto flex max-w-4xl gap-2 px-4 pt-4">
        <Button
          variant={tab === 'orders' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('orders')}
        >
          Rendelések
        </Button>
        <Button
          variant={tab === 'escalations' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setTab('escalations')}
        >
          Eszkalációk
        </Button>
      </div>
      {tab === 'orders' ? <StaffOrdersPage /> : <StaffEscalationsPage />}
    </div>
  )
}

function AppContent() {
  const { account, loading } = useAuth()
  const [view, setView] = useState<'login' | 'register'>('login')

  if (loading) return <div className="p-4">Betöltés...</div>

  if (!account) {
    return view === 'login' ? (
      <LoginPage onSwitchToRegister={() => setView('register')} />
    ) : (
      <RegisterPage onSwitchToLogin={() => setView('login')} />
    )
  }

  if (account.role === 'staff' || account.role === 'admin') {
    return <StaffArea />
  }

  return <ChatPage />
}

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
