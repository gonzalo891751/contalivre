/**
 * Payroll / Deudas Sociales Storage & Service Layer
 *
 * CRUD for employees, payroll runs, lines, payments.
 * Journal entry builders for accrual (devengamiento) and payments.
 */

import { db, generateId } from './db'
import { createEntry } from './entries'
import type { Account, JournalEntry, EntryLine } from '../core/models'
import type {
    Employee,
    PayrollSettings,
    PayrollRun,
    PayrollLine,
    PayrollPayment,
    PayrollPaymentType,
    PaymentSplit,
    PayrollAccountMappings,
    PayrollConcept,
    PayrollLineDetail,
    TemplateType,
} from '../core/payroll/types'
import { DEFAULT_PAYROLL_SETTINGS, PAYROLL_ACCOUNT_FALLBACKS, PAYROLL_TEMPLATES } from '../core/payroll/types'
import { evaluatePayrollFormula } from '../core/payroll/formulas'
import type { PayrollFormulaVars } from '../core/payroll/formulas'

// ─── Helpers ────────────────────────────────────────────────

const normalize = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

function resolveAccountId(
    accounts: Account[],
    mappings: PayrollAccountMappings,
    key: keyof PayrollAccountMappings,
): string | undefined {
    // 1) User-configured mapping
    const mapped = mappings[key]
    if (mapped) {
        const found = accounts.find(a => a.id === mapped && !a.isHeader)
        if (found) return found.id
    }

    const fallback = PAYROLL_ACCOUNT_FALLBACKS[key]
    if (!fallback) return undefined

    // 2) By code
    for (const code of fallback.codes) {
        const found = accounts.find(a => a.code === code && !a.isHeader)
        if (found) return found.id
    }

    // 3) By name (normalized)
    for (const name of fallback.names) {
        const norm = normalize(name)
        const found = accounts.find(a => normalize(a.name) === norm && !a.isHeader)
        if (found) return found.id
    }

    // 4) By name includes
    for (const name of fallback.names) {
        const norm = normalize(name)
        const found = accounts.find(a => normalize(a.name).includes(norm) && !a.isHeader)
        if (found) return found.id
    }

    return undefined
}

function getLastDayOfMonth(period: string): string {
    const [year, month] = period.split('-').map(Number)
    const d = new Date(year, month, 0) // day 0 of next month = last day of this month
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100

// ─── Settings ───────────────────────────────────────────────

const DEFAULT_SETTINGS_OBJ: PayrollSettings = { id: 'payroll-settings', ...DEFAULT_PAYROLL_SETTINGS }

/**
 * READ-ONLY: safe to call from useLiveQuery / liveQuery context.
 * Returns in-memory defaults if no settings exist in DB yet.
 */
export async function getPayrollSettings(): Promise<PayrollSettings> {
    const existing = await db.payrollSettings.get('payroll-settings')
    return existing ?? DEFAULT_SETTINGS_OBJ
}

/**
 * WRITE: seeds default settings if not present. Call from useEffect, NOT from liveQuery.
 */
export async function ensurePayrollSeeded(): Promise<void> {
    const existing = await db.payrollSettings.get('payroll-settings')
    if (!existing) {
        await db.payrollSettings.put({ ...DEFAULT_SETTINGS_OBJ })
    }
}

export async function updatePayrollSettings(
    updates: Partial<Omit<PayrollSettings, 'id'>>
): Promise<PayrollSettings> {
    await ensurePayrollSeeded()
    const current = await db.payrollSettings.get('payroll-settings')
    const updated = { ...current!, ...updates }
    await db.payrollSettings.put(updated)
    return updated
}

// ─── Employees CRUD ─────────────────────────────────────────

export async function getAllEmployees(): Promise<Employee[]> {
    return db.payrollEmployees.toArray()
}

export async function getActiveEmployees(): Promise<Employee[]> {
    return db.payrollEmployees.where('status').equals('active').toArray()
}

export async function getEmployeeById(id: string): Promise<Employee | undefined> {
    return db.payrollEmployees.get(id)
}

export async function createEmployee(
    data: Omit<Employee, 'id' | 'createdAt'>
): Promise<Employee> {
    const employee: Employee = {
        ...data,
        id: generateId(),
        createdAt: new Date().toISOString(),
    }
    await db.payrollEmployees.add(employee)
    return employee
}

export async function updateEmployee(
    id: string,
    updates: Partial<Omit<Employee, 'id' | 'createdAt'>>
): Promise<Employee> {
    const existing = await db.payrollEmployees.get(id)
    if (!existing) throw new Error('Empleado no encontrado')
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() }
    await db.payrollEmployees.put(updated)
    return updated
}

