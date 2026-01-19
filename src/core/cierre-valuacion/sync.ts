import type { JournalEntry } from '../models';
import type { AsientoBorrador } from './types';

/**
 * Builds a stable key for a voucher to link it with a JournalEntry metadata.
 */
export function buildVoucherKey(cierreId: string, voucherKey: string): string {
    // e.g. "cierre_123:RT6_HABER"
    return `${cierreId}:${voucherKey}`;
}

/**
 * Computes a deterministic hash of the voucher payload to detect changes.
 */
export function computeVoucherHash(voucher: AsientoBorrador, date: string): string {
    const payload = {
        date,
        memo: voucher.descripcion,
        lines: (voucher.lineas || [])
            .map(l => ({
                accountId: l.accountId || '',
                debit: Number(l.debe.toFixed(2)),
                credit: Number(l.haber.toFixed(2))
            }))
            .sort((a, b) => a.accountId.localeCompare(b.accountId))
    };

    return JSON.stringify(payload);
}

/**
 * Finds a JournalEntry that matches a specific voucher key from a list of entries.
 */
export function findEntryByVoucherKey(entries: JournalEntry[], cierreId: string, voucherKey: string): JournalEntry | undefined {
    return entries.find(e =>
        e.metadata?.source === 'cierre' &&
        e.metadata?.cierreId === cierreId &&
        e.metadata?.voucherKey === voucherKey
    );
}
