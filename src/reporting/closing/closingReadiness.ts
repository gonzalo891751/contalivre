/**
 * Núcleo único y guiado de controles del ejercicio — Fase 2L.
 *
 * Ocho etapas, una terminología y una compuerta para pantalla, emisión y
 * cierre. Cada hallazgo dice qué ocurre, por qué importa, cómo se resuelve y
 * dónde actuar. La función es pura: no escribe asientos ni decisiones.
 */

import type { ClosingStageReview, GuidedClosingStage, GuidedStageStatus, InflationClosingPolicy } from './closingWorkPaperTypes'

export type ReadinessStage = GuidedClosingStage
export type StageStatus = GuidedStageStatus
export type CheckSeverity = 'BLOQUEA' | 'ADVIERTE' | 'INFORMA'

export interface ReadinessCheck {
    id: string
    stage: ReadinessStage
    /** Resultado directo del control; nunca una afirmación positiva invertida. */
    label: string
    successLabel?: string
    passed: boolean
    severity: CheckSeverity
    expected?: number
    actual?: number
    difference?: number
    tolerance?: number
    /** Qué se encontró. */
    detail?: string
    /** Por qué importa contablemente. */
    why?: string
    /** Cómo resolverlo. */
    action?: string
    actionLabel?: string
    link?: string
}

export interface StageReport {
    stage: ReadinessStage
    label: string
    description: string
    objective: string
    keyQuestions: string[]
    dependencies: ReadinessStage[]
    dependencyBlockers: ReadinessStage[]
    status: StageStatus
    reason?: string
    checks: ReadinessCheck[]
    blockingCount: number
    warningCount: number
    canContinue: boolean
    nextAction: string
}

export interface ClosingReadiness {
    checks: ReadinessCheck[]
    stages: StageReport[]
    blockers: ReadinessCheck[]
    publishBlockers: ReadinessCheck[]
    warnings: ReadinessCheck[]
    canPublish: boolean
    canClose: boolean
    completedStages: number
    applicableStages: number
    nextStage: ReadinessStage | null
    nextAction: string
    checkedAt: string
}

export const STAGE_META: Record<ReadinessStage, {
    label: string
    description: string
    objective: string
    keyQuestions: string[]
}> = {
    IDENTIDAD_EJERCICIO: {
        label: '1 · Identidad y ejercicio',
        description: 'Entidad emisora, CUIT, período, estado, moneda y marco de preparación.',
        objective: 'Asegurar que el cierre pertenece a la entidad y al ejercicio correctos.',
        keyQuestions: ['¿La entidad está identificada?', '¿El período de cierre es el deliberado?', '¿Qué marco y unidad de medida se aplican?'],
    },
    INTEGRIDAD_COBERTURA: {
        label: '2 · Integridad y cobertura',
        description: 'Diario, saldos, mapeos y tratamiento de todas las cuentas con actividad.',
        objective: 'Demostrar que ninguna partida queda fuera del proceso de cierre.',
        keyQuestions: ['¿El Diario balancea?', '¿Cada cuenta existe y está mapeada?', '¿La cobertura alcanza el 100 %?'],
    },
    CORTE_DEVENGAMIENTOS: {
        label: '3 · Corte y devengamientos',
        description: 'Borradores, período de imputación, corte, devengamientos y hechos posteriores.',
        objective: 'Completar el reconocimiento del período sin trasladar hechos a otro ejercicio.',
        keyQuestions: ['¿Quedan borradores?', '¿Hay partidas fuera de período?', '¿Faltan devengamientos o ajustes de corte?'],
    },
    INVENTARIO_CMV: {
        label: '4 · Inventario y costo de ventas',
        description: 'Existencias, cantidades, fechas de origen, medición y puente del costo de ventas.',
        objective: 'Conciliar existencias y costo de ventas con libros y estados.',
        keyQuestions: ['¿La existencia final está respaldada?', '¿El puente EI + compras − EF concilia?', '¿Las capas conservan su moneda de origen?'],
    },
    BIENES_USO_DEPRECIACIONES: {
        label: '5 · Bienes de uso y depreciaciones',
        description: 'Altas, bajas, vidas útiles, depreciación, medición y anexo.',
        objective: 'Conciliar el valor residual y reconocer la depreciación completa del período.',
        keyQuestions: ['¿Altas y bajas tienen fecha?', '¿La depreciación está completa?', '¿El anexo concilia con el ESP?'],
    },
    MEDICION_RECUPERABILIDAD: {
        label: '6 · Medición y recuperabilidad',
        description: 'Política válida por rubro, valor de cierre, evidencia, deterioro y reversos.',
        objective: 'Aplicar el criterio correcto sin confundir medición, reexpresión, revaluación o deterioro.',
        keyQuestions: ['¿El criterio es válido para el rubro?', '¿La fuente es fiable y de fecha de cierre?', '¿Corresponde evaluar recuperabilidad?'],
    },
    UNIDAD_MEDIDA_INFLACION: {
        label: '7 · Unidad de medida e inflación',
        description: 'Aplicabilidad, índices, clasificación, anticuación, coeficientes y RECPAM.',
        objective: 'Expresar el juego completo en moneda de cierre sin doble ajuste y reconciliar el RECPAM.',
        keyQuestions: ['¿El contexto exige ajustar?', '¿Está completa la serie?', '¿Cada origen y coeficiente es trazable?', '¿El RECPAM concilia por dos vías?'],
    },
    CONCILIACION_EMISION: {
        label: '8 · Conciliación y emisión',
        description: 'ESP, ER, EEPN, EFE, comparativos, impuestos, pendientes y cierre formal.',
        objective: 'Confirmar que el juego completo es coherente, publicable y cerrable.',
        keyQuestions: ['¿Los estados concilian entre sí?', '¿El EFE explica la variación?', '¿Quedan bloqueos o evidencia pendiente?'],
    },
}

