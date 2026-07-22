export interface ChunkOptions {
  targetWords: number
  overlapWords: number
}

export const DEFAULT_CHUNK_OPTIONS: ChunkOptions = {
  targetWords: 220,
  overlapWords: 30,
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length
}

function splitIntoSentences(paragraph: string): string[] {
  return paragraph.split(/(?<=[.!?])\s+/).filter(Boolean)
}

function splitOversizedParagraph(
  paragraph: string,
  targetWords: number,
): string[] {
  const sentences = splitIntoSentences(paragraph)
  const pieces: string[] = []
  let current: string[] = []
  let currentWords = 0

  for (const sentence of sentences) {
    const sentenceWords = countWords(sentence)
    if (currentWords > 0 && currentWords + sentenceWords > targetWords) {
      pieces.push(current.join(' '))
      current = []
      currentWords = 0
    }
    current.push(sentence)
    currentWords += sentenceWords
  }
  if (current.length > 0) pieces.push(current.join(' '))
  return pieces
}

function takeOverlapParagraphs(
  paragraphs: string[],
  overlapWords: number,
): string[] {
  const overlap: string[] = []
  let words = 0
  for (let i = paragraphs.length - 1; i >= 0 && words < overlapWords; i--) {
    overlap.unshift(paragraphs[i])
    words += countWords(paragraphs[i])
  }
  return overlap
}

export function chunkText(
  body: string,
  options: ChunkOptions = DEFAULT_CHUNK_OPTIONS,
): string[] {
  const rawParagraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  const paragraphs = rawParagraphs.flatMap((paragraph) =>
    countWords(paragraph) > options.targetWords
      ? splitOversizedParagraph(paragraph, options.targetWords)
      : [paragraph],
  )

  const chunks: string[] = []
  let current: string[] = []
  let currentWords = 0

  for (const paragraph of paragraphs) {
    const paragraphWords = countWords(paragraph)
    if (
      currentWords > 0 &&
      currentWords + paragraphWords > options.targetWords
    ) {
      chunks.push(current.join('\n\n'))
      current = takeOverlapParagraphs(current, options.overlapWords)
      currentWords = countWords(current.join(' '))
    }
    current.push(paragraph)
    currentWords += paragraphWords
  }
  if (current.length > 0) chunks.push(current.join('\n\n'))

  return chunks
}
