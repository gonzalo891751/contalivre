import { describe, it, expect } from 'vitest'
import { buildTaxNotificationKey, createDefaultNotification } from './types'

describe('tax notification keys', () => {
    it('builds a stable key by obligation/month/action/jurisdiction', () => {
        const key = buildTaxNotificationKey('IVA', '2025-01', 'PAGO', 'NACIONAL')
        expect(key).toBe('IVA:2025-01:PAGO:NACIONAL')
    })

    it('ignores title changes for dedupe', () => {
        const notifA = createDefaultNotification('IVA', '2025-01', '2025-02-18', {
            action: 'PAGO',
            title: 'Pago IVA',
            jurisdiction: 'NACIONAL',
        })
        const notifB = createDefaultNotification('IVA', '2025-01', '2025-02-18', {
            action: 'PAGO',
            title: 'Pago IVA Enero',
            jurisdiction: 'NACIONAL',
        })

        expect(notifA.uniqueKey).toBe(notifB.uniqueKey)
    })
})