export async function deleteEmployee(id: string): Promise<void> {
    // Check if employee has payroll lines
    const lines = await db.payrollLines.where('employeeId').equals(id).count()
    if (lines > 0) {
        throw new Error('No se puede eliminar un empleado con liquidaciones asociadas. Desactivalo en su lugar.')
    }
    await db.payrollEmployees.delete(id)
}

// ─── Payroll Concepts CRUD ───────────────────────────────────

/**
 * READ-ONLY: safe for useLiveQuery.
 */
export async function getAllConcepts(): Promise<PayrollConcept[]> {
    return db.payrollConcepts.orderBy('sortOrder').toArray()
}

/**
 * READ-ONLY: active concepts sorted by sortOrder.
 */
export async function getActiveConcepts(): Promise<PayrollConcept[]> {
    return db.payrollConcepts.where('isActive').equals(1).sortBy('sortOrder')
}

export async function createConcept(
    data: Omit<PayrollConcept, 'id'>
): Promise<PayrollConcept> {
    const concept: PayrollConcept = { ...data, id: generateId() }
    await db.payrollConcepts.add(concept)
    return concept
}

export async function updateConcept(
    id: string,
    updates: Partial<Omit<PayrollConcept, 'id'>>
): Promise<PayrollConcept> {
    const existing = await db.payrollConcepts.get(id)
    if (!existing) throw new Error('Concepto no encontrado')
    const updated = { ...existing, ...updates }
    await db.payrollConcepts.put(updated)
    return updated
}

export async function deleteConcept(id: string): Promise<void> {
    await db.payrollConcepts.delete(id)
}

/**
 * WRITE: Seeds concepts from a template, replacing all existing concepts.
 */
export async function seedConceptsFromTemplate(templateId: TemplateType): Promise<PayrollConcept[]> {
    const template = PAYROLL_TEMPLATES.find(t => t.id === templateId)
    if (!template) throw new Error(`Plantilla no encontrada: ${templateId}`)

    const concepts: PayrollConcept[] = template.concepts.map((c, idx) => ({
        ...c,
        id: generateId(),
        isActive: true,
        sortOrder: idx * 10,
        templateSource: templateId,
    }))

    await db.transaction('rw', db.payrollConcepts, async () => {
        await db.payrollConcepts.clear()
        await db.payrollConcepts.bulkAdd(concepts)
    })

    return concepts
}

// ─── Concept-based line computation ─────────────────────────

function computeSeniorityYears(startDate: string | undefined): number {
    if (!startDate) return 0
    const [y, m, d] = startDate.split('-').map(Number)
    const start = new Date(y, m - 1, d)
    const now = new Date()
    let years = now.getFullYear() - start.getFullYear()
    if (
        now.getMonth() < start.getMonth() ||
        (now.getMonth() === start.getMonth() && now.getDate() < start.getDate())
    ) {
        years--
    }
    return Math.max(0, years)
}

/**
 * Compute a single employee's line using payroll concepts.
 * Returns the PayrollLine with conceptBreakdown populated.
 */