export const STAGE_ORDER: ReadinessStage[] = [
    'IDENTIDAD_EJERCICIO',
    'INTEGRIDAD_COBERTURA',
    'CORTE_DEVENGAMIENTOS',
    'INVENTARIO_CMV',
    'BIENES_USO_DEPRECIACIONES',
    'MEDICION_RECUPERABILIDAD',
    'UNIDAD_MEDIDA_INFLACION',
    'CONCILIACION_EMISION',
]

const CHECK_STAGE: Record<string, ReadinessStage> = {
    'journal-balance': 'INTEGRIDAD_COBERTURA',
    'opening-balance': 'INTEGRIDAD_COBERTURA',
    'ledger-journal': 'INTEGRIDAD_COBERTURA',
    'unknown-accounts': 'INTEGRIDAD_COBERTURA',
    'unmapped-results': 'INTEGRIDAD_COBERTURA',
    'cmv-puente': 'INVENTARIO_CMV',
    'ppe-anexo': 'BIENES_USO_DEPRECIACIONES',
    equation: 'CONCILIACION_EMISION',
    'er-eepn': 'CONCILIACION_EMISION',
    'er-pretax': 'CONCILIACION_EMISION',
    'eepn-esp': 'CONCILIACION_EMISION',
    'eepn-matrix-closing': 'CONCILIACION_EMISION',
    'eepn-matrix-internal': 'CONCILIACION_EMISION',
    'gastos-funcion': 'CONCILIACION_EMISION',
    'efe-variacion': 'CONCILIACION_EMISION',
    'efe-esp': 'CONCILIACION_EMISION',
    'efe-metodos': 'CONCILIACION_EMISION',
    'efe-clasificacion': 'CONCILIACION_EMISION',
    'efe-disposicion': 'CONCILIACION_EMISION',
}

const CHECK_ACTION: Record<string, { action: string; link?: string }> = {
    'cmv-puente': { action: 'Revisá movimientos y componentes del costo hasta conciliar EI + compras − EF.', link: '/estados' },
    'ppe-anexo': { action: 'Revisá altas, bajas y depreciaciones contra el rubro del ESP.', link: '/operaciones/bienes-uso' },
    'efe-clasificacion': { action: 'Asigná categoría de flujo a cada cuenta pendiente.', link: '/configuracion?seccion=plan-cuentas' },
    'efe-disposicion': { action: 'Documentá las disposiciones no monetarias o mixtas con un override auditable.', link: '/configuracion?seccion=plan-cuentas' },
    'unmapped-results': { action: 'Asigná grupo de exposición a las cuentas de resultado con saldo.', link: '/configuracion?seccion=plan-cuentas' },
    'unknown-accounts': { action: 'Regularizá movimientos imputados a cuentas inexistentes.', link: '/asientos' },
}

