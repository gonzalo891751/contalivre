/**
 * Declaración de alcance real — Fase 2B (§16).
 *
 * La UI y la documentación deben mostrar exactamente qué soporta el sistema.
 * No se presenta como soportado lo que no está implementado de verdad.
 */

export type CapabilityStatus = 'SUPPORTED' | 'PARTIAL' | 'EDUCATIONAL_ONLY' | 'NOT_SUPPORTED'

export interface Capability {
    id: string
    label: string
    status: CapabilityStatus
    detail: string
}

export const CAPABILITIES: Capability[] = [
    { id: 'comercial', label: 'Entidad comercial (compra-venta)', status: 'EDUCATIONAL_ONLY', detail: 'Juego completo ESP/ER/EEPN/EFE con validación automática, en modo laboratorio educativo local (sin certificación profesional).' },
    { id: 'servicios', label: 'Entidad de servicios', status: 'EDUCATIONAL_ONLY', detail: 'Mismo alcance que la entidad comercial.' },
    { id: 'diario-mayor', label: 'Diario, Mayor y Balance de comprobación', status: 'SUPPORTED', detail: 'Puerta única de contabilización, ciclo DRAFT/POSTED/REVERSED, reversión uniforme, aislamiento por ejercicio.' },
    { id: 'cierre', label: 'Cierre, refundición y apertura', status: 'SUPPORTED', detail: 'Vista previa, borradores explicables, apertura patrimonial verificada, reapertura auditada.' },
    { id: 'efe', label: 'Estado de Flujo de Efectivo', status: 'SUPPORTED', detail: 'Fase 2G: directo/indirecto conciliados en moneda nominal y de cierre, flujo bruto en disposiciones de activos, comparativo, apertura modificada (AREA), REI en exportaciones, política EFE versionada, papel de trabajo matricial auditable con lineage por celda y snapshots con hash de contenido. Alcance educativo local, sin certificación profesional.' },
    { id: 'inflacion', label: 'Ajuste por inflación (RT 54 TO RT 59)', status: 'PARTIAL', detail: 'Motor nuevo con anticuación, índices versionados y RECPAM directo/indirecto conciliados y probados; la pantalla de cierre-valuación legacy sigue contenida (solo borradores) hasta su recableado. Requiere índices oficiales cargados por el usuario y validación profesional para uso real.' },
    { id: 'notas', label: 'Notas y anexos', status: 'PARTIAL', detail: 'Notas principales derivadas y reconciliadas; hechos posteriores/contingencias/partes relacionadas de carga manual.' },
    { id: 'indicadores', label: 'Indicadores y análisis V/H', status: 'SUPPORTED', detail: 'Contrato MetricResult sin ∞/NaN; promedios o advertencia explícita; días de cobranza/pago declarados insuficientes sin datos estructurados.' },
    { id: 'esfl', label: 'Entidades sin fines de lucro', status: 'NOT_SUPPORTED', detail: 'Sin modelos ni reglas específicas.' },
    { id: 'agro', label: 'Actividad agropecuaria', status: 'NOT_SUPPORTED', detail: 'Sin activos biológicos ni medición específica.' },
    { id: 'cooperativas', label: 'Cooperativas (RT 62)', status: 'NOT_SUPPORTED', detail: 'Sin capítulo cooperativo.' },
    { id: 'consolidados', label: 'Estados consolidados / negocios conjuntos', status: 'NOT_SUPPORTED', detail: 'Sin entidades múltiples ni eliminaciones.' },
    { id: 'discontinuadas', label: 'Operaciones discontinuadas', status: 'NOT_SUPPORTED', detail: 'Sin clasificación ni presentación separada.' },
    { id: 'multiusuario', label: 'Multiusuario / autenticación', status: 'NOT_SUPPORTED', detail: 'Modo local: identidad local explícita, sin roles reales.' },
]