function computeLineFromConcepts(
    runId: string,
    emp: Employee,
    concepts: PayrollConcept[],
    settings: PayrollSettings,
): PayrollLine {
    const years = computeSeniorityYears(emp.startDate)
    const baseGross = emp.baseGross

    // First pass: compute earnings to determine remunerative sum
    const earningDetails: PayrollLineDetail[] = []
    let remunerativeSum = 0

    for (const concept of concepts.filter(c => c.kind === 'earning')) {
        const detail = computeConceptAmount(concept, {
            years,
            base: baseGross,
            gross: baseGross,
            basic: baseGross,
            remSum: 0, // not yet known
        }, baseGross)
        earningDetails.push(detail)
        if (concept.affectsEmployeeWithholds || concept.affectsEmployerContrib) {
            remunerativeSum += detail.amount
        }
    }

    // Second pass: compute deductions and employer contributions using remunerativeSum
    const vars: PayrollFormulaVars = {
        years,
        base: baseGross,
        gross: remunerativeSum,
        basic: baseGross,
        remSum: remunerativeSum,
    }

    const deductionDetails: PayrollLineDetail[] = []
    let totalDeductions = 0

    for (const concept of concepts.filter(c => c.kind === 'deduction')) {
        const detail = computeConceptAmount(concept, vars, remunerativeSum)
        // For deductions with percent_of_base and no defaultPercent, use the settings rate
        if (concept.calcMode === 'percent_of_base' && detail.amount === 0 && !concept.defaultPercent) {
            detail.amount = round2(remunerativeSum * settings.defaultEmployeeWithholdRate)
            detail.rate = settings.defaultEmployeeWithholdRate
            detail.baseAmount = remunerativeSum
        }
        deductionDetails.push(detail)
        totalDeductions += detail.amount
    }

    const contribDetails: PayrollLineDetail[] = []
    let totalContribs = 0

    for (const concept of concepts.filter(c => c.kind === 'employer_contrib')) {
        const detail = computeConceptAmount(concept, vars, remunerativeSum)
        // For employer contribs with percent_of_base and no defaultPercent, use settings rates
        if (concept.calcMode === 'percent_of_base' && detail.amount === 0 && !concept.defaultPercent) {
            const rate = settings.defaultEmployerContribRate + settings.defaultArtRate
            detail.amount = round2(remunerativeSum * rate)
            detail.rate = rate
            detail.baseAmount = remunerativeSum
        }
        contribDetails.push(detail)
        totalContribs += detail.amount
    }

    const gross = round2(remunerativeSum)
    const net = round2(gross - totalDeductions)

    return {
        id: generateId(),
        payrollRunId: runId,
        employeeId: emp.id,
        gross,
        employeeWithholds: round2(totalDeductions),
        employerContrib: round2(totalContribs),
        advancesApplied: 0,
        otherDeductions: 0,
        net,
        conceptBreakdown: [...earningDetails, ...deductionDetails, ...contribDetails],
    }
}

function computeConceptAmount(
    concept: PayrollConcept,
    vars: PayrollFormulaVars,
    baseForPercent: number,
): PayrollLineDetail {
    let amount = 0
    let rate: number | undefined
    let baseAmount = 0

    switch (concept.calcMode) {
        case 'fixed_amount':
            amount = concept.defaultValue ?? 0
            baseAmount = amount
            break

        case 'percent_of_base': {
            const pct = concept.defaultPercent ?? 0
            const ref = resolveBaseRef(concept.baseRef, vars, baseForPercent)
            amount = round2(ref * pct)
            rate = pct
            baseAmount = ref
            break
        }

        case 'formula':
            if (concept.formulaExpr) {
                try {
                    amount = evaluatePayrollFormula(concept.formulaExpr, vars)
                } catch {
                    amount = 0
                }
            }
            baseAmount = vars.base
            break

        case 'variable_input':
            amount = concept.defaultValue ?? 0
            baseAmount = amount
            break
    }

    return {
        conceptId: concept.id,
        conceptName: concept.name,
        kind: concept.kind,
        baseAmount,
        rate,
        amount: round2(amount),
        formulaExpr: concept.formulaExpr,
        editable: concept.calcMode === 'variable_input' || concept.calcMode === 'fixed_amount',
    }
}

function resolveBaseRef(
    baseRef: PayrollConcept['baseRef'],
    vars: PayrollFormulaVars,
    fallback: number,
): number {
    switch (baseRef) {
        case 'base_gross': return vars.base
        case 'base_basic': return vars.basic
        case 'base_remunerative_sum': return vars.remSum || fallback
        default: return fallback
    }
}

