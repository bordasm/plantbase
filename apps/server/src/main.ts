// Ennek muszáj a legelső import-nak lennie: mellékhatásként betölti a
// `.env`-et, mielőtt bármely más modul (pl. `app.js` -> `session.js` ->
// `session-store.js`) kiértékelődne és modulszinten olvasná a
// `process.env`-et. Lásd a load-env.ts tetején lévő kommentet.
import './load-env.js'
import { createApp } from './app.js'

const PORT = Number(process.env.SERVER_PORT ?? 3000)
const app = createApp()

app.listen(PORT, () => {
  console.log(`Plantbase server listening on http://localhost:${PORT}`)
})
