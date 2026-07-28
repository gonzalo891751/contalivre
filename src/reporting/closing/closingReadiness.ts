/**
 * Núcleo ÚNICO de controles del ejercicio — Fase 2J (§9).
 *
 * Un solo lugar decide si el ejercicio está en condiciones, y todos los
 * consumidores leen de acá: el tablero de pre-cierre, la publicación de los
 * estados, la exportación formal, la refundición y el cierre. Antes cada uno
 * tenía su propia idea del estado del ejercicio: la compuerta de publicación
 * corría 19 controles pero el cierre no los consultaba, así que un ejercicio con
 * el RECPAM sin conciliar o con cuentas sin clasificar podía cerrarse igual.
 *
 * Cada control declara a qué ETAPA del ciclo pertenece, qué se esperaba, qué se
 * obtuvo, la diferencia y su tolerancia cuando aplica, y —sobre todo— **qué hay
 * que hacer para resolverlo y dónde**. Nada de "no publicable" a secas.
 *
 * Función pura: la arma un cargador y la consumen la interfaz y los servicios.
 */

export type ReadinessStage =
    | 'RESUMEN'
    | 'COBERTURA'
    | 'AJUSTES'
    | 'INVENTARIO'
    | 'BIENES_USO'
    | 'MEDICIONES'
    | 'AXI'
    | 'RECPAM'
    | 'CONTROLES'
    | 'ESTADOS'
    | 'CIERRE'

export type StageStatus =
    | 'NO_INICIADA'
    | 'EN_PROCESO'
    | 'COMPLETA'
    | 'COMPLETA_CON_ADVERTENCIAS'
    | 'BLOQUEADA'
    | 'NO_APLICABLE'

/** Severidad del control: qué impide */
export type CheckSeverity = 'BLOQUEA' | 'ADVIERTE' | 'INFORMA'

export interface ReadinessCheck {
    id: string
    stage: ReadinessStage
    /** qué se está controlando, en lenguaje contable */
    label: string
    passed: boolean
    severity: CheckSeverity
    /** valor esperado y obtenido, cuando el control es numérico */
    expected?: number
    actual?: number
    difference?: number
    tolerance?: number
    /** por qué falla */
    detail?: string
    /** qué hacer para resolverlo */
    action?: string
    /** a dónde ir a resolverlo */
    link?: string
}

export interface StageReport {
    stage: ReadinessStage
    label: string
    description: string
    status: StageStatus
    /** motivo, obligatorio cuando el estado es NO_APLICABLE */
    reason?: string
    checks: ReadinessCheck[]
    blockingCount: number
    warningCount: number
}

export interface ClosingReadiness {
    /** todos los controles, en orden de etapa */
    checks: ReadinessCheck[]
    stages: StageReport[]
    /** controles que bloquean, en cualquier etapa */
    blockers: ReadinessCheck[]
    /**
     * Subconjunto que impide EMITIR estados. No incluye los controles de la
     * etapa de cierre: un ejercicio ya cerrado no está "listo para cerrarse" y
     * sin embargo es justamente cuando corresponde publicar sus estados
     * definitivos.
     */
    publishBlockers: ReadinessCheck[]
    warnings: ReadinessCheck[]
    /** los estados pueden emitirse y exportarse como definitivos */
    canPublish: boolean
    /** el ejercicio puede refundirse y cerrarse */
    canClose: boolean
    /** avance real: etapas completas sobre etapas aplicables */
    completedStages: number
    applicableStages: number
    checkedAt: string
}

