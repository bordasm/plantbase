import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from 'express'
import cookieParser from 'cookie-parser'
import { attachAccount } from './middleware/session.js'
import { authRouter } from './routes/auth.js'
import { chatRouter } from './routes/chat.js'
import { debugRouter } from './routes/debug.js'
import { staffOrdersRouter } from './routes/staff-orders.js'
import { staffEscalationsRouter } from './routes/staff-escalations.js'

// Végső hibakezelő middleware: elkapja a route handlerekből dobott vagy
// elutasított (rejected) hibákat, hogy Express 5 alapértelmezett hibakezelője
// (ami nyers stack trace-t adna vissza HTML-ként, tetszőleges status kóddal)
// soha ne érje el a klienst. A négy paraméteres szignatúra (err, req, res,
// next) teszi Express számára felismerhetővé hibakezelő middleware-ként.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // Express felismerésének feltétele a 4 paraméter; `next` itt szándékosan
  // nincs meghívva, mert ez a lezáró hibakezelő.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // eslint-disable-next-line no-console -- szándékos: ez a végső,
  // szerver-oldali hibanaplózás, nem adatfolyam-logolás; lásd
  // packages/core/src/lib/knowledge/debug-retrieval.ts hasonló mintáját.
  console.error(err)
  res.status(500).json({ error: 'Szerver hiba történt.' })
}

export function createApp(): Express {
  const app = express()
  app.use(express.json())
  app.use(cookieParser())
  app.use(attachAccount)
  app.use(authRouter)
  app.use(chatRouter)
  app.use(debugRouter)
  app.use(staffOrdersRouter)
  app.use(staffEscalationsRouter)

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' })
  })

  // FONTOS: ennek az utolsó `app.use`-nak kell lennie. Csak az itt, a
  // `createApp()`-on BELÜL regisztrált route-okra/middleware-ekre terjed ki
  // a hibakezelés — ha valaki a `createApp()` visszatérése UTÁN ad hozzá egy
  // routert a kapott `app`-hoz, azokra ez az `errorHandler` NEM fog
  // vonatkozni.
  app.use(errorHandler)

  return app
}
