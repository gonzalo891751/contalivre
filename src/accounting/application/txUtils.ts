/**
 * Utilidades transaccionales — Fase 2A
 *
 * El servicio de contabilización debe poder ejecutarse:
 * a) standalone (abre su propia transacción Dexie), o
 * b) dentro de la transacción de un módulo operativo (operación + asiento
 *    atómicos), en cuyo caso REUTILIZA la transacción del llamador.
 *
 * Cuando un módulo envuelva llamadas al servicio en una transacción propia,
 * debe incluir las tablas de JOURNAL_TX_TABLES (ver journalService).
 */

import Dexie, { type Table } from 'dexie'
import { db } from '../../storage/db'

/**
 * Ejecuta `fn` dentro de una transacción de escritura sobre `tables`.
 * Si ya existe una transacción activa (módulo llamador), la reutiliza:
 * Dexie encadena las operaciones a la transacción vigente.
 */
export async function inWriteTx<T>(tables: Table[], fn: () => Promise<T>): Promise<T> {
    if (Dexie.currentTransaction) {
        return fn()
    }
    return db.transaction('rw', tables, fn)
}
