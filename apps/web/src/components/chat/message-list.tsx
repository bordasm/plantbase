import { AgentBadge } from './agent-badge.js'
import { ToolCard } from './tool-card.js'

interface MessagePart {
  type: string
  text?: string
  [key: string]: unknown
}

interface ChatMessage {
  id: string
  role: string
  parts: MessagePart[]
}

export function MessageList({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <div key={message.id} className={message.role === 'user' ? 'text-right' : 'text-left'}>
          {message.role !== 'user' && <AgentBadge />}
          <div className="mt-1 space-y-1">
            {message.parts.map((part, index) =>
              part.type === 'text' ? (
                <p key={index} className="whitespace-pre-wrap rounded-md bg-white p-2 text-sm shadow-sm">
                  {part.text}
                </p>
              ) : part.type.startsWith('tool-') ? (
                <ToolCard key={index} part={part} />
              ) : null,
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