// ─── Payroll Runs CRUD ──────────────────────────────────────

export async function getAllPayrollRuns(): Promise<PayrollRun[]> {
    return db.payrollRuns.orderBy('period').reverse().toArray()
}

export async function getPayrollRunById(id: string): Promise<PayrollRun | undefined> {
    return db.payrollRuns.get(id)
}

export async function getPayrollRunByPeriod(period: string): Promise<PayrollRun | undefined> {
    return db.payrollRuns.where('period').equals(period).first()
}

export async function createPayrollRun(period: string): Promise<PayrollRun> {
    // Check if run already exists
    const existing = await getPayrollRunByPeriod(period)
    if (existing) throw new Error(`Ya existe una liquidacion para el periodo ${period}`)

    const settings = await getPayrollSettings()
    const employees = await getActiveEmployees()
    const concepts = await getActiveConcepts()

    const run: PayrollRun = {
        id: generateId(),
        period,
        accrualDate: getLastDayOfMonth(period),
        status: 'draft',
        grossTotal: 0,
        employeeWithholdTotal: 0,
        employerContribTotal: 0,
        netTotal: 0,
        advancesAppliedTotal: 0,
        salaryPaid: 0,
        socialSecurityPaid: 0,
        createdAt: new Date().toISOString(),
    }

    // Create lines for each active employee
    let lines: PayrollLine[]

    if (concepts.length > 0) {
        // PRO mode: use concept-based computation
        lines = employees.map(emp =>
            computeLineFromConcepts(run.id, emp, concepts, settings)
        )
    } else {
        // Legacy mode: simple rate multiplication
        lines = employees.map(emp => {
            const gross = emp.baseGross
            const employeeWithholds = round2(gross * settings.defaultEmployeeWithholdRate)
            const employerContrib = round2(gross * (settings.defaultEmployerContribRate + settings.defaultArtRate))
            const net = round2(gross - employeeWithholds)

            return {
                id: generateId(),
                payrollRunId: run.id,
                employeeId: emp.id,
                gross,
                employeeWithholds,
                employerContrib,
                advancesApplied: 0,
                otherDeductions: 0,
                net,
            }
        })
    }

    // Compute totals
    run.grossTotal = round2(lines.reduce((s, l) => s + l.gross, 0))
    run.employeeWithholdTotal = round2(lines.reduce((s, l) => s + l.employeeWithholds, 0))
    run.employerContribTotal = round2(lines.reduce((s, l) => s + l.employerContrib, 0))
    run.netTotal = round2(lines.reduce((s, l) => s + l.net, 0))
    run.advancesAppliedTotal = round2(lines.reduce((s, l) => s + l.advancesApplied, 0))

    await db.transaction('rw', db.payrollRuns, db.payrollLines, async () => {
        await db.payrollRuns.add(run)
        await db.payrollLines.bulkAdd(lines)
    })

    return run
}

export async function getPayrollLines(runId: string): Promise<PayrollLine[]> {
    return db.payrollLines.where('payrollRunId').equals(runId).toArray()
}

export async function updatePayrollLine(
    lineId: string,
    updates: Partial<Pick<PayrollLine, 'gross' | 'employeeWithholds' | 'employerContrib' | 'advancesApplied' | 'otherDeductions'>>
): Promise<void> {
    const line = await db.payrollLines.get(lineId)
    if (!line) throw new Error('Linea no encontrada')

    const updated = { ...line, ...updates }
    updated.net = round2(updated.gross - updated.employeeWithholds - updated.advancesApplied - updated.otherDeductions)

    await db.payrollLines.put(updated)

    // Recompute run totals
    await recomputeRunTotals(line.payrollRunId)
}

async function recomputeRunTotals(runId: string): Promise<void> {
    const lines = await getPayrollLines(runId)
    const run = await db.payrollRuns.get(runId)
    if (!run) return

    run.grossTotal = round2(lines.reduce((s, l) => s + l.gross, 0))
    run.employeeWithholdTotal = round2(lines.reduce((s, l) => s + l.employeeWithholds, 0))
    run.employerContribTotal = round2(lines.reduce((s, l) => s + l.employerContrib, 0))
    run.netTotal = round2(lines.reduce((s, l) => s + l.net, 0))
    run.advancesAppliedTotal = round2(lines.reduce((s, l) => s + l.advancesApplied, 0))
    run.updatedAt = new Date().toISOString()

    await db.payrollRuns.put(run)
}

