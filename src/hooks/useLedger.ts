import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../storage/db'
import { computeLedger } from '../core/ledger'
import { usePeriodYear } from './usePeriodYear'

/**
 * Mayor del ejercicio seleccionado (Fase 2A).
 *
 * Aislamiento por contexto: solo asientos del rango de fechas del ejercicio
 * seleccionado, y solo los que integran los libros (POSTED / REVERSED;
 * nunca borradores). Consulta indexada por fecha, no toArray() global.
 */
export function useLedger() {
    const { start, end } = usePeriodYear()
    const accounts = useLiveQuery(() => db.accounts.orderBy('code').toArray())
    const entries = useLiveQuery(
        () => db.entries
            .where('date')
            .between(start, end, true, true)
            .toArray()
            .then(list => list.filter(e => e.status !== 'DRAFT')),
        [start, end]
    )

    const ledger = useMemo(() => {
        if (!accounts || !entries) return null
        return computeLedger(entries, accounts)
    }, [accounts, entries])

    return { accounts, entries, ledger }
}
