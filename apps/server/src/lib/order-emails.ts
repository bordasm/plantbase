import { prisma } from '@plantbase/db'
import {
  composeOrderEmail,
  sendSimulatedEmail,
  type OrderEmailData,
  type OrderEmailEventType,
} from '@plantbase/core'

/**
 * Fire-and-forget: sosem dob, sosem várja meg a hívó. Minden hiba (LLM,
 * fiók-lookup, fájlrendszer) csak logolódik -- a rendelés-műveletet ez
 * nem befolyásolhatja.
 */
export function notifyOrderEvent(
  order: OrderEmailData,
  accountId: number,
  eventType: OrderEmailEventType,
): void {
  void (async () => {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    })
    if (!account) return
    const { subject, body } = await composeOrderEmail(
      order,
      { fullName: account.fullName, salutation: account.salutation },
      eventType,
    )
    await sendSimulatedEmail({
      recipientLabel: account.fullName,
      recipientAddress: account.email,
      subject,
      body,
    })
  })().catch((err: unknown) => {
    console.error('Rendelés-értesítő e-mail küldése sikertelen:', err)
  })
}
