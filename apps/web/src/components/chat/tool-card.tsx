interface ToolPart {
  type: string
  toolCallId?: string
  input?: unknown
  output?: unknown
  state?: string
}

const TOOL_LABELS: Record<string, string> = {
  'tool-runSql': 'Katalógus-lekérdezés',
  'tool-listCategories': 'Kategóriák listázása',
  'tool-searchKnowledge': 'Tudásbázis-keresés',
}

export function ToolCard({ part }: { part: ToolPart }) {
  const label = TOOL_LABELS[part.type] ?? part.type
  return (
    <div className="my-1 rounded-md border border-gray-200 bg-gray-50 p-2 text-xs">
      <div className="font-medium text-gray-700">{label}</div>
      {part.input !== undefined && (
        <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-gray-500">
          {JSON.stringify(part.input, null, 2)}
        </pre>
      )}
    </div>
  )
}
