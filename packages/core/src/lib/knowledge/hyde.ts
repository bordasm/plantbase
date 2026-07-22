import OpenAI from 'openai'

export const HYDE_MODEL = 'gpt-5-mini'

export async function generateHydeDocument(question: string): Promise<string> {
  const client = new OpenAI()
  const response = await client.chat.completions.create({
    model: HYDE_MODEL,
    messages: [
      {
        role: 'system',
        content:
          'Írj egy rövid (2-4 mondatos), plauzibilis válaszbekezdést a felhasználó növénygondozási kérdésére, mintha egy szakcikk részlete lenne. Nem baj, ha a részletek nem pontosak -- ez csak egy keresési segédlet, nem a végső válasz.',
      },
      { role: 'user', content: question },
    ],
  })
  return response.choices[0]?.message?.content ?? question
}
