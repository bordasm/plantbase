// Ezt a modult a main.ts a LEGELSŐ import-ként importálja (mellékhatásért,
// az exportjai nélkül), hogy a `.env` betöltése minden más modul
// kiértékelése ELŐTT megtörténjen. Enélkül az esbuild CJS kimenetben a
// `require()` hívások deklarációs sorrendben futnak le a főmodul saját
// kódja előtt, így pl. `middleware/session.ts` és `lib/session-store.ts`
// modulszinten olvasott `process.env` értékei már a betöltés előtti
// (alapértelmezett) állapotot fagyasztanák be — ez csak `nx run server:serve`
// alatt maradt rejtve, mert az Nx maga injektálja a `.env`-et a folyamat
// környezetébe, mielőtt a Node elindulna. Közvetlen
// `node apps/server/dist/main.js` indításnál (pl. a CLI-nél) ez a bug
// ténylegesen jelentkezett volna.
try {
  process.loadEnvFile()
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
}
