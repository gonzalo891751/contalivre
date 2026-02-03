/**
 * Balance Sheet View Model Adapter
 * Transforms core BalanceSheet data to UI-ready format for ESP V2
 */
import type {
    BalanceSheet,
    StatementSection,
    Account,
    TrialBalance,
    StatementGroup
} from '../../../core/models'

// ============================================
// Types
// ============================================

export interface RubroAccount {
    code: string
    name: string
    amount: number
    isContra: boolean
}

export interface Rubro {
    id: string
    statementGroup: StatementGroup | string
    label: string
    noteNumber?: number
    currentAmount: number
    prevAmount: number | null
    accounts: RubroAccount[]
}

export interface SectionRubros {
    corriente: Rubro[]
    noCorriente: Rubro[]
}

export interface IntegrityInfo {
    isBalanced: boolean
    diff: number
    unmappedAccountsCount: number
    unmappedAccounts: Array<{
        code: string
        name: string
        balance: number
        kind: string
    }>
}

export interface BalanceSheetMeta {
    empresa: string
    ejercicioActual: number
    ejercicioAnterior: number
    fechaCorte: string
}

export interface BalanceSheetViewModel {
    meta: BalanceSheetMeta
    integrity: IntegrityInfo
    sections: {
        activo: SectionRubros
        pasivo: SectionRubros
        patrimonioNeto: Rubro[]
    }
    totals: {
        activoCorriente: number
        activoNoCorriente: number
        totalActivo: number
        pasivoCorriente: number
        pasivoNoCorriente: number
        totalPasivo: number
        totalPN: number
        totalPasivoPN: number
    }
    comparativeTotals: {
        activoCorriente: number | null
        activoNoCorriente: number | null
        totalActivo: number | null
        pasivoCorriente: number | null
        pasivoNoCorriente: number | null
        totalPasivo: number | null
        totalPN: number | null
        totalPasivoPN: number | null
    } | null
}

// ============================================
// Statement Group Labels (RT9 aligned)
// ============================================

const STATEMENT_GROUP_LABELS: Record<string, string> = {
    // Activo
    'CASH_AND_BANKS': 'Caja y Bancos',
    'INVESTMENTS': 'Inversiones',
    'TRADE_RECEIVABLES': 'Créditos por Ventas',
    'OTHER_RECEIVABLES': 'Otros Créditos',
    'TAX_CREDITS': 'Créditos Fiscales',
    'INVENTORIES': 'Bienes de Cambio',
    'PPE': 'Bienes de Uso',
    'INTANGIBLES': 'Activos Intangibles',
    // Pasivo
    'TRADE_PAYABLES': 'Deudas Comerciales',
    'LOANS': 'Préstamos',
    'TAX_LIABILITIES': 'Deudas Fiscales',
    'PAYROLL_LIABILITIES': 'Deudas Laborales',
    'OTHER_PAYABLES': 'Otras Deudas',
    'DEFERRED_INCOME': 'Ingresos Diferidos',
    // Patrimonio Neto
    'CAPITAL': 'Capital Social',
    'RESERVES': 'Reservas',
    'RETAINED_EARNINGS': 'Resultados Acumulados'
}

// ============================================
// Tolerance for float comparison
// ============================================
const TOLERANCE = 0.01

function isZero(value: number): boolean {
    return Math.abs(value) < TOLERANCE
}

// ============================================
// Transform Section to Rubros by StatementGroup
// ============================================

function groupAccountsByStatementGroup(
    section: StatementSection
): Map<StatementGroup, RubroAccount[]> {
    const groups = new Map<StatementGroup, RubroAccount[]>()

    for (const item of section.accounts) {
        const sg = item.account.statementGroup
        if (!sg) continue

        if (!groups.has(sg)) {
            groups.set(sg, [])
        }
        groups.get(sg)!.push({
            code: item.account.code,
            name: item.account.name,
            amount: item.balance,
            isContra: item.isContra
        })
    }

    return groups
}

function createRubrosFromSection(
    section: StatementSection,
    comparativeData?: Map<string, number>
): Rubro[] {
    const grouped = groupAccountsByStatementGroup(section)
    const rubros: Rubro[] = []

    for (const [statementGroup, accounts] of grouped) {
        const currentAmount = accounts.reduce((sum, acc) => sum + acc.amount, 0)

        // Calculate comparative amount by summing account comparatives
        let prevAmount: number | null = null
        if (comparativeData) {
            prevAmount = accounts.reduce((sum, acc) => {
                return sum + (comparativeData.get(acc.code) ?? 0)
            }, 0)
        }

        rubros.push({
            id: statementGroup,
            statementGroup,
            label: STATEMENT_GROUP_LABELS[statementGroup] || statementGroup,
            currentAmount: Math.round(currentAmount * 100) / 100,
            prevAmount: prevAmount !== null ? Math.round(prevAmount * 100) / 100 : null,
            accounts
        })
    }

    return rubros
}

