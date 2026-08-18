import { useState } from 'react'
import { AuthProvider, useAuth } from './lib/auth-context.js'
import { RegisterPage } from './pages/register-page.js'
import { LoginPage } from './pages/login-page.js'
import { ChatPage } from './pages/chat-page.js'
import { StaffOrdersPage } from './pages/staff-orders-page.js'

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
    return <StaffOrdersPage />
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
