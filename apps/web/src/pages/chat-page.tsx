import { useState, type FormEvent } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { logout } from '../lib/api-client.js'
import { useAuth } from '../lib/auth-context.js'
import { MessageList } from '../components/chat/message-list.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/input.js'

export function ChatPage() {
  const { account, refresh } = useAuth()
  const [input, setInput] = useState('')
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat', credentials: 'include' }),
  })

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!input.trim()) return
    void sendMessage({ text: input })
    setInput('')
  }

  async function handleLogout() {
    await logout()
    await refresh()
  }

  return (
    <div className="mx-auto flex h-screen max-w-2xl flex-col p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">
          Szia, {account?.salutation}!
        </h1>
        <Button variant="outline" size="sm" onClick={handleLogout}>
          Kilépés
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <MessageList messages={messages} />
      </div>
      <form className="mt-4 flex gap-2" onSubmit={handleSubmit}>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Írj egy kérdést a növényekről..."
          disabled={status === 'streaming'}
        />
        <Button type="submit" disabled={status === 'streaming'}>
          Küldés
        </Button>
      </form>
    </div>
  )
}