// ============================================
// Detect Unmapped Accounts (P0 Integrity)
// ============================================

export interface UnmappedAccount {
    code: string
    name: string
    balance: number
    kind: string
}

export function detectUnmappedAccounts(
    trialBalance: TrialBalance,
    _accounts: Account[]
): UnmappedAccount[] {
    const unmapped: UnmappedAccount[] = []

    for (const row of trialBalance.rows) {
        const account = row.account

        // Skip headers
        if (account.isHeader) continue

        // Check if has balance
        const balance = row.balanceDebit > 0 ? row.balanceDebit : -row.balanceCredit
        if (isZero(balance)) continue

        // Check if has statementGroup (should be mapped)
        // Only check Balance Sheet accounts (ASSET, LIABILITY, EQUITY)
        const isBalanceSheetAccount = ['ASSET', 'LIABILITY', 'EQUITY'].includes(account.kind)

        if (isBalanceSheetAccount && !account.statementGroup) {
            unmapped.push({
                code: account.code,
                name: account.name,
                balance,
                kind: account.kind
            })
        }
    }

    return unmapped
}

// ============================================
// Main Adapter Function
// ============================================

export interface AdapterOptions {
    empresa: string
    ejercicioActual: number
    fechaCorte: string
    comparativeData?: Map<string, number>
    trialBalance?: TrialBalance
    accounts?: Account[]
}

export function adaptBalanceSheetToViewModel(
    balanceSheet: BalanceSheet,
    options: AdapterOptions
): BalanceSheetViewModel {
    const {
        empresa,
        ejercicioActual,
        fechaCorte,
        comparativeData,
        trialBalance,
        accounts
    } = options

    // Detect unmapped accounts if we have the data
    let unmappedAccounts: UnmappedAccount[] = []
    if (trialBalance && accounts) {
        unmappedAccounts = detectUnmappedAccounts(trialBalance, accounts)
    }

    // Create rubros from sections
    const activoCorrienteRubros = createRubrosFromSection(
        balanceSheet.currentAssets,
        comparativeData
    )
    const activoNoCorrienteRubros = createRubrosFromSection(
        balanceSheet.nonCurrentAssets,
        comparativeData
    )
    const pasivoCorrienteRubros = createRubrosFromSection(
        balanceSheet.currentLiabilities,
        comparativeData
    )
    const pasivoNoCorrienteRubros = createRubrosFromSection(
        balanceSheet.nonCurrentLiabilities,
        comparativeData
    )
    const patrimonioNetoRubros = createRubrosFromSection(
        balanceSheet.equity,
        comparativeData
    )

    // Calculate totals
    const sumRubros = (rubros: Rubro[]) =>
        rubros.reduce((sum, r) => sum + r.currentAmount, 0)
    const sumRubrosPrev = (rubros: Rubro[]) =>
        rubros.reduce((sum, r) => sum + (r.prevAmount ?? 0), 0)

    const activoCorrienteTotal = sumRubros(activoCorrienteRubros)
    const activoNoCorrienteTotal = sumRubros(activoNoCorrienteRubros)
    const totalActivo = activoCorrienteTotal + activoNoCorrienteTotal

    const pasivoCorrienteTotal = sumRubros(pasivoCorrienteRubros)
    const pasivoNoCorrienteTotal = sumRubros(pasivoNoCorrienteRubros)
    const totalPasivo = pasivoCorrienteTotal + pasivoNoCorrienteTotal

    const totalPN = sumRubros(patrimonioNetoRubros)
    const totalPasivoPN = totalPasivo + totalPN

    // Balance check
    const diff = totalActivo - totalPasivoPN
    const isBalanced = isZero(diff)

    // Comparative totals
    let comparativeTotals: BalanceSheetViewModel['comparativeTotals'] = null
    if (comparativeData && comparativeData.size > 0) {
        const activoCorrientePrev = sumRubrosPrev(activoCorrienteRubros)
        const activoNoCorrientePrev = sumRubrosPrev(activoNoCorrienteRubros)
        const pasivoCorrientePrev = sumRubrosPrev(pasivoCorrienteRubros)
        const pasivoNoCorrientePrev = sumRubrosPrev(pasivoNoCorrienteRubros)
        const totalPNPrev = sumRubrosPrev(patrimonioNetoRubros)

        comparativeTotals = {
            activoCorriente: activoCorrientePrev,
            activoNoCorriente: activoNoCorrientePrev,
            totalActivo: activoCorrientePrev + activoNoCorrientePrev,
            pasivoCorriente: pasivoCorrientePrev,
            pasivoNoCorriente: pasivoNoCorrientePrev,
            totalPasivo: pasivoCorrientePrev + pasivoNoCorrientePrev,
            totalPN: totalPNPrev,
            totalPasivoPN: pasivoCorrientePrev + pasivoNoCorrientePrev + totalPNPrev
        }
    }

    return {
        meta: {
            empresa,
            ejercicioActual,
            ejercicioAnterior: ejercicioActual - 1,
            fechaCorte
        },
        integrity: {
            isBalanced,
            diff: Math.round(diff * 100) / 100,
            unmappedAccountsCount: unmappedAccounts.length,
            unmappedAccounts
        },
        sections: {
            activo: {
                corriente: activoCorrienteRubros,
                noCorriente: activoNoCorrienteRubros
            },
            pasivo: {
                corriente: pasivoCorrienteRubros,
                noCorriente: pasivoNoCorrienteRubros
            },
            patrimonioNeto: patrimonioNetoRubros
        },
        totals: {
            activoCorriente: Math.round(activoCorrienteTotal * 100) / 100,
            activoNoCorriente: Math.round(activoNoCorrienteTotal * 100) / 100,
            totalActivo: Math.round(totalActivo * 100) / 100,
            pasivoCorriente: Math.round(pasivoCorrienteTotal * 100) / 100,
            pasivoNoCorriente: Math.round(pasivoNoCorrienteTotal * 100) / 100,
            totalPasivo: Math.round(totalPasivo * 100) / 100,
            totalPN: Math.round(totalPN * 100) / 100,
            totalPasivoPN: Math.round(totalPasivoPN * 100) / 100
        },
        comparativeTotals
    }
}

