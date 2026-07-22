import OpenAI from 'openai'

export const EMBEDDING_MODEL = 'text-embedding-3-small'

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const client = new OpenAI()
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  })
  return response.data.map((item) => item.embedding)
}