export const STAGE_META: Record<ReadinessStage, { label: string; description: string }> = {
    RESUMEN: {
        label: 'Resumen del ejercicio',
        description: 'Identidad de la empresa, ejercicio, moneda y unidad de medida.',
    },
    COBERTURA: {
        label: 'Cobertura de cuentas',
        description: 'Toda cuenta con saldo o movimiento tiene un tratamiento declarado para el cierre.',
    },
    AJUSTES: {
        label: 'Ajustes y devengamientos',
        description: 'No quedan borradores pendientes ni asientos fuera del ejercicio.',
    },
    INVENTARIO: {
        label: 'Inventario y costo de ventas',
        description: 'El puente existencia inicial + compras − existencia final concilia con el Estado de Resultados.',
    },
    BIENES_USO: {
        label: 'Bienes de uso',
        description: 'El anexo concilia con el rubro del Estado de Situación Patrimonial, en moneda nominal y de cierre.',
    },
    MEDICIONES: {
        label: 'Mediciones a valores corrientes',
        description: 'Las partidas que exigen medición al cierre fueron medidas y su resultado por tenencia, reconocido.',
    },
    AXI: {
        label: 'Ajuste por inflación',
        description: 'La serie de índices cubre todo el ejercicio y cada partida tiene su anticuación.',
    },
    RECPAM: {
        label: 'RECPAM',
        description: 'Las dos determinaciones —secuencial y analítica— concilian dentro de la tolerancia.',
    },
    CONTROLES: {
        label: 'Controles finales',
        description: 'Partida doble, ecuación patrimonial, EEPN, EFE y anexos.',
    },
    ESTADOS: {
        label: 'Estados contables',
        description: 'Los estados están actualizados y en condiciones de publicarse.',
    },
    CIERRE: {
        label: 'Preparación del cierre',
        description: 'El ejercicio está abierto, sin bloqueos, y listo para la refundición.',
    },
}

const STAGE_ORDER: ReadinessStage[] = [
    'RESUMEN', 'COBERTURA', 'AJUSTES', 'INVENTARIO', 'BIENES_USO',
    'MEDICIONES', 'AXI', 'RECPAM', 'CONTROLES', 'ESTADOS', 'CIERRE',
]

/** Etapas cuyos bloqueos impiden emitir estados definitivos */
const PUBLISH_STAGES = new Set<ReadinessStage>([
    'COBERTURA', 'AJUSTES', 'INVENTARIO', 'BIENES_USO', 'MEDICIONES',
    'AXI', 'RECPAM', 'CONTROLES', 'ESTADOS',
])

export interface ReadinessInput {
    /** identidad y contexto */
    company: { legalName?: string; taxId?: string } | null
    exercise: { name: string; status: string; startDate: string; endDate: string } | null
    /** expresión solicitada: si no hay set de índices, las etapas AxI y RECPAM no aplican */
    inflationSet: { name: string; missingPeriods: string[] } | null
    /** cobertura de la matriz de tratamiento (null si no se pudo construir) */
    coverage: {
        accountsWithActivity: number
        accountsResolved: number
        coveragePct: number
        balanceCoveragePct: number
        pending: Array<{ code: string; name: string; reason: string }>
        missingPeriods: string[]
    } | null
    /** conciliación del RECPAM (null si no aplica) */
    recpam: { reconciled: boolean; difference: number; toleranceCents: number; blockers: string[] } | null
    /** controles del motor de estados */
    statementChecks: Array<{ id: string; label: string; passed: boolean; expected?: number; actual?: number; difference?: number; detail?: string }>
    /** bloqueos de la reexpresión de bienes de uso */
    fixedAssetsRestatedBlockers: string[]
    /** mediciones al cierre pendientes */
    measurements: { required: number; done: number; pending: Array<{ rubro: string; reason: string }> } | null
    /** borradores dentro del ejercicio */
    draftCount: number
    /** asientos con fecha fuera del rango del ejercicio activo */
    entriesOutsideExercise: number
    /** el juego de estados guardado quedó desactualizado respecto del Diario */
    staleSnapshot: boolean
}

/** A qué etapa pertenece cada control del motor de estados */
const CHECK_STAGE: Record<string, ReadinessStage> = {
    'journal-balance': 'CONTROLES',
    'opening-balance': 'CONTROLES',
    'ledger-journal': 'CONTROLES',
    equation: 'CONTROLES',
    'er-eepn': 'CONTROLES',
    'er-pretax': 'CONTROLES',
    'eepn-esp': 'CONTROLES',
    'unknown-accounts': 'COBERTURA',
    'unmapped-results': 'COBERTURA',
    'eepn-matrix-closing': 'CONTROLES',
    'eepn-matrix-internal': 'CONTROLES',
    'gastos-funcion': 'CONTROLES',
    'cmv-puente': 'INVENTARIO',
    'ppe-anexo': 'BIENES_USO',
    'efe-variacion': 'CONTROLES',
    'efe-esp': 'CONTROLES',
    'efe-metodos': 'CONTROLES',
    'efe-clasificacion': 'CONTROLES',
    'efe-disposicion': 'CONTROLES',
}

