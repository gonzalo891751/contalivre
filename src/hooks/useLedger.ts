import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../storage/db'
import { computeLedger } from '../core/ledger'

export function useLedger() {
    const accounts = useLiveQuery(() => db.accounts.orderBy('code').toArray())
    const entries = useLiveQuery(() => db.entries.toArray())

    const ledger = useMemo(() => {
        if (!accounts || !entries) return null
        return computeLedger(entries, accounts)
    }, [accounts, entries])

    return { accounts, entries, ledger }
}
