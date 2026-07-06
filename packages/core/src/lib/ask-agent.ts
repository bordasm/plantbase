import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-sonnet-5'

// B2 ideiglenes, szűkített system prompt (LLM, DB nélkül): a teljes,
// runSql toolt is ismertető system-prompt.md-beli verzió a B3 fázisban kerül be.
const SYSTEM_PROMPT = `Te a Plantbase asszisztens vagy: egy növény-katalógus feletti kérdés-válasz agent.
Jelenleg NINCS adatbázis-hozzáférésed. Ha a felhasználó konkrét növényre, árra, készletre vagy más
katalógusadatra kérdez, mondd meg őszintén, hogy ezt most nem éred el -- ne találj ki adatot.
Általános, a katalógustól független kérdésre (pl. növénygondozási tanács) válaszolhatsz normálisan.`

export async function askAgent(question: string): Promise<string> {
  const client = new Anthropic()

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: question }],
  })

  return message.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .filter(Boolean)
    .join('\n')
}
