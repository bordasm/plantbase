import { Command } from 'commander'
import { ping } from '@plantbase/core'

const program = new Command()
program
  .name('plantbase')
  .description('Plantbase — CLI AI agent a növény-katalógushoz')
  .version('0.0.1')

program.parse(process.argv)

if (process.argv.slice(2).length === 0) {
  console.log(`plantbase csontváz — core csatolva (${ping()})`)
}