export interface ReadinessInput {
    company: { legalName?: string; taxId?: string } | null
    exercise: { name: string; status: string; startDate: string; endDate: string } | null
    inflationSet: { name: string; missingPeriods: string[] } | null
    inflationPolicy?: InflationClosingPolicy
    stageReviews?: ClosingStageReview[]
    coverage: {
        accountsWithActivity: number
        accountsResolved: number
        coveragePct: number
        balanceCoveragePct: number
        pending: Array<{ code: string; name: string; reason: string }>
        missingPeriods: string[]
    } | null
    recpam: { reconciled: boolean; difference: number; toleranceCents: number; blockers: string[] } | null
    statementChecks: Array<{ id: string; label: string; passed: boolean; expected?: number; actual?: number; difference?: number; detail?: string }>
    fixedAssetsRestatedBlockers: string[]
    measurements: { required: number; done: number; pending: Array<{ rubro: string; reason: string }> } | null
    draftCount: number
    entriesOutsideExercise: number
    staleSnapshot: boolean
}

export function buildClosingReadiness(input: ReadinessInput): ClosingReadiness {
    const checks: ReadinessCheck[] = []
    const add = (check: ReadinessCheck) => checks.push(check)
    const inflationPolicy = input.inflationPolicy
        ?? { applicability: input.inflationSet ? 'APLICABLE' as const : 'PENDIENTE' as const }

    const name = input.company?.legalName?.trim() ?? ''
    const identityOk = name !== '' && name !== 'Empresa ContaLivre' && !!input.company?.taxId?.trim()
    add({
        id: 'identidad-empresa', stage: 'IDENTIDAD_EJERCICIO', passed: identityOk, severity: 'BLOQUEA',
        label: identityOk ? 'Identidad legal completa' : 'Falta completar la denominación legal o el CUIT',
        successLabel: 'Identidad legal completa',
        detail: identityOk ? undefined : 'La ficha no identifica completamente a la entidad emisora.',
        why: 'Los estados deben identificar inequívocamente a la entidad que informa.',
        action: 'Completá denominación y CUIT en la ficha de empresa.', actionLabel: 'Completar empresa',
        link: '/configuracion?seccion=empresa',
    })
    const exerciseOk = input.exercise !== null
    add({
        id: 'ejercicio-definido', stage: 'IDENTIDAD_EJERCICIO', passed: exerciseOk, severity: 'BLOQUEA',
        label: exerciseOk ? 'Ejercicio contable definido' : 'Falta definir el ejercicio contable',
        successLabel: 'Ejercicio contable definido',
        detail: exerciseOk ? undefined : 'No hay un período formal contra el cual preparar el cierre.',
        why: 'Las fechas delimitan corte, devengamiento, medición y comparativos.',
        action: 'Creá o seleccioná el ejercicio correcto.', actionLabel: 'Definir ejercicio',
        link: '/configuracion?seccion=ejercicios',
    })

    if (input.coverage) {
        const covered = input.coverage.pending.length === 0
        add({
            id: 'cobertura-cuentas', stage: 'INTEGRIDAD_COBERTURA', passed: covered, severity: 'BLOQUEA',
            label: covered ? 'Todas las cuentas tienen tratamiento declarado' : 'Hay cuentas con actividad sin tratamiento de cierre',
            successLabel: 'Todas las cuentas tienen tratamiento declarado',
            expected: input.coverage.accountsWithActivity, actual: input.coverage.accountsResolved,
            detail: covered ? undefined : `Pendientes: ${input.coverage.pending.map(p => `${p.code} ${p.name}`).join(', ')}.`,
            why: 'Una cuenta omitida puede distorsionar medición, reexpresión, RECPAM o exposición.',
            action: 'Declarar condición monetaria y mapeo estructural de cada pendiente.', actionLabel: 'Resolver cobertura',
            link: '/configuracion?seccion=plan-cuentas',
        })
        const fullBalance = input.coverage.balanceCoveragePct >= 100
        add({
            id: 'cobertura-saldo', stage: 'INTEGRIDAD_COBERTURA', passed: fullBalance, severity: 'ADVIERTE',
            label: fullBalance ? 'Cobertura por saldo del 100 %' : 'La cobertura por saldo es menor al 100 %',
            actual: input.coverage.balanceCoveragePct, expected: 100,
            detail: fullBalance ? undefined : `Cobertura por saldo: ${input.coverage.balanceCoveragePct.toFixed(2)} %.`,
            why: 'La cobertura por cantidad puede ocultar una partida material no resuelta.',
            action: 'Priorizar las cuentas pendientes de mayor saldo.', actionLabel: 'Ver cuentas',
        })
    }

    const noDrafts = input.draftCount === 0
    add({
        id: 'sin-borradores', stage: 'CORTE_DEVENGAMIENTOS', passed: noDrafts, severity: 'BLOQUEA',
        label: noDrafts ? 'No quedan borradores del ejercicio' : 'Hay borradores sin contabilizar',
        successLabel: 'No quedan borradores del ejercicio', actual: input.draftCount, expected: 0,
        detail: noDrafts ? undefined : `Hay ${input.draftCount} borrador(es) sin contabilizar.`,
        why: 'Un borrador puede contener un devengamiento necesario o un asiento que todavía no integra los libros.',
        action: 'Contabilizá o eliminá deliberadamente cada borrador.', actionLabel: 'Revisar Diario', link: '/asientos',
    })
    const noOutside = input.entriesOutsideExercise === 0
    add({
        id: 'sin-asientos-fuera', stage: 'CORTE_DEVENGAMIENTOS', passed: noOutside, severity: 'ADVIERTE',
        label: noOutside ? 'No se detectaron imputaciones fuera del período' : 'Hay asientos en otros ejercicios para revisar',
        actual: input.entriesOutsideExercise, expected: 0,
        detail: noOutside ? undefined : `Se detectaron ${input.entriesOutsideExercise} asiento(s) fuera del rango activo.`,
        why: 'Pueden ser legítimos, pero deben revisarse para evitar errores de corte.',
        action: 'Verificá fecha, ejercicio y motivo de cada asiento.', actionLabel: 'Revisar fechas', link: '/asientos',
    })

    for (const control of input.statementChecks) {
        const stage = CHECK_STAGE[control.id] ?? 'CONCILIACION_EMISION'
        const extra = CHECK_ACTION[control.id]
        add({
            id: `motor:${control.id}`, stage, passed: control.passed, severity: 'BLOQUEA',
            label: control.passed ? control.label : `No concilia: ${control.label}`,
            successLabel: control.label,
            expected: control.expected, actual: control.actual, difference: control.difference,
            detail: control.passed ? undefined : control.detail ?? 'El control automático no alcanzó el resultado esperado.',
            why: 'Una diferencia en este control rompe la coherencia interna del juego de estados.',
            action: extra?.action ?? 'Abrí el detalle del control, seguí las cuentas origen y corregí la causa.',
            actionLabel: 'Resolver diferencia', link: extra?.link,
        })
    }

    if (input.measurements) {
        const measured = input.measurements.pending.length === 0
        add({
            id: 'mediciones-pendientes', stage: 'MEDICION_RECUPERABILIDAD', passed: measured, severity: 'BLOQUEA',
            label: measured ? 'Todas las mediciones requeridas están contabilizadas' : 'Hay partidas sin medición de cierre',
            expected: input.measurements.required, actual: input.measurements.done,
            detail: measured ? undefined : `Falta medir: ${input.measurements.pending.map(p => p.rubro).join(', ')}.`,
            why: 'La política declarada exige una medición de cierre respaldada antes de emitir.',
            action: 'Elegí un criterio válido, documentá la fuente y revisá el asiento completo antes de contabilizar.',
            actionLabel: 'Completar mediciones', link: '/pre-cierre?etapa=MEDICION_RECUPERABILIDAD',
        })
    }

    if (inflationPolicy.applicability === 'PENDIENTE') {
        add({
            id: 'inflacion-aplicabilidad', stage: 'UNIDAD_MEDIDA_INFLACION', passed: false, severity: 'BLOQUEA',
            label: 'Falta concluir si corresponde ajustar por inflación',
            detail: 'No hay una decisión documentada sobre la unidad de medida del ejercicio.',
            why: 'La ausencia de una serie no demuestra que el contexto sea nominal.',
            action: 'Evaluá el contexto, documentá la conclusión y, si aplica, elegí la serie oficial.',
            actionLabel: 'Definir aplicabilidad', link: '/pre-cierre?etapa=UNIDAD_MEDIDA_INFLACION',
        })
    } else if (inflationPolicy.applicability === 'APLICABLE') {
        const hasSeries = input.inflationSet !== null
        add({
            id: 'serie-seleccionada', stage: 'UNIDAD_MEDIDA_INFLACION', passed: hasSeries, severity: 'BLOQUEA',
            label: hasSeries ? 'Serie de índices seleccionada' : 'Falta seleccionar la serie de índices',
            detail: hasSeries ? undefined : 'El ajuste aplica, pero no hay una serie versionada asociada al ejercicio.',
            why: 'Los coeficientes deben salir de una única serie identificable y reproducible.',
            action: 'Seleccioná una serie completa y verificá su fuente.', actionLabel: 'Elegir serie',
            link: '/configuracion?seccion=inflacion',
        })
        if (input.inflationSet) {
            const complete = input.inflationSet.missingPeriods.length === 0
            add({
                id: 'indices-completos', stage: 'UNIDAD_MEDIDA_INFLACION', passed: complete, severity: 'BLOQUEA',
                label: complete ? 'Serie completa desde apertura hasta cierre' : 'La serie tiene períodos faltantes',
                detail: complete ? undefined : `Faltan índices de ${input.inflationSet.missingPeriods.join(', ')}.`,
                why: 'Sin índice de origen no existe un coeficiente verificable; no se interpola.',
                action: 'Completá la serie con la fuente declarada.', actionLabel: 'Completar índices',
                link: '/configuracion?seccion=inflacion',
            })
        }
        if (input.coverage?.missingPeriods.length) {
            add({
                id: 'indices-anticuacion', stage: 'UNIDAD_MEDIDA_INFLACION', passed: false, severity: 'BLOQUEA',
                label: 'Hay partidas cuyo período de origen no tiene índice',
                detail: `Períodos sin índice: ${input.coverage.missingPeriods.join(', ')}.`,
                why: 'Esas partidas no pueden expresarse en moneda de cierre sin inventar un coeficiente.',
                action: 'Completá la serie o corregí el origen con evidencia.', actionLabel: 'Resolver orígenes',
                link: '/configuracion?seccion=inflacion',
            })
        }
        if (input.recpam) {
            add({
                id: 'recpam-conciliado', stage: 'UNIDAD_MEDIDA_INFLACION', passed: input.recpam.reconciled, severity: 'BLOQUEA',
                label: input.recpam.reconciled ? 'RECPAM secuencial y analítico conciliados' : 'El RECPAM no concilia por sus dos determinaciones',
                difference: input.recpam.difference, tolerance: input.recpam.toleranceCents / 100,
                detail: input.recpam.reconciled ? undefined : input.recpam.blockers[0],
                why: 'El RECPAM no puede utilizarse como cifra de cierre mecánica para forzar la ecuación.',
                action: 'Revisá clasificación monetaria, orígenes y reexpresión del PN y resultados.',
                actionLabel: 'Abrir conciliación', link: '/pre-cierre?etapa=UNIDAD_MEDIDA_INFLACION',
            })
        }
    }

    for (const [index, message] of input.fixedAssetsRestatedBlockers.entries()) {
        add({
            id: `bienes-uso-reexpresion:${index}`, stage: 'BIENES_USO_DEPRECIACIONES', passed: false, severity: 'BLOQUEA',
            label: 'La reexpresión del anexo de bienes de uso está incompleta', detail: message,
            why: 'El valor residual del anexo debe conciliar con el ESP en la misma unidad de medida.',
            action: 'Completá índices y fechas de alta de los bienes.', actionLabel: 'Revisar bienes de uso',
            link: '/operaciones/bienes-uso',
        })
    }

    const currentStatements = !input.staleSnapshot
    add({
        id: 'estados-actualizados', stage: 'CONCILIACION_EMISION', passed: currentStatements, severity: 'BLOQUEA',
        label: currentStatements ? 'Los estados reflejan el Diario actual' : 'La versión guardada de los estados está desactualizada',
        detail: currentStatements ? undefined : 'Se contabilizaron asientos después de guardar la versión validada.',
        why: 'La emisión debe corresponder al mismo corte de libros que se revisó.',
        action: 'Regenerá y guardá una versión validada.', actionLabel: 'Actualizar estados', link: '/estados',
    })
    const open = input.exercise?.status === 'OPEN'
    add({
        id: 'ejercicio-abierto', stage: 'CONCILIACION_EMISION', passed: open, severity: 'BLOQUEA',
        label: open ? 'Ejercicio abierto y disponible para el cierre' : 'El ejercicio no está abierto para un nuevo cierre',
        detail: input.exercise && !open ? `Estado actual: ${input.exercise.status}.` : undefined,
        why: 'Un ejercicio cerrado no debe refundirse nuevamente sin una reapertura controlada.',
        action: 'Reabrí con motivo si necesitás rehacer el cierre.', actionLabel: 'Gestionar ejercicio',
        link: '/configuracion?seccion=ejercicios',
    })

    const reviews = new Map((input.stageReviews ?? []).map(review => [review.stage, review]))
    const reports: StageReport[] = []
    for (let index = 0; index < STAGE_ORDER.length; index++) {
        const stage = STAGE_ORDER[index]
        const own = checks.filter(check => check.stage === stage)
        const blocking = own.filter(check => !check.passed && check.severity === 'BLOQUEA')
        const warning = own.filter(check => !check.passed && check.severity === 'ADVIERTE')
        const dependencies = STAGE_ORDER.slice(0, index)
        const dependencyBlockers = dependencies.filter(dependency =>
            reports.find(report => report.stage === dependency)?.checks
                .some(check => !check.passed && check.severity === 'BLOQUEA'))
        const review = reviews.get(stage)
        const naturalNotApplicable = verifiedNotApplicable(stage, input, inflationPolicy)
        let status: StageStatus
        let reason: string | undefined
        if (blocking.length > 0 || dependencyBlockers.length > 0) {
            status = 'BLOQUEADA'
        } else if (review?.status === 'NO_APLICABLE') {
            status = 'NO_APLICABLE'
            reason = review.notApplicableReason
        } else if (naturalNotApplicable) {
            status = 'NO_APLICABLE'
            reason = naturalNotApplicable
        } else if (warning.length > 0) status = 'CON_ADVERTENCIAS'
        else if (review?.status === 'EN_REVISION') status = 'EN_REVISION'
        else if (review?.status === 'PENDIENTE') status = 'PENDIENTE'
        else status = 'COMPLETA'

        const nextIssue = [...blocking, ...warning][0]
        reports.push({
            stage,
            ...STAGE_META[stage],
            dependencies,
            dependencyBlockers,
            status,
            reason,
            checks: own,
            blockingCount: blocking.length + dependencyBlockers.length,
            warningCount: warning.length,
            canContinue: blocking.length === 0 && dependencyBlockers.length === 0,
            nextAction: nextIssue?.action ?? (dependencyBlockers.length > 0
                ? `Resolvé primero ${STAGE_META[dependencyBlockers[0]].label.toLowerCase()}.`
                : status === 'NO_APLICABLE' ? `Confirmado: ${reason}`
                : 'Revisá la evidencia de la etapa y continuá con la siguiente.'),
        })
    }

    const blockers = checks.filter(check => !check.passed && check.severity === 'BLOQUEA')
    const warnings = checks.filter(check => !check.passed && check.severity === 'ADVIERTE')
    const publishBlockers = blockers.filter(check => check.id !== 'ejercicio-abierto')
    const applicable = reports.filter(stage => stage.status !== 'NO_APLICABLE')
    const completed = applicable.filter(stage => stage.status === 'COMPLETA' || stage.status === 'CON_ADVERTENCIAS')
    const next = reports.find(stage => stage.status !== 'COMPLETA' && stage.status !== 'NO_APLICABLE') ?? null

    return {
        checks,
        stages: reports,
        blockers,
        publishBlockers,
        warnings,
        canPublish: publishBlockers.length === 0,
        canClose: blockers.length === 0,
        completedStages: completed.length,
        applicableStages: applicable.length,
        nextStage: next?.stage ?? null,
        nextAction: next?.nextAction ?? 'El pre-cierre no tiene bloqueos. Revisá el resumen final antes de emitir o cerrar.',
        checkedAt: new Date().toISOString(),
    }
}

function verifiedNotApplicable(
    stage: ReadinessStage,
    input: ReadinessInput,
    inflationPolicy: InflationClosingPolicy,
): string | undefined {
    if (stage === 'UNIDAD_MEDIDA_INFLACION' && inflationPolicy.applicability === 'NO_APLICABLE') {
        return inflationPolicy.rationale?.trim() || undefined
    }
    if (stage === 'MEDICION_RECUPERABILIDAD' && input.measurements === null) {
        return 'No existen saldos en cuentas cuya política estructural exija medición de cierre.'
    }
    return undefined
}
