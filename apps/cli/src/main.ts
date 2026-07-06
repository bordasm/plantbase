import { Command } from 'commander'
import { createInterface } from 'node:readline'
import { z } from 'zod'

const QuestionInput = z.string().trim().min(1, 'A kérdés nem lehet üres.')

function echo(question: string): string {
  const result = QuestionInput.safeParse(question)
  if (!result.success) {
    throw new Error(result.error.issues[0].message)
  }
  return result.data
}

function runAsk(question: string): void {
  try {
    console.log(echo(question))
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    process.exitCode = 1
  }
}

function runInteractive(): void {
  console.log('Plantbase interaktív mód. Írj "exit"-et a kilépéshez.')
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '> ',
  })
  rl.prompt()
  rl.on('line', (line) => {
    if (line.trim() === 'exit') {
      rl.close()
      return
    }
    try {
      console.log(echo(line))
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err))
    }
    rl.prompt()
  })
  rl.on('close', () => {
    process.exit(0)
  })
}

const program = new Command()
program
  .name('plantbase')
  .description('Plantbase — CLI AI agent a növény-katalógushoz')
  .version('0.0.1')

program
  .command('ask <question>')
  .description('Egyszeri kérdés (egyelőre echo, LLM nélkül)')
  .action(runAsk)

program.action(runInteractive)

program.parse(process.argv)
