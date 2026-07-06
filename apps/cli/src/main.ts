import { askAgent, type AskAgentResult } from '@plantbase/core'
import { Command } from 'commander'
import { createInterface } from 'node:readline'
import { z } from 'zod'

try {
  process.loadEnvFile()
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
}

const QuestionInput = z.string().trim().min(1, 'A kérdés nem lehet üres.')

function validate(question: string): string {
  const result = QuestionInput.safeParse(question)
  if (!result.success) {
    throw new Error(result.error.issues[0].message)
  }
  return result.data
}

function printResult(result: AskAgentResult, showPrompt: boolean): void {
  if (showPrompt) {
    console.log('--- system prompt ---')
    console.log(result.systemPrompt)
    console.log('--- üzenetek ---')
    console.log(JSON.stringify(result.messages, null, 2))
    console.log('--- válasz ---')
  }
  console.log(result.answer)
}

async function runAsk(question: string, _options: unknown, command: Command): Promise<void> {
  try {
    const validated = validate(question)
    const showPrompt = Boolean(command.optsWithGlobals().showPrompt)
    printResult(await askAgent(validated), showPrompt)
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  }
}

function runInteractive(_options: unknown, command: Command): void {
  const showPrompt = Boolean(command.optsWithGlobals().showPrompt)
  console.log('Plantbase interaktív mód. Írj "exit"-et a kilépéshez.')
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  })
  // EOF-nál (pipe-olt input) a readline magától, azonnal lezárja magát --
  // ilyenkor a később lefutó válasz már nem hívhat prompt()-ot rajta.
  let closed = false
  rl.on('close', () => {
    closed = true
  })

  rl.prompt()
  // Pipe-olt (nem-TTY) stdin esetén a readline egy körben, szinkronban adja ki
  // az összes bufferelt sort -- pause()/resume() ezt nem állítja meg. Promise-
  // lánccal soroljuk a feldolgozást, hogy a válaszok mindig sorrendhelyesek
  // legyenek, és az "exit" is csak a folyamatban lévő kérdés után zárjon be.
  let queue: Promise<void> = Promise.resolve()
  rl.on('line', (line) => {
    if (line.trim() === 'exit') {
      void queue.then(() => rl.close())
      return
    }
    queue = queue.then(async () => {
      try {
        const validated = validate(line)
        printResult(await askAgent(validated), showPrompt)
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err))
      }
      if (!closed) rl.prompt()
    })
  })
}

const program = new Command()
program
  .name('plantbase')
  .description('Plantbase — CLI AI agent a növény-katalógushoz')
  .version('0.0.1')
  .option('--show-prompt', 'a teljes üzenet-tömb kiírása a válasz mellett')

program
  .command('ask <question>')
  .description('Egyszeri kérdés (LLM + read-only SQL a katalóguson)')
  .action(runAsk)

program.action(runInteractive)

program.parse(process.argv)
