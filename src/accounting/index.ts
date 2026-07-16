/**
 * API pública del núcleo contable — Fase 2A
 *
 * Los módulos operativos y la UI deben importar desde acá.
 * La escritura directa en db.entries está prohibida fuera de
 * src/accounting/repositories/journalRepository.ts.
 */

export * from './domain/types'
export * from './domain/money'
export * from './domain/idempotency'
export * from './validation/validatePosting'
export * from './taxonomy/taxonomy'
export {
    createDraftEntry,
    updateDraftEntry,
    deleteDraftEntry,
    postDraft,
    postNewEntry,
    postOperation,
    reverseEntry,
    replaceOperationEntry,
    updateEntrySourceLink,
    voidOperationEntry,
    voidOperationEntries,
    resetJournal,
    JOURNAL_TX_TABLES,
} from './application/journalService'
export {
    getDefaultCompany,
    listExercises,
    getExercise,
    getExerciseForDate,
    ensureExerciseForDate,
    createExercise,
    closeExercise,
    reopenExercise,
    getPeriodForDate,
    closePeriod,
    reopenPeriod,
    getSystemMeta,
    setCurrentExercise,
    DEFAULT_COMPANY_ID,
    exerciseIdForYear,
} from './application/contextService'
export { appendAuditEvent, getAuditEventsForEntity } from './audit/auditLog'
export {
    resolveContextForYear,
    getEntriesForContext,
    getOpeningBalances,
    isBookEntry,
    type ReportingContext,
} from './reporting/reportingContext'
export { exportBackup, previewBackup, restoreBackup, type BackupFile } from './backup/backupService'
export { MIGRATION_ID } from './migration/migrateV17'
export { MIGRATION_V18_ID } from './migration/migrateV18'
export {
    CURRENT_SCHEMA_VERSION as SCHEMA_VERSION,
    APP_VERSION,
    ACCOUNTING_ENGINE_VERSION,
    NORMATIVE_BASELINE,
} from './migration/versions'
