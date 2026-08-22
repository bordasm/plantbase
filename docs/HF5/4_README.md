# Plantbase — mit csinál a rendszer

> Ez a dokumentum a rendszer állapotát írja le. A gyökér `README.md` a technikai részletekhez (költségbecslés, hibaelhárítás) mutat.

## Mit csinál

A Plantbase egy magyar nyelvű, AI-agent-alapú ügyfélszolgálati rendszer egy növény-webshophoz. Három belépési ponton érhető el:

- **CLI** (`apps/cli`) — fiók nélküli, egyszeri vagy interaktív katalógus-lekérdezés természetes nyelven.
- **Express szerver** (`apps/server`) — REST API + streamelt chat-végpont, munkamenet-alapú bejelentkezéssel.
- **React web UI** (`apps/web`) — bejelentkezéses böngészős chat felület az ügyfeleknek, illetve rendelés-/eszkaláció-/metrika-/fiók-kezelő felület a staffnak.

**Ügyfélként** a rendszer: válaszol a növénykatalógusról és gondozásról szóló kérdésekre (tudásbázis-kereséssel), segít rendelést indítani (megerősítéssel, opcionális e-mail-értesítéssel), és megmutatja a saját rendelés(ek) státuszát. Ha a kérés a Plantbase funkciójához tartozik, de az agent nem tud segíteni, egy ügyintézőhöz továbbítja az ügyet. Ha a kérdés nem idevág, udvariasan elutasítja, eszkaláció nélkül.

**Staffként/adminként** a rendszer: rendelés-lista és -szerkesztés (státusz, fizetettség, mezőkorrekció, minden változás naplózva), eszkaláció-lista, élő metrikák (munkaidőn-kívüli forgalom aránya, eszkalációs arány), és fiók-lista anonimizálási lehetőséggel.

Az e-mail-küldés jelenleg csak szimulált: minden "elküldött" e-mail egy `.md` fájl az `/emails` könyvtárban.

## Hogyan indul, mi kell hozzá

**Előfeltétel:** Docker (Postgres + pgvector), Node.js/pnpm, `ANTHROPIC_API_KEY` és `OPENAI_API_KEY` beállítva (`.env`, lásd `.env.example`).

```bash
docker compose up -d
pnpm exec prisma migrate deploy   # packages/db
pnpm exec prisma db seed          # packages/db — products katalógus
```

**Tudásbázis (gondozási kérdésekhez, opcionális de ajánlott):**

```bash
npx nx build core
cd packages/db && npx tsx prisma/seed-knowledge.ts
```

**Szerver + web UI (két terminálban):**

```bash
pnpm dev:server   # Express, http://localhost:3000
pnpm dev:web      # Vite, http://localhost:4200
```

Regisztrálj egy ügyfél-fiókot (teljes név, megszólítás, e-mail, jelszó — min. 8 karakter, kis/nagybetű és szám), jelentkezz be, és chatelhetsz az agenttel.

**Staff/admin teszt-fiók:**

```bash
pnpm --filter @plantbase/db exec tsx prisma/seed-staff.ts
```

Ezzel bejelentkezve (`staff@plantbase.hu` / `Staff1234` vagy `admin@plantbase.hu` / `Admin1234`) a web UI a rendelés-/eszkaláció-/metrika-/fiók-kezelő felületet mutatja chat helyett.

**Régi (`/emails`) fájlok megőrzési takarítása** (kézzel vagy külső cronnal, nincs beépített időzítő):

```bash
pnpm --filter @plantbase/db exec tsx prisma/cleanup-old-emails.ts
```

**CLI, önállóan (fiók nélkül):**

```bash
pnpm cli ask "Milyen alacsony fényigényű szobanövény van raktáron?"
```