export async function deletePayrollRun(runId: string): Promise<void> {
    const run = await db.payrollRuns.get(runId)
    if (!run) throw new Error('Liquidacion no encontrada')
    if (run.status !== 'draft') {
        throw new Error('Solo se pueden eliminar liquidaciones en estado borrador')
    }

    await db.transaction('rw', db.payrollRuns, db.payrollLines, async () => {
        await db.payrollLines.where('payrollRunId').equals(runId).delete()
        await db.payrollRuns.delete(runId)
    })
}

// ─── Journal Entry Builders ─────────────────────────────────

/**
 * Post (devengar) a payroll run: generate accrual journal entry.
 *
 * DEBE:
 *   Sueldos y Jornales = grossTotal
 *   Cargas Sociales = employerContribTotal
 * HABER:
 *   Sueldos a Pagar = netTotal
 *   Retenciones/Aportes a Depositar = employeeWithholdTotal
 *   Cargas Sociales a Pagar = employerContribTotal
 *   Anticipos al Personal = advancesAppliedTotal (if > 0)
 */
export async function postPayrollRun(runId: string): Promise<JournalEntry> {
    const run = await db.payrollRuns.get(runId)
    if (!run) throw new Error('Liquidacion no encontrada')
    if (run.status !== 'draft') throw new Error('La liquidacion ya fue registrada')

    const accounts = await db.accounts.toArray()
    const settings = await getPayrollSettings()
    const mappings = settings.accountMappings

    // Resolve accounts
    const sueldosId = resolveAccountId(accounts, mappings, 'sueldosYJornales')
    const cargasGastoId = resolveAccountId(accounts, mappings, 'cargasSociales')
    const sueldosAPagarId = resolveAccountId(accounts, mappings, 'sueldosAPagar')
    const retencionesId = resolveAccountId(accounts, mappings, 'retencionesADepositar')
    const cargasAPagarId = resolveAccountId(accounts, mappings, 'cargasSocialesAPagar')
    const anticiposId = resolveAccountId(accounts, mappings, 'anticiposAlPersonal')

    if (!sueldosId) throw new Error('No se encontro la cuenta "Sueldos y Jornales". Configurala en los ajustes del modulo o creala en el Plan de Cuentas.')
    if (!cargasGastoId) throw new Error('No se encontro la cuenta "Cargas Sociales" (gasto). Configurala en los ajustes.')
    if (!sueldosAPagarId) throw new Error('No se encontro la cuenta "Sueldos a Pagar" (pasivo). Configurala en los ajustes.')
    if (!retencionesId) throw new Error('No se encontro la cuenta "Retenciones/Aportes a Depositar". Configurala en los ajustes.')
    if (!cargasAPagarId) throw new Error('No se encontro la cuenta "Cargas Sociales a Pagar". Configurala en los ajustes.')

    const lines: EntryLine[] = []

    // DEBE
    lines.push({ accountId: sueldosId, debit: run.grossTotal, credit: 0, description: 'Sueldos y Jornales del periodo' })
    if (run.employerContribTotal > 0) {
        lines.push({ accountId: cargasGastoId, debit: run.employerContribTotal, credit: 0, description: 'Contribuciones patronales' })
    }

    // HABER
    if (run.netTotal > 0) {
        lines.push({ accountId: sueldosAPagarId, debit: 0, credit: run.netTotal, description: 'Neto a pagar empleados' })
    }
    if (run.employeeWithholdTotal > 0) {
        lines.push({ accountId: retencionesId, debit: 0, credit: run.employeeWithholdTotal, description: 'Retenciones y aportes s/sueldos' })
    }
    if (run.employerContribTotal > 0) {
        lines.push({ accountId: cargasAPagarId, debit: 0, credit: run.employerContribTotal, description: 'Contribuciones patronales a depositar' })
    }
    if (run.advancesAppliedTotal > 0 && anticiposId) {
        lines.push({ accountId: anticiposId, debit: 0, credit: run.advancesAppliedTotal, description: 'Anticipos aplicados' })
    }

    const entry = await createEntry({
        date: run.accrualDate,
        memo: `Devengamiento sueldos ${run.period}`,
        lines,
        sourceModule: 'payroll',
        sourceId: run.id,
        sourceType: 'accrual',
        metadata: {
            payrollRunId: run.id,
            period: run.period,
            grossTotal: run.grossTotal,
            netTotal: run.netTotal,
        },
    })

    await db.payrollRuns.update(runId, {
        status: 'posted',
        journalEntryId: entry.id,
        updatedAt: new Date().toISOString(),
    })

    return entry
}

