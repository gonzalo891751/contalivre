import type { BienesMovement, TaxLine } from './types'

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

const normalizeText = (value?: string) => (value || '').trim().toLowerCase()

const safeIncludes = (haystack?: string, needle?: string) => {
    const h = normalizeText(haystack)
    const n = normalizeText(needle)
    if (!h || !n) return false
    return h.includes(n)
}

type AdjustmentKind = 'credit_note' | 'debit_note'
type ApplicationKind = AdjustmentKind | 'payment'

export interface OpenItemApplication {
    movementId: string
    date: string
    reference: string
    kind: ApplicationKind
    amount: number
    subtotal: number
    ivaAmount: number
    taxes: TaxLine[]
    linkedBy: 'explicit' | 'legacy'
}

export interface OpenItem {
    docId: string
    movementId: string
    date: string
    reference: string
    counterparty: string
    dueDate?: string
    ivaRate: number
    originalTotal: number
    originalSubtotal: number
    originalIva: number
    originalTaxes: TaxLine[]
    saldoActual: number
    ajustesAplicados: number
    pagosAplicados: number
    pendingSubtotal: number
    pendingIva: number
    pendingTaxes: TaxLine[]
    applications: OpenItemApplication[]
}

export interface OpenItemsResult {
    items: OpenItem[]
    unlinkedCount: number
}

interface CandidateApplication {
    movement: BienesMovement
    kind: ApplicationKind
    amount: number
    subtotal: number
    ivaAmount: number
    taxes: TaxLine[]
    paymentDirection?: string
}

const getExplicitDocLink = (movement: BienesMovement): string | undefined => {
    return movement.appliesToDocId || movement.sourceMovementId
}

const getLegacyDocLink = (
    movement: BienesMovement,
    docs: BienesMovement[]
): string | undefined => {
    const notes = movement.notes || ''
    const reference = movement.reference || ''
    const counterparty = normalizeText(movement.counterparty)
    const matchingDocs = docs.filter(doc => {
        if (!counterparty) return true
        return normalizeText(doc.counterparty) === counterparty
    })
    const byId = matchingDocs.find(doc => safeIncludes(notes, doc.id))
    if (byId) return byId.id
    const byReferenceInNotes = matchingDocs.find(doc => doc.reference && safeIncludes(notes, doc.reference))
    if (byReferenceInNotes) return byReferenceInNotes.id
    if (reference) {
        const sameRef = matchingDocs.filter(doc => normalizeText(doc.reference) === normalizeText(reference))
        if (sameRef.length === 1) return sameRef[0].id
    }
    return undefined
}

const mergeTaxes = (base: TaxLine[], applied: TaxLine[], sign: -1 | 1): TaxLine[] => {
    const map = new Map<string, TaxLine>()
    base.forEach((tax, idx) => {
        const key = `${tax.kind}:${tax.taxType}:${tax.accountId || ''}:${idx}`
        map.set(key, { ...tax, amount: round2(tax.amount) })
    })
    applied.forEach((tax, idx) => {
        const key = `${tax.kind}:${tax.taxType}:${tax.accountId || ''}:${idx}`
        const current = map.get(key) || { ...tax, amount: 0 }
        current.amount = round2((current.amount || 0) + sign * (tax.amount || 0))
        map.set(key, current)
    })
    return Array.from(map.values()).filter(t => Math.abs(t.amount) > 0.01)
}

