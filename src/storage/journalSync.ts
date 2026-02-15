import { db } from './db'
import { deleteEntry } from './entries'
import { unlinkJournalFromRun, unlinkPaymentFromRun } from './payroll'
import { OPS_MODULE } from './ops'

export interface JournalDeleteResult {
    mode: 'deleted' | 'payroll_unposted' | 'payroll_payment_unlinked' | 'ops_voucher_cascade' | 'ops_payment_deleted'
    message: string
    deletedPayments?: number
}

export async function deleteJournalEntryWithSync(entryId: string): Promise<JournalDeleteResult> {
    const entry = await db.entries.get(entryId)
    if (!entry) throw new Error('Asiento no encontrado')

    // ── Payroll sync ──
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

    // ── Ops (Gastos y Servicios) sync ──
    if (entry.sourceModule === OPS_MODULE) {
        if (entry.sourceType === 'vendor_invoice') {
            // Cascade: delete all payments linked to this voucher
            const linkedPayments = await db.entries
                .where('sourceModule')
                .equals(OPS_MODULE)
                .toArray()
            const paymentsToDelete = linkedPayments.filter(
                p => p.sourceType === 'payment' && p.metadata?.applyTo?.entryId === entryId,
            )
            for (const payment of paymentsToDelete) {
                await deleteEntry(payment.id)
            }
            await deleteEntry(entry.id)
            return {
                mode: 'ops_voucher_cascade',
                message: paymentsToDelete.length > 0
                    ? `Comprobante y ${paymentsToDelete.length} pago(s) vinculado(s) eliminados.`
                    : 'Comprobante de gasto eliminado.',
                deletedPayments: paymentsToDelete.length,
            }
        }

        if (entry.sourceType === 'payment') {
            await deleteEntry(entry.id)
            return {
                mode: 'ops_payment_deleted',
                message: 'Pago de gasto eliminado.',
            }
        }
    }

    await deleteEntry(entry.id)
    return {
        mode: 'deleted',
        message: 'Asiento eliminado.',
    }
}
