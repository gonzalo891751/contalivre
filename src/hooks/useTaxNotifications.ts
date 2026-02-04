/**
 * Hook for managing tax due date notifications
 * Uses Dexie liveQuery for reactive updates
 */

import { useCallback } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import type { TaxDueNotification, DueDateCard } from '../core/impuestos/types'
import { calculateDaysRemaining } from '../core/impuestos/types'
import {
    listDueNotifications,
    markNotificationSeen,
    dismissNotification,
} from '../storage/impuestos'

export interface UseTaxNotificationsReturn {
    // Data
    notifications: TaxDueNotification[]
    upcomingCards: DueDateCard[]
    unreadCount: number

    // Loading
    isLoading: boolean

    // Actions
    markSeen: (id: string) => Promise<void>
    dismiss: (id: string) => Promise<void>
    markAllSeen: () => Promise<void>
}

/**
 * Convert notification to display card format
 */
function notificationToCard(notif: TaxDueNotification): DueDateCard {
    const daysRemaining = calculateDaysRemaining(notif.dueDate)
    const progress = Math.max(0, Math.min(100, 100 - (daysRemaining / 30) * 100))

    let status: DueDateCard['status'] = 'PENDING'
    let statusLabel = 'PENDIENTE'

    if (notif.status === 'PAID') {
        status = 'PAID'
        statusLabel = 'PAGADO'
    } else if (notif.status === 'SUBMITTED') {
        status = 'AL_DIA'
        statusLabel = 'AL DIA'
    } else if (daysRemaining < 0) {
        status = 'OVERDUE'
        statusLabel = 'VENCIDO'
    } else if (daysRemaining <= 5) {
        status = 'PENDING'
        statusLabel = 'PENDIENTE'
    } else {
        status = 'AL_DIA'
        statusLabel = 'AL DIA'
    }

    return {
        id: notif.id,
        title: notif.title,
        description: notif.description,
        dueDate: notif.dueDate,
        daysRemaining,
        progress,
        status,
        statusLabel,
        actionLabel: notif.actionLabel,
        actionHref: notif.actionHref,
        obligation: notif.obligation,
        month: notif.month,
        action: notif.action,
        jurisdiction: notif.jurisdiction,
        uniqueKey: notif.uniqueKey,
    }
}

export function useTaxNotifications(options?: {
    from?: string
    to?: string
    unseenOnly?: boolean
}): UseTaxNotificationsReturn {
    // Live query for notifications
    const notifications = useLiveQuery(
        async () => {
            return listDueNotifications(options)
        },
        [options?.from, options?.to, options?.unseenOnly],
        []
    )

    const isLoading = notifications === undefined

    // Convert to display cards
    const upcomingCards = (notifications || []).map(notificationToCard)

    // Count unread
    const unreadCount = (notifications || []).filter(n => !n.seen).length

    // Mark as seen
    const markSeen = useCallback(async (id: string) => {
        await markNotificationSeen(id)
    }, [])

    // Dismiss
    const dismiss = useCallback(async (id: string) => {
        await dismissNotification(id)
    }, [])

    // Mark all as seen
    const markAllSeen = useCallback(async () => {
        const unseen = (notifications || []).filter(n => !n.seen)
        for (const n of unseen) {
            await markNotificationSeen(n.id)
        }
    }, [notifications])

    return {
        notifications: notifications || [],
        upcomingCards,
        unreadCount,
        isLoading: isLoading as boolean,
        markSeen,
        dismiss,
        markAllSeen,
    }
}

/**
 * Hook specifically for the notification bell in TopHeader
 * Shows upcoming notifications within next 30 days
 */
export function useUpcomingTaxNotifications() {
    const today = new Date()
    const sevenDaysFromNow = new Date(today)
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)
    const threeHundredDaysAgo = new Date(today)
    threeHundredDaysAgo.setDate(threeHundredDaysAgo.getDate() - 300)

    const from = threeHundredDaysAgo.toISOString().split('T')[0]
    const to = sevenDaysFromNow.toISOString().split('T')[0]

    return useTaxNotifications({ from, to })
}