// ─── Payment Registration ───────────────────────────────────

export async function getPayrollPayments(runId: string): Promise<PayrollPayment[]> {
    return db.payrollPayments.where('payrollRunId').equals(runId).toArray()
}

export async function getAllPayrollPayments(): Promise<PayrollPayment[]> {
    return db.payrollPayments.toArray()
}

/**
 * Register a salary or social security payment.
 * Generates corresponding journal entry.
 */
export async function registerPayrollPayment(
    runId: string,
    type: PayrollPaymentType,
    date: string,
    splits: PaymentSplit[],
    note?: string,
): Promise<PayrollPayment> {
    const run = await db.payrollRuns.get(runId)
    if (!run) throw new Error('Liquidacion no encontrada')
    if (run.status === 'draft') throw new Error('Primero debes registrar (devengar) la liquidacion')

    const amount = round2(splits.reduce((s, sp) => s + sp.amount, 0))
    if (amount <= 0) throw new Error('El monto del pago debe ser mayor a 0')

    // Validate doesn't exceed remaining
    if (type === 'salary') {
        const remaining = round2(run.netTotal - run.salaryPaid)
        if (amount > remaining + 0.01) throw new Error(`El pago ($${amount}) excede el saldo pendiente ($${remaining})`)
    } else {
        const totalSS = round2(run.employeeWithholdTotal + run.employerContribTotal)
        const remaining = round2(totalSS - run.socialSecurityPaid)
        if (amount > remaining + 0.01) throw new Error(`El pago ($${amount}) excede el saldo pendiente ($${remaining})`)
    }

    const accounts = await db.accounts.toArray()
    const settings = await getPayrollSettings()
    const mappings = settings.accountMappings

    // Build journal entry
    const entryLines: EntryLine[] = []

    if (type === 'salary') {
        const sueldosAPagarId = resolveAccountId(accounts, mappings, 'sueldosAPagar')
        if (!sueldosAPagarId) throw new Error('No se encontro la cuenta "Sueldos a Pagar"')
        entryLines.push({ accountId: sueldosAPagarId, debit: amount, credit: 0, description: 'Pago sueldos' })
    } else {
        // Social security: split between retenciones and cargas sociales proportionally
        const retencionesId = resolveAccountId(accounts, mappings, 'retencionesADepositar')
        const cargasAPagarId = resolveAccountId(accounts, mappings, 'cargasSocialesAPagar')
        if (!retencionesId) throw new Error('No se encontro la cuenta "Retenciones a Depositar"')
        if (!cargasAPagarId) throw new Error('No se encontro la cuenta "Cargas Sociales a Pagar"')

        const totalSS = run.employeeWithholdTotal + run.employerContribTotal
        if (totalSS > 0) {
            const retProportion = run.employeeWithholdTotal / totalSS
            const retAmount = round2(amount * retProportion)
            const contribAmount = round2(amount - retAmount)
            if (retAmount > 0) {
                entryLines.push({ accountId: retencionesId, debit: retAmount, credit: 0, description: 'Pago retenciones y aportes' })
            }
            if (contribAmount > 0) {
                entryLines.push({ accountId: cargasAPagarId, debit: contribAmount, credit: 0, description: 'Pago contribuciones patronales' })
            }
        }
    }

    // HABER: Payment accounts (splits)
    for (const split of splits) {
        entryLines.push({ accountId: split.accountId, debit: 0, credit: split.amount, description: note || `Pago ${type === 'salary' ? 'sueldos' : 'seg. social'} ${run.period}` })
    }

    const entry = await createEntry({
        date,
        memo: `Pago ${type === 'salary' ? 'sueldos' : 'seguridad social'} ${run.period}`,
        lines: entryLines,
        sourceModule: 'payroll',
        sourceId: run.id,
        sourceType: type === 'salary' ? 'salary_payment' : 'social_security_payment',
        metadata: {
            payrollRunId: run.id,
            period: run.period,
            paymentType: type,
            amount,
        },
    })

    const payment: PayrollPayment = {
        id: generateId(),
        payrollRunId: runId,
        type,
        date,
        amount,
        splits,
        journalEntryId: entry.id,
        note,
        createdAt: new Date().toISOString(),
    }

    // Update run totals
    const newSalaryPaid = type === 'salary' ? round2(run.salaryPaid + amount) : run.salaryPaid
    const newSSPaid = type === 'social_security' ? round2(run.socialSecurityPaid + amount) : run.socialSecurityPaid
    const totalSS = round2(run.employeeWithholdTotal + run.employerContribTotal)
    const allPaid = newSalaryPaid >= run.netTotal - 0.01 && newSSPaid >= totalSS - 0.01
    const newStatus: PayrollRun['status'] = allPaid ? 'paid' : 'partial'

    await db.transaction('rw', db.payrollPayments, db.payrollRuns, async () => {
        await db.payrollPayments.add(payment)
        await db.payrollRuns.update(runId, {
            salaryPaid: newSalaryPaid,
            socialSecurityPaid: newSSPaid,
            status: newStatus,
            updatedAt: new Date().toISOString(),
        })
    })

    return payment
}