// ============================================
// Filter Rubros (hide zeros in both periods)
// ============================================

export function filterVisibleRubros(
    rubros: Rubro[],
    showComparative: boolean
): Rubro[] {
    return rubros.filter(rubro => {
        const currentIsZero = isZero(rubro.currentAmount)
        const prevIsZero = rubro.prevAmount === null || isZero(rubro.prevAmount)

        // If both are zero, hide
        if (currentIsZero && prevIsZero) return false

        // If comparative is off, show if current is non-zero
        if (!showComparative) return !currentIsZero

        // With comparative, show if either has value
        return !currentIsZero || !prevIsZero
    })
}

// ============================================
// CSV Export Helper
// ============================================

export interface CSVExportOptions {
    viewModel: BalanceSheetViewModel
    showComparative: boolean
    fileName?: string
}

export function exportBalanceSheetToCSV(options: CSVExportOptions): void {
    const { viewModel, showComparative, fileName } = options
    const { sections, meta } = viewModel

    const rows: string[][] = []

    // Header
    const header = ['Sección', 'Rubro', `Saldo ${meta.ejercicioActual}`]
    if (showComparative) {
        header.push(`Saldo ${meta.ejercicioAnterior}`, 'Variación $', 'Variación %')
    }
    rows.push(header)

    const addRubros = (sectionName: string, rubros: Rubro[]) => {
        const visibleRubros = filterVisibleRubros(rubros, showComparative)
        for (const rubro of visibleRubros) {
            const row = [sectionName, rubro.label, rubro.currentAmount.toString()]
            if (showComparative) {
                const prev = rubro.prevAmount ?? 0
                const delta = rubro.currentAmount - prev
                const deltaPct = prev !== 0 ? ((delta / Math.abs(prev)) * 100).toFixed(1) + '%' : ''
                row.push(prev.toString(), delta.toString(), deltaPct)
            }
            rows.push(row)
        }
    }

    addRubros('Activo Corriente', sections.activo.corriente)
    addRubros('Activo No Corriente', sections.activo.noCorriente)
    addRubros('Pasivo Corriente', sections.pasivo.corriente)
    addRubros('Pasivo No Corriente', sections.pasivo.noCorriente)
    addRubros('Patrimonio Neto', sections.patrimonioNeto)

    // Convert to CSV string
    const csvContent = rows.map(row =>
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n')

    // Download
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName || `ESP_${meta.ejercicioActual}_ContaLivre.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}
