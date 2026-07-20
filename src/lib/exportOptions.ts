/**
 * Opciones de exportación formal de estados — Fase 2D (§3).
 *
 * Diferencian la vista web amigable de la EXPORTACIÓN formal (RT 54 T.O. por
 * RT 59, FACPCE/CENCyA). El usuario elige contenido, formato, método del EFE,
 * expresión monetaria y si se sella como borrador. Todas las cifras salen del
 * mismo ReportingBundle: la exportación no recalcula nada.
 */

export type ExportFormat = 'PDF_FORMAL' | 'SPREADSHEET'
export type EfeMethodChoice = 'DIRECT' | 'INDIRECT' | 'BOTH'
export type CurrencyChoice = 'NOMINAL' | 'CLOSING'

export interface ExportContentSelection {
    esp: boolean
    er: boolean
    eepn: boolean
    efe: boolean
    notas: boolean
    /** anexos 2E: gastos por función, CMV, bienes de uso, moneda extranjera */
    anexos: boolean
    indicadores: boolean
    analisis: boolean
}

export interface ExportEstadosOptions {
    format: ExportFormat
    content: ExportContentSelection
    efeMethod: EfeMethodChoice
    /** La moneda de cierre solo aplica al EFE y requiere índices cargados */
    currency: CurrencyChoice
    comparative: boolean
    /** Sella "BORRADOR" aunque el reporte fuera publicable */
    markDraft: boolean
}

export const DEFAULT_EXPORT_CONTENT: ExportContentSelection = {
    esp: true,
    er: true,
    eepn: true,
    efe: true,
    notas: true,
    anexos: true,
    indicadores: false,
    analisis: false,
}

export function defaultExportOptions(hasComparative: boolean): ExportEstadosOptions {
    return {
        format: 'PDF_FORMAL',
        content: { ...DEFAULT_EXPORT_CONTENT },
        efeMethod: 'DIRECT',
        currency: 'NOMINAL',
        comparative: hasComparative,
        markDraft: false,
    }
}

/** Un contenido seleccionado como mínimo para poder exportar. */
export function hasAnyContent(c: ExportContentSelection): boolean {
    return c.esp || c.er || c.eepn || c.efe || c.notas || c.anexos || c.indicadores || c.analisis
}
