import { db } from './db'
import { deleteEntry } from './entries'
import { unlinkJournalFromRun, unlinkPaymentFromRun } from './payroll'

export interface JournalDeleteResult {
    mode: 'deleted' | 'payroll_unposted' | 'payroll_payment_unlinked'
    message: string
}

export async function deleteJournalEntryWithSync(entryId: string): Promise<JournalDeleteResult> {
    const entry = await db.entries.get(entryId)
    if (!entry) throw new Error('Asiento no encontrado')

    if (entry.sourceModule === 'payroll' && entry.sourceId) {
        if (entry.sourceType === 'accrual') {
            await unlinkJournalFromRun(entry.sourceId, entry.id, 'journal_delete')
            await deleteEntry(entry.id)
            return {
                mode: 'payroll_unposted',
                message: 'Asiento de sueldos anulado y liquidacion vuelta a borrador.',
            }
        }

        if (entry.sourceType === 'salary_payment' || entry.sourceType === 'social_security_payment') {
            await unlinkPaymentFromRun(entry.sourceId, entry.id, 'journal_delete')
            await deleteEntry(entry.id)
            return {
                mode: 'payroll_payment_unlinked',
                message: 'Pago de sueldos desvinculado y eliminado del Diario.',
            }
        }
    }

    await deleteEntry(entry.id)
    return {
        mode: 'deleted',
        message: 'Asiento eliminado.',
    }
}