const CHECK_ACTION: Record<string, { action: string; link?: string }> = {
    'cmv-puente': {
        action: 'Revisá los movimientos de bienes de cambio: alguna salida no tiene su componente de costo declarado.',
        link: '/estados',
    },
    'ppe-anexo': {
        action: 'Conciliá el anexo de bienes de uso con el rubro del Estado de Situación Patrimonial.',
        link: '/operaciones/bienes-uso',
    },
    'efe-clasificacion': {
        action: 'Asigná categoría de flujo de efectivo a las cuentas que aparecen sin clasificar.',
        link: '/configuracion?seccion=plan-cuentas',
    },
    'efe-disposicion': {
        action: 'Resolvé las disposiciones a crédito o mixtas con un override auditable.',
        link: '/configuracion?seccion=plan-cuentas',
    },
    'unmapped-results': {
        action: 'Asigná grupo de exposición a las cuentas de resultado con saldo.',
        link: '/configuracion?seccion=plan-cuentas',
    },
    'unknown-accounts': {
        action: 'Regularizá los movimientos imputados a cuentas inexistentes.',
        link: '/asientos',
    },
}

export function buildClosingReadiness(input: ReadinessInput): ClosingReadiness {
    const checks: ReadinessCheck[] = []
    const add = (c: ReadinessCheck) => checks.push(c)

    // ── RESUMEN · identidad ──────────────────────────────────
    const nombre = input.company?.legalName?.trim() ?? ''
    const identidadOk = nombre !== '' && nombre !== 'Empresa ContaLivre' && !!input.company?.taxId
    add({
        id: 'identidad-empresa',
        stage: 'RESUMEN',
        label: 'La empresa tiene denominación y CUIT cargados',
        passed: identidadOk,
        severity: 'BLOQUEA',
        detail: identidadOk ? undefined : 'Los estados contables saldrían sin identificar a la entidad emisora.',
        action: 'Completá la ficha de la empresa.',
        link: '/configuracion?seccion=empresa',
    })
    add({
        id: 'ejercicio-definido',
        stage: 'RESUMEN',
        label: 'Hay un ejercicio definido para el período',
        passed: input.exercise !== null,
        severity: 'BLOQUEA',
        action: 'Creá el ejercicio en Configuración → Ejercicios.',
        link: '/configuracion?seccion=ejercicios',
    })

    // ── COBERTURA ────────────────────────────────────────────
    if (input.coverage) {
        add({
            id: 'cobertura-cuentas',
            stage: 'COBERTURA',
            label: 'Todas las cuentas con saldo o movimiento tienen tratamiento declarado',
            passed: input.coverage.pending.length === 0,
            severity: 'BLOQUEA',
            expected: input.coverage.accountsWithActivity,
            actual: input.coverage.accountsResolved,
            detail: input.coverage.pending.length > 0
                ? `Sin tratamiento: ${input.coverage.pending.map(p => `${p.code} ${p.name}`).join(', ')}.`
                : undefined,
            action: 'Declarará la condición monetaria de esas cuentas en el plan de cuentas.',
            link: '/configuracion?seccion=plan-cuentas',
        })
        add({
            id: 'cobertura-saldo',
            stage: 'COBERTURA',
            label: 'La cobertura por saldo alcanza el 100 %',
            passed: input.coverage.balanceCoveragePct >= 100,
            severity: 'ADVIERTE',
            actual: input.coverage.balanceCoveragePct,
            expected: 100,
        })
    }

    // ── AJUSTES ──────────────────────────────────────────────
    add({
        id: 'sin-borradores',
        stage: 'AJUSTES',
        label: 'No quedan borradores pendientes en el ejercicio',
        passed: input.draftCount === 0,
        severity: 'BLOQUEA',
        actual: input.draftCount,
        expected: 0,
        detail: input.draftCount > 0 ? `Hay ${input.draftCount} borrador(es) sin contabilizar.` : undefined,
        action: 'Contabilizalos o eliminalos desde el Libro Diario.',
        link: '/asientos',
    })
    add({
        id: 'sin-asientos-fuera',
        stage: 'AJUSTES',
        label: 'No hay asientos fuera del rango del ejercicio',
        passed: input.entriesOutsideExercise === 0,
        severity: 'ADVIERTE',
        actual: input.entriesOutsideExercise,
        expected: 0,
        detail: input.entriesOutsideExercise > 0
            ? `Hay ${input.entriesOutsideExercise} asiento(s) en otros ejercicios; verificá que sea deliberado.`
            : undefined,
        link: '/asientos',
    })

    // ── Controles del motor, repartidos por etapa ────────────
    for (const c of input.statementChecks) {
        const stage = CHECK_STAGE[c.id] ?? 'CONTROLES'
        const extra = CHECK_ACTION[c.id]
        add({
            id: `motor:${c.id}`,
            stage,
            label: c.label,
            passed: c.passed,
            severity: 'BLOQUEA',
            expected: c.expected,
            actual: c.actual,
            difference: c.difference,
            detail: c.detail,
            action: extra?.action,
            link: extra?.link,
        })
    }

    // ── MEDICIONES ───────────────────────────────────────────
    if (input.measurements) {
        add({
            id: 'mediciones-pendientes',
            stage: 'MEDICIONES',
            label: 'Las partidas que requieren medición al cierre fueron medidas',
            passed: input.measurements.pending.length === 0,
            severity: 'BLOQUEA',
            expected: input.measurements.required,
            actual: input.measurements.done,
            detail: input.measurements.pending.length > 0
                ? `Falta medir: ${input.measurements.pending.map(p => p.rubro).join(', ')}.`
                : undefined,
            action: 'Registrá la medición al cierre y contabilizá su resultado por tenencia.',
            link: '/pre-cierre?etapa=MEDICIONES',
        })
    }

    // ── AXI ──────────────────────────────────────────────────
    if (input.inflationSet) {
        add({
            id: 'indices-completos',
            stage: 'AXI',
            label: 'La serie de índices cubre todo el ejercicio',
            passed: input.inflationSet.missingPeriods.length === 0,
            severity: 'BLOQUEA',
            detail: input.inflationSet.missingPeriods.length > 0
                ? `Faltan los índices de ${input.inflationSet.missingPeriods.join(', ')}.`
                : undefined,
            action: 'Completá la serie con la fuente oficial; los meses faltantes jamás se interpolan.',
            link: '/configuracion?seccion=inflacion',
        })
    }
    if (input.coverage && input.coverage.missingPeriods.length > 0) {
        add({
            id: 'indices-anticuacion',
            stage: 'AXI',
            label: 'Cada período de origen tiene su índice',
            passed: false,
            severity: 'BLOQUEA',
            detail: `Sin índice para ${input.coverage.missingPeriods.join(', ')}: esas partidas no se pueden reexpresar.`,
            action: 'Completá la serie de índices.',
            link: '/configuracion?seccion=inflacion',
        })
    }
    for (const [i, message] of input.fixedAssetsRestatedBlockers.entries()) {
        add({
            id: `bienes-uso-reexpresion:${i}`,
            stage: 'BIENES_USO',
            label: 'La reexpresión del anexo de bienes de uso está completa',
            passed: false,
            severity: 'BLOQUEA',
            detail: message,
            action: 'Completá la serie de índices para los períodos de alta de los bienes.',
            link: '/configuracion?seccion=inflacion',
        })
    }

    // ── RECPAM ───────────────────────────────────────────────
    if (input.recpam) {
        add({
            id: 'recpam-conciliado',
            stage: 'RECPAM',
            label: 'El RECPAM secuencial concilia con el analítico',
            passed: input.recpam.reconciled,
            severity: 'BLOQUEA',
            difference: input.recpam.difference,
            tolerance: input.recpam.toleranceCents / 100,
            detail: input.recpam.blockers[0],
            action: 'Revisá la anticuación de las partidas no monetarias y la clasificación monetaria.',
            link: '/pre-cierre?etapa=RECPAM',
        })
    }

    // ── ESTADOS ──────────────────────────────────────────────
    add({
        id: 'estados-actualizados',
        stage: 'ESTADOS',
        label: 'El juego de estados guardado refleja el Libro Diario actual',
        passed: !input.staleSnapshot,
        severity: 'BLOQUEA',
        detail: input.staleSnapshot
            ? 'Se contabilizaron asientos después de guardar la versión validada.'
            : undefined,
        action: 'Volvé a guardar la versión validada de los estados.',
        link: '/estados',
    })

    // ── CIERRE ───────────────────────────────────────────────
    add({
        id: 'ejercicio-abierto',
        stage: 'CIERRE',
        label: 'El ejercicio está abierto',
        passed: input.exercise?.status === 'OPEN',
        severity: 'BLOQUEA',
        detail: input.exercise && input.exercise.status !== 'OPEN'
            ? `El ejercicio está ${input.exercise.status === 'CLOSED' ? 'cerrado' : 'en proceso de cierre'}.`
            : undefined,
        action: 'Reabrí el ejercicio con un motivo si necesitás rehacer el cierre.',
        link: '/configuracion?seccion=ejercicios',
    })

    // ── Armado de etapas ─────────────────────────────────────
    const stages: StageReport[] = STAGE_ORDER.map(stage => {
        const own = checks.filter(c => c.stage === stage)
        const blocking = own.filter(c => !c.passed && c.severity === 'BLOQUEA')
        const warning = own.filter(c => !c.passed && c.severity === 'ADVIERTE')

        let status: StageStatus
        let reason: string | undefined

        if (own.length === 0) {
            status = 'NO_APLICABLE'
            reason = notApplicableReason(stage, input)
        } else if (blocking.length > 0) {
            status = 'BLOQUEADA'
        } else if (warning.length > 0) {
            status = 'COMPLETA_CON_ADVERTENCIAS'
        } else {
            status = 'COMPLETA'
        }

        return {
            stage,
            label: STAGE_META[stage].label,
            description: STAGE_META[stage].description,
            status, reason,
            checks: own,
            blockingCount: blocking.length,
            warningCount: warning.length,
        }
    })

    const blockers = checks.filter(c => !c.passed && c.severity === 'BLOQUEA')
    const warnings = checks.filter(c => !c.passed && c.severity === 'ADVIERTE')

    const publishBlockers = blockers.filter(b => PUBLISH_STAGES.has(b.stage) || b.stage === 'RESUMEN')
    const canPublish = publishBlockers.length === 0
    const canClose = blockers.length === 0

    const applicable = stages.filter(s => s.status !== 'NO_APLICABLE')
    const completed = applicable.filter(s => s.status === 'COMPLETA' || s.status === 'COMPLETA_CON_ADVERTENCIAS')

    return {
        checks, stages, blockers, publishBlockers, warnings,
        canPublish, canClose,
        completedStages: completed.length,
        applicableStages: applicable.length,
        checkedAt: new Date().toISOString(),
    }
}

/** Por qué una etapa no aplica. Nunca se marca NO_APLICABLE sin decirlo. */
function notApplicableReason(stage: ReadinessStage, input: ReadinessInput): string {
    switch (stage) {
        case 'AXI':
            return input.inflationSet
                ? 'La serie cubre el ejercicio y no hay períodos de origen sin índice.'
                : 'No se eligió una serie de índices: los estados se emiten en moneda nominal.'
        case 'RECPAM':
            return 'La determinación del RECPAM requiere una serie de índices seleccionada.'
        case 'MEDICIONES':
            return 'Ninguna partida del ejercicio exige medición a valores corrientes al cierre.'
        case 'COBERTURA':
            return 'No se pudo construir la matriz de tratamiento: falta la serie de índices.'
        case 'BIENES_USO':
            return 'El ejercicio no tiene bienes de uso.'
        case 'INVENTARIO':
            return 'El ejercicio no tiene bienes de cambio ni costo de ventas.'
        default:
            return 'Sin controles aplicables en esta etapa.'
    }
}