const buildOpenItems = (
    documents: BienesMovement[],
    candidates: CandidateApplication[]
): OpenItemsResult => {
    const byDoc = new Map<string, CandidateApplication[]>()
    let unlinkedCount = 0

    for (const candidate of candidates) {
        const explicit = getExplicitDocLink(candidate.movement)
        const explicitDoc = explicit && documents.find(doc => doc.id === explicit)
        if (explicitDoc) {
            byDoc.set(explicitDoc.id, [...(byDoc.get(explicitDoc.id) || []), candidate])
            continue
        }
        const legacy = getLegacyDocLink(candidate.movement, documents)
        if (legacy) {
            byDoc.set(legacy, [...(byDoc.get(legacy) || []), candidate])
            continue
        }
        unlinkedCount++
    }

    const items: OpenItem[] = documents.map(doc => {
        const applications = (byDoc.get(doc.id) || [])
            .map(app => {
                const explicitDoc = getExplicitDocLink(app.movement)
                return {
                    movementId: app.movement.id,
                    date: app.movement.date,
                    reference: app.movement.reference || app.movement.id.slice(0, 8),
                    kind: app.kind,
                    amount: round2(app.amount),
                    subtotal: round2(app.subtotal),
                    ivaAmount: round2(app.ivaAmount),
                    taxes: app.taxes || [],
                    linkedBy: explicitDoc === doc.id ? 'explicit' : 'legacy',
                } as OpenItemApplication
            })
            .sort((a, b) => a.date.localeCompare(b.date))

        const creditNotesTotal = applications
            .filter(a => a.kind === 'credit_note')
            .reduce((sum, a) => sum + a.amount, 0)
        const debitNotesTotal = applications
            .filter(a => a.kind === 'debit_note')
            .reduce((sum, a) => sum + a.amount, 0)
        const paymentsTotal = applications
            .filter(a => a.kind === 'payment')
            .reduce((sum, a) => sum + a.amount, 0)

        const saldo = round2((doc.total || 0) - creditNotesTotal + debitNotesTotal - paymentsTotal)
        const saldoActual = saldo <= 0.01 ? 0 : saldo

        const creditSubtotal = applications
            .filter(a => a.kind === 'credit_note')
            .reduce((sum, a) => sum + a.subtotal, 0)
        const creditIva = applications
            .filter(a => a.kind === 'credit_note')
            .reduce((sum, a) => sum + a.ivaAmount, 0)
        const debitSubtotal = applications
            .filter(a => a.kind === 'debit_note')
            .reduce((sum, a) => sum + a.subtotal, 0)
        const debitIva = applications
            .filter(a => a.kind === 'debit_note')
            .reduce((sum, a) => sum + a.ivaAmount, 0)
        const creditTaxes = applications
            .filter(a => a.kind === 'credit_note')
            .reduce((acc, a) => mergeTaxes(acc, a.taxes, -1), doc.taxes || [])
        const afterAdjustTaxes = applications
            .filter(a => a.kind === 'debit_note')
            .reduce((acc, a) => mergeTaxes(acc, a.taxes, +1), creditTaxes)

        const adjustedSubtotal = round2((doc.subtotal || 0) - creditSubtotal + debitSubtotal)
        const adjustedIva = round2((doc.ivaAmount || 0) - creditIva + debitIva)
        const adjustedTotal = round2((doc.total || 0) - creditNotesTotal + debitNotesTotal)
        const ratio = adjustedTotal > 0 ? Math.max(0, Math.min(1, saldoActual / adjustedTotal)) : 0

        const pendingSubtotal = round2(adjustedSubtotal * ratio)
        const pendingIva = round2(adjustedIva * ratio)
        const pendingTaxes = afterAdjustTaxes
            .map(t => ({ ...t, amount: round2((t.amount || 0) * ratio) }))
            .filter(t => Math.abs(t.amount) > 0.01)

        return {
            docId: doc.id,
            movementId: doc.id,
            date: doc.date,
            reference: doc.reference || doc.id.slice(0, 8),
            counterparty: doc.counterparty || 'Sin tercero',
            dueDate: doc.dueDate,
            ivaRate: doc.ivaRate || 21,
            originalTotal: round2(doc.total || 0),
            originalSubtotal: round2(doc.subtotal || 0),
            originalIva: round2(doc.ivaAmount || 0),
            originalTaxes: doc.taxes || [],
            saldoActual,
            ajustesAplicados: round2(creditNotesTotal - debitNotesTotal),
            pagosAplicados: round2(paymentsTotal),
            pendingSubtotal,
            pendingIva,
            pendingTaxes,
            applications,
        } as OpenItem
    })
        .filter(item => item.saldoActual > 0.01)
        .sort((a, b) => a.date.localeCompare(b.date))

    return { items, unlinkedCount }
}

export function computeOpenItemsByDirection(
    movements: BienesMovement[] | undefined,
    direction: 'COBRO' | 'PAGO',
    counterparty?: string
): OpenItemsResult {
    if (!movements || movements.length === 0) {
        return { items: [], unlinkedCount: 0 }
    }

    const targetType = direction === 'COBRO' ? 'SALE' : 'PURCHASE'
    const normalizedCounterparty = normalizeText(counterparty)
    const byCounterparty = (movement: BienesMovement) => {
        if (!normalizedCounterparty) return true
        return normalizeText(movement.counterparty) === normalizedCounterparty
    }

    const documents = movements.filter(m =>
        m.type === targetType &&
        !m.isDevolucion &&
        (m.total || 0) > 0 &&
        byCounterparty(m)
    )

    const adjustmentKinds = direction === 'COBRO'
        ? new Set(['BONUS_SALE', 'DISCOUNT_SALE'])
        : new Set(['BONUS_PURCHASE', 'DISCOUNT_PURCHASE'])

    const candidates: CandidateApplication[] = []
    for (const movement of movements) {
        if (!byCounterparty(movement)) continue

        if (movement.type === 'PAYMENT' && movement.paymentDirection === direction) {
            candidates.push({
                movement,
                kind: 'payment',
                amount: Math.abs(movement.total || 0),
                subtotal: 0,
                ivaAmount: 0,
                taxes: [],
                paymentDirection: movement.paymentDirection,
            })
            continue
        }

        if (movement.type === targetType && movement.isDevolucion) {
            candidates.push({
                movement,
                kind: 'credit_note',
                amount: Math.abs(movement.total || 0),
                subtotal: Math.abs(movement.subtotal || 0),
                ivaAmount: Math.abs(movement.ivaAmount || 0),
                taxes: (movement.taxes || []).map(t => ({ ...t, amount: Math.abs(t.amount || 0) })),
            })
            continue
        }

        if (movement.type === 'VALUE_ADJUSTMENT' && movement.adjustmentKind && adjustmentKinds.has(movement.adjustmentKind)) {
            candidates.push({
                movement,
                kind: 'credit_note',
                amount: Math.abs(movement.total || 0),
                subtotal: Math.abs(movement.subtotal || 0),
                ivaAmount: Math.abs(movement.ivaAmount || 0),
                taxes: (movement.taxes || []).map(t => ({ ...t, amount: Math.abs(t.amount || 0) })),
            })
        }
    }

    return buildOpenItems(documents, candidates)
}
