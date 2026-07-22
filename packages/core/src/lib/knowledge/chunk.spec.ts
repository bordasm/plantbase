import { chunkText } from './chunk.js'

describe('chunkText', () => {
  it('returns a single chunk when the body is shorter than the target size', () => {
    const body = 'Short paragraph about watering.\n\nAnother short paragraph.'

    const chunks = chunkText(body, { targetWords: 220, overlapWords: 30 })

    expect(chunks).toEqual([body])
  })

  it('splits a long document into multiple chunks near the target size', () => {
    const paragraph = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ')
    const body = Array.from({ length: 10 }, () => paragraph).join('\n\n')

    const chunks = chunkText(body, { targetWords: 100, overlapWords: 20 })

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.trim().split(/\s+/).length).toBeLessThanOrEqual(130)
    }
  })

  it('carries the trailing paragraph of a chunk into the start of the next chunk (overlap)', () => {
    const paragraphs = [
      'P1 '.repeat(20),
      'P2 '.repeat(20),
      'P3 '.repeat(20),
      'P4 '.repeat(20),
    ]
    const body = paragraphs.join('\n\n')

    const chunks = chunkText(body, { targetWords: 40, overlapWords: 20 })

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks[1].startsWith(paragraphs[1].trim())).toBe(true)
  })

  it('is deterministic: same input always produces the same output', () => {
    const body = Array.from({ length: 5 }, (_, i) =>
      `Paragraph number ${i}. `.repeat(10),
    ).join('\n\n')

    const first = chunkText(body)
    const second = chunkText(body)

    expect(first).toEqual(second)
  })

  it('splits an oversized single paragraph by sentence', () => {
    const sentence = 'This is one sentence about plant care. '
    const hugeParagraph = sentence.repeat(60)

    const chunks = chunkText(hugeParagraph, {
      targetWords: 100,
      overlapWords: 10,
    })

    expect(chunks.length).toBeGreaterThan(1)
  })
})