// ─── Metrics / Queries ──────────────────────────────────────

export interface PayrollMetrics {
    hasData: boolean
    netPending: number
    retencionesDepositar: number
    cargasSocialesAPagar: number
    totalEmployees: number
    nextDueLabel: string
    dueSeverity: 'ok' | 'upcoming' | 'overdue'
}

export async function getPayrollMetrics(): Promise<PayrollMetrics> {
    const employees = await db.payrollEmployees.where('status').equals('active').count()
    const runs = await db.payrollRuns.toArray()
    const settings = await getPayrollSettings()

    const pendingRuns = runs.filter(r => r.status === 'posted' || r.status === 'partial')

    let netPending = 0
    let retencionesDepositar = 0
    let cargasSocialesAPagar = 0

    for (const run of pendingRuns) {
        netPending += round2(run.netTotal - run.salaryPaid)
        const totalSS = round2(run.employeeWithholdTotal + run.employerContribTotal)
        const ssPaid = run.socialSecurityPaid
        const ssRemaining = round2(totalSS - ssPaid)
        if (ssRemaining > 0) {
            const retProportion = run.employeeWithholdTotal / (run.employeeWithholdTotal + run.employerContribTotal || 1)
            retencionesDepositar += round2(ssRemaining * retProportion)
            cargasSocialesAPagar += round2(ssRemaining * (1 - retProportion))
        }
    }

    // Compute next due
    const today = new Date()
    const thisMonth = today.getMonth()
    const thisYear = today.getFullYear()
    const todayDay = today.getDate()

    const salaryDue = new Date(thisYear, thisMonth, Math.min(settings.dueDaySalary, 28))
    const ssDue = new Date(thisYear, thisMonth, Math.min(settings.dueDaySocialSecurity, 28))

    // If both are in the past, move to next month
    if (salaryDue.getDate() < todayDay && ssDue.getDate() < todayDay) {
        salaryDue.setMonth(salaryDue.getMonth() + 1)
        ssDue.setMonth(ssDue.getMonth() + 1)
    }

    const nextDue = salaryDue < ssDue ? salaryDue : ssDue
    const daysUntilDue = Math.ceil((nextDue.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    let dueSeverity: 'ok' | 'upcoming' | 'overdue' = 'ok'
    let nextDueLabel = 'Sin vencimientos'

    const hasData = employees > 0 || runs.length > 0

    if (pendingRuns.length > 0) {
        if (daysUntilDue < 0) {
            dueSeverity = 'overdue'
            nextDueLabel = 'Vencido'
        } else if (daysUntilDue <= 5) {
            dueSeverity = 'upcoming'
            nextDueLabel = `Vence en ${daysUntilDue}d`
        } else {
            nextDueLabel = `Vence el ${nextDue.getDate()}/${nextDue.getMonth() + 1}`
        }
    }

    return {
        hasData,
        netPending: round2(netPending),
        retencionesDepositar: round2(retencionesDepositar),
        cargasSocialesAPagar: round2(cargasSocialesAPagar),
        totalEmployees: employees,
        nextDueLabel,
        dueSeverity,
    }
}

/**
 * Get all journal entries generated by the payroll module
 */
export async function getPayrollJournalEntries(): Promise<JournalEntry[]> {
    return db.entries
        .where('sourceModule')
        .equals('payroll')
        .reverse()
        .toArray()
}

// ─── Area-based metrics (for PRO reports) ────────────────────

export interface AreaMetric {
    area: string
    employeeCount: number
    totalGross: number
    totalNet: number
    totalEmployerCost: number // gross + employer contribs
}

/**
 * READ-ONLY: Compute salary mass by area.
 * Uses latest run for each area or employee.baseGross if no runs.
 */
export async function getPayrollAreaMetrics(): Promise<AreaMetric[]> {
    const employees = await getActiveEmployees()
    const settings = await getPayrollSettings()

    const areaMap = new Map<string, AreaMetric>()

    for (const emp of employees) {
        const area = emp.area || 'Sin Area'
        const existing = areaMap.get(area) || {
            area,
            employeeCount: 0,
            totalGross: 0,
            totalNet: 0,
            totalEmployerCost: 0,
        }

        const gross = emp.baseGross
        const withhold = round2(gross * settings.defaultEmployeeWithholdRate)
        const contrib = round2(gross * (settings.defaultEmployerContribRate + settings.defaultArtRate))
        const net = round2(gross - withhold)

        existing.employeeCount++
        existing.totalGross = round2(existing.totalGross + gross)
        existing.totalNet = round2(existing.totalNet + net)
        existing.totalEmployerCost = round2(existing.totalEmployerCost + gross + contrib)

        areaMap.set(area, existing)
    }

    return Array.from(areaMap.values()).sort((a, b) => b.totalGross - a.totalGross)
}

// ─── Onboarding status ──────────────────────────────────────

export interface OnboardingStatus {
    settingsConfigured: boolean
    accountsMapped: boolean
    areasConfigured: boolean
    conceptsSeeded: boolean
    employeesAdded: boolean
    allComplete: boolean
    completedSteps: number
    totalSteps: number
}

/**
 * READ-ONLY: Check onboarding completion state.
 */
export async function getOnboardingStatus(): Promise<OnboardingStatus> {
    const settings = await getPayrollSettings()
    const concepts = await db.payrollConcepts.count()
    const employees = await db.payrollEmployees.count()

    const mappings = settings.accountMappings
    const accountsMapped = !!(
        mappings.sueldosYJornales ||
        mappings.cargasSociales ||
        mappings.sueldosAPagar
    )
    const areasConfigured = !!(settings.areas && settings.areas.length > 0)
    const conceptsSeeded = concepts > 0
    const employeesAdded = employees > 0

    const settingsConfigured = settings.dueDaySalary > 0 && settings.dueDaySocialSecurity > 0

    const steps = [settingsConfigured, accountsMapped, areasConfigured, conceptsSeeded, employeesAdded]
    const completedSteps = steps.filter(Boolean).length

    return {
        settingsConfigured,
        accountsMapped,
        areasConfigured,
        conceptsSeeded,
        employeesAdded,
        allComplete: completedSteps === steps.length,
        completedSteps,
        totalSteps: steps.length,
    }
}
