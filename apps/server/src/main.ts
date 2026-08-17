import { createApp } from './app.js'

try {
  process.loadEnvFile()
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
}

const PORT = Number(process.env.SERVER_PORT ?? 3000)
const app = createApp()

app.listen(PORT, () => {
  console.log(`Plantbase server listening on http://localhost:${PORT}`)
})
