import { prisma } from '@plantbase/db'
import { sendSimulatedEmail } from '@plantbase/core'

const STAFF_EMAIL_ADDRESS = 'ugyfelszolgalat@plantbase.hu'
const STAFF_RECIPIENT_LABEL = 'ügyfélszolgálat'

/**
 * Fire-and-forget: sosem dob, sosem várja meg a hívó. Minden hiba (fiók-
 * lookup, fájlrendszer) csak logolódik -- az eszkaláció-létrehozást ez nem
 * befolyásolhatja. A tartalom SZÁNDÉKOSAN determinisztikus (nincs LLM-hívás)
 * -- lásd a fájl szintjén a modult importáló task leírását.
 */
export function notifyEscalation(
  escalationId: number,
  accountId: number,
  summary: string,
): void {
  void (async () => {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    })
    if (!account) return

    const subject = `Eszkaláció #${escalationId} — ${account.fullName}`
    const body = `Ügyfél: ${account.fullName} (${account.email})
Megszólítás: ${account.salutation}
Eszkaláció-azonosító: #${escalationId}

Az agent összefoglalója (nem ellenőrzött, az agent saját megfogalmazása az ügyfél kérése alapján):
${summary}`

    await sendSimulatedEmail({
      recipientLabel: STAFF_RECIPIENT_LABEL,
      recipientAddress: STAFF_EMAIL_ADDRESS,
      subject,
      body,
    })
  })().catch((err: unknown) => {
    console.error('Eszkalációs e-mail küldése sikertelen:', err)
  })
}
