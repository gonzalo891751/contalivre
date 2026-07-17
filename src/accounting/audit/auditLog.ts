/**
 * Audit log append-only — Fase 2A
 *
 * Registro de eventos relevantes del núcleo contable. Solo se agregan
 * eventos; nunca se modifican ni eliminan. En modo local el actor es una
 * identidad local explícita ('local-user'); no simula autenticación real.
 */

import { db, generateId } from '../../storage/db'
import type { AuditEvent, AuditEventType } from '../domain/types'

export interface AuditEventInput {
    eventType: AuditEventType
    entityType: AuditEvent['entityType']
    entityId: string
    companyId?: string
    exerciseId?: string
    actorId: string
    before?: unknown
    after?: unknown
    reason?: string
    metadata?: Record<string, unknown>
}

/**
 * Agrega un evento al audit log. Debe invocarse dentro de la misma
 * transacción Dexie que la operación auditada cuando sea posible.
 */
export async function appendAuditEvent(input: AuditEventInput): Promise<AuditEvent> {
    const event: AuditEvent = {
        id: generateId(),
        timestamp: new Date().toISOString(),
        ...input,
    }
    await db.auditLog.add(event)
    return event
}

/** Consulta de eventos por entidad (para pantallas de detalle) */
export async function getAuditEventsForEntity(entityId: string): Promise<AuditEvent[]> {
    return db.auditLog.where('entityId').equals(entityId).sortBy('timestamp')
}
