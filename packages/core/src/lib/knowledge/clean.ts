export interface CleanedDocument {
  title: string
  sourceUrl: string
  category: string
  body: string
}

const BOILERPLATE_MARKER = '## Perfect Pairings For Your Plants'
const BREADCRUMB_LABELS = new Set([
  'Plants 101',
  'Ask The Sill',
  'Outdoor Care',
  'Common Care Questions',
  'The Basics',
])

function parseFrontmatter(raw: string): {
  fields: Record<string, string>
  rest: string
} {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) {
    return { fields: {}, rest: raw }
  }
  const fields: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const separatorIndex = line.indexOf(':')
    if (separatorIndex === -1) continue
    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim()
    fields[key] = value
  }
  return { fields, rest: match[2] }
}

function stripHeadingAndBreadcrumb(body: string, title: string): string {
  const lines = body.split('\n')
  let index = 0

  while (index < lines.length && lines[index].trim() === '') index++
  if (lines[index]?.trim() === `# ${title}`) {
    index++
    while (index < lines.length && lines[index].trim() === '') index++
    if (BREADCRUMB_LABELS.has(lines[index]?.trim())) {
      index++
      while (index < lines.length && lines[index].trim() === '') index++
    }
  }
  return lines.slice(index).join('\n')
}

function stripBoilerplateTail(body: string): string {
  const markerIndex = body.indexOf(BOILERPLATE_MARKER)
  return markerIndex === -1 ? body : body.slice(0, markerIndex)
}

export function cleanDocument(raw: string): CleanedDocument {
  const { fields, rest } = parseFrontmatter(raw)
  const title = fields.title ?? ''
  const withoutHeading = stripHeadingAndBreadcrumb(rest, title)
  const withoutTail = stripBoilerplateTail(withoutHeading)

  return {
    title,
    sourceUrl: fields.source ?? '',
    category: fields.category ?? '',
    body: withoutTail.trim(),
  }
}
