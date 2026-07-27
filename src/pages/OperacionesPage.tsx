/**
 * Portada de Operaciones — reescrita en la Fase 2H (§H9 y §H10).
 *
 * Qué se corrigió
 * ---------------
 * 1. Importes fantasma: la versión anterior mostraba "$ 320.000" y
 *    "2 Vencimientos" ESCRITOS A MANO en el JSX de la tarjeta de Proveedores, y
 *    guiones fijos en Clientes. Con una empresa sin asientos la pantalla exhibía
 *    deudas y vencimientos inexistentes.
 * 2. Contabilidad paralela: las tarjetas de Ventas/CMV recorrían `db.entries`
 *    con aritmética propia y sin filtrar empresa ni estado del asiento, de modo
 *    que un borrador o el ejercicio de otra empresa alteraban la portada.
 *
 * Cómo queda
 * ----------
 * Cada cifra proviene de `summarizeOperationsModules`, que agrupa el balance del
 * ReportingBundle canónico (mismo motor que los estados contables) y hereda sus
 * filtros: sólo asientos contabilizados, sólo la empresa del contexto, sólo el
 * ejercicio seleccionado. Si el plan no tiene cuentas del rubro, el módulo se
 * marca "Requiere configuración" en vez de mostrar un cero engañoso.
 *
 * La portada ya no intenta ser un tablero: se organiza por procesos, explica
 * para qué sirve cada módulo y qué llega al Libro Diario. Las tarjetas de KPI y
 * los botones globales "Registrar venta/compra" se retiraron (§12): duplicaban
 * caminos que ya viven dentro de cada módulo.
 */

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
    Package,
    CurrencyDollar,
    ChartLineUp,
    UsersThree,
    Bank,
    Receipt,
    CaretRight,
    Armchair,
    Notebook,
    IdentificationBadge,
    ShoppingCart,
    Info,
} from '@phosphor-icons/react'
import { db } from '../storage/db'
import { useReportingBundle } from '../hooks/useReportingBundle'
import { usePeriodYear } from '../hooks/usePeriodYear'
import {
    summarizeOperationsModules,
    type OperationsModuleId,
    type OperationsModuleSummary,
} from '../reporting/operationsSelectors'
import ModuleStatusBadge from '../ui/ModuleStatusBadge'

/** Formato monetario canónico es-AR (idéntico al de los estados contables). */
function money(value: number): string {
    return value.toLocaleString('es-AR', {
        style: 'currency',
        currency: 'ARS',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })
}

interface ModuleCardSpec {
    id: OperationsModuleId
    title: string
    /** Para qué sirve el módulo. */
    purpose: string
    /** Qué representa el importe que se muestra. */
    metricLabel: string
    /** Qué genera el módulo en el Libro Diario. */
    journalHint: string
    to: string
    Icon: typeof Package
    accent: string
}

interface ProcessGroup {
    id: string
    title: string
    description: string
    modules: ModuleCardSpec[]
}

/**
 * Estructura reducida y por proceso (§12): la portada prioriza claridad, no
 * cantidad de módulos. Cada entrada apunta a un módulo que YA existe.
 */
const PROCESS_GROUPS: ProcessGroup[] = [
    {
        id: 'activos',
        title: 'Activos y tenencias',
        description: 'Lo que la entidad posee: existencias, bienes de uso, inversiones y moneda extranjera.',
        modules: [
            {
                id: 'inventario',
                title: 'Bienes de cambio e inventario',
                purpose: 'Stock, compras, ventas, kardex y costo de las mercaderías.',
                metricLabel: 'Existencias al cierre',
                journalHint: 'Genera asientos de compra, venta y costo de ventas.',
                to: '/operaciones/inventario',
                Icon: Package,
                accent: 'text-blue-600 bg-blue-50 border-blue-100',
            },
            {
                id: 'bienes-uso',
                title: 'Bienes de uso',
                purpose: 'Altas, bajas, depreciaciones y ajuste por inflación de los activos fijos.',
                metricLabel: 'Valor de origen al cierre',
                journalHint: 'Genera asientos de alta, depreciación y baja o venta.',
                to: '/operaciones/bienes-uso',
                Icon: Armchair,
                accent: 'text-amber-600 bg-amber-50 border-amber-100',
            },
            {
                id: 'inversiones',
                title: 'Inversiones',
                purpose: 'Plazos fijos, fondos comunes, acciones y su medición.',
                metricLabel: 'Inversiones al cierre',
                journalHint: 'Genera asientos de constitución, renta y rescate.',
                to: '/operaciones/inversiones',
                Icon: ChartLineUp,
                accent: 'text-emerald-600 bg-emerald-50 border-emerald-100',
            },
            {
                id: 'moneda-extranjera',
                title: 'Moneda extranjera',
                purpose: 'Tenencias en USD/EUR, cotizaciones y diferencias de cambio.',
                metricLabel: 'Posición neta en divisa',
                journalHint: 'Genera asientos de compra/venta de divisas y diferencia de cambio.',
                to: '/operaciones/moneda-extranjera',
                Icon: CurrencyDollar,
                accent: 'text-sky-600 bg-sky-50 border-sky-100',
            },
        ],
    },
    {
        id: 'ventas',
        title: 'Ventas, créditos y cobranzas',
        description: 'El ciclo de ingresos: a quién se le vendió y qué falta cobrar.',
        modules: [
            {
                id: 'clientes',
                title: 'Clientes y créditos por ventas',
                purpose: 'Cuenta corriente de clientes, cobranzas y previsión por incobrables.',
                metricLabel: 'Saldo a cobrar',
                journalHint: 'Genera asientos de venta a crédito y cobranza.',
                to: '/operaciones/clientes',
                Icon: UsersThree,
                accent: 'text-emerald-600 bg-emerald-50 border-emerald-100',
            },
        ],
    },
    {
        id: 'compras',
        title: 'Compras, gastos y proveedores',
        description: 'El ciclo de egresos: qué se compró, qué se gastó y qué falta pagar.',
        modules: [
            {
                id: 'proveedores',
                title: 'Proveedores y acreedores',
                purpose: 'Cuenta corriente de proveedores y pagos.',
                metricLabel: 'Saldo a pagar',
                journalHint: 'Genera asientos de compra a crédito y pago.',
                to: '/operaciones/proveedores',
                Icon: ShoppingCart,
                accent: 'text-amber-600 bg-amber-50 border-amber-100',
            },
            {
                id: 'gastos',
                title: 'Gastos y servicios',
                purpose: 'Comprobantes de gastos, servicios y su imputación por función.',
                metricLabel: 'Gastos del ejercicio',
                journalHint: 'Genera asientos de devengamiento y pago de gastos.',
                to: '/operaciones/gastos',
                Icon: Receipt,
                accent: 'text-violet-600 bg-violet-50 border-violet-100',
            },
        ],
    },
    {
        id: 'personal',
        title: 'Personal y obligaciones sociales',
        description: 'Remuneraciones, cargas sociales y su cancelación.',
        modules: [
            {
                id: 'deudas-sociales',
                title: 'Sueldos y deudas sociales',
                purpose: 'Liquidación de haberes, aportes, contribuciones y pagos.',
                metricLabel: 'Deudas sociales al cierre',
                journalHint: 'Genera asientos de devengamiento de sueldos y su pago.',
                to: '/operaciones/deudas-sociales',
                Icon: IdentificationBadge,
                accent: 'text-blue-600 bg-blue-50 border-blue-100',
            },
        ],
    },
    {
        id: 'financiamiento',
        title: 'Financiamiento e impuestos',
        description: 'Préstamos, intereses y la posición frente al fisco.',
        modules: [
            {
                id: 'prestamos',
                title: 'Préstamos',
                purpose: 'Deudas financieras, sistema de amortización e intereses.',
                metricLabel: 'Deuda financiera al cierre',
                journalHint: 'Genera asientos de toma, cuota, interés y cancelación.',
                to: '/operaciones/prestamos',
                Icon: Bank,
                accent: 'text-blue-600 bg-blue-50 border-blue-100',
            },
            {
                id: 'impuestos',
                title: 'Impuestos',
                purpose: 'IVA, posición fiscal, vencimientos y determinación de saldos.',
                metricLabel: 'Deudas fiscales al cierre',
                journalHint: 'Genera asientos de determinación y pago de impuestos.',
                to: '/operaciones/impuestos',
                Icon: Notebook,
                accent: 'text-rose-600 bg-rose-50 border-rose-100',
            },
        ],
    },
]

function ModuleCard({ spec, summary }: { spec: ModuleCardSpec; summary: OperationsModuleSummary }) {
    const { Icon } = spec
    const showAmount = summary.status !== 'NEEDS_MAPPING'
    const movements = summary.entryIds.length

    return (
        <Link
            to={spec.to}
            className="group flex flex-col bg-white rounded-xl border border-slate-200 p-5 shadow-sm transition-all hover:shadow-md hover:border-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
            <div className="flex items-start justify-between gap-3 mb-3">
                <div className={`w-10 h-10 shrink-0 rounded-lg border flex items-center justify-center ${spec.accent}`}>
                    <Icon weight="duotone" size={22} aria-hidden />
                </div>
                <ModuleStatusBadge status={summary.status} />
            </div>

            <h3 className="font-display font-semibold text-slate-900 leading-snug">{spec.title}</h3>
            <p className="text-sm text-slate-500 mt-1">{spec.purpose}</p>

            <div className="mt-4 pt-4 border-t border-slate-100">
                {showAmount ? (
                    <div className="flex items-baseline justify-between gap-3">
                        <span className="text-xs text-slate-500">{spec.metricLabel}</span>
                        <span className="font-mono text-base font-bold text-slate-900 tabular-nums text-right">
                            {money(summary.amount)}
                        </span>
                    </div>
                ) : (
                    <p className="text-xs text-amber-700">
                        No hay cuentas del plan mapeadas a este rubro, por eso no se informa un importe.
                    </p>
                )}

                <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                    {summary.status === 'WITH_MOVEMENTS'
                        ? `${movements} asiento${movements === 1 ? '' : 's'} del ejercicio · ${spec.journalHint}`
                        : spec.journalHint}
                </p>
            </div>

            <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-blue-600 group-hover:text-blue-700">
                Abrir módulo <CaretRight size={14} weight="bold" aria-hidden />
            </span>
        </Link>
    )
}

export default function OperacionesPage() {
    const { year: periodYear } = usePeriodYear()
    const { bundle } = useReportingBundle(periodYear)
    const accounts = useLiveQuery(() => db.accounts.toArray(), [])

    const summaries = useMemo(() => {
        if (!bundle || !accounts) return null
        return summarizeOperationsModules(bundle, accounts)
    }, [bundle, accounts])

    const totalMovements = useMemo(() => {
        if (!summaries) return 0
        const ids = new Set<string>()
        for (const summary of Object.values(summaries)) {
            for (const id of summary.entryIds) ids.add(id)
        }
        return ids.size
    }, [summaries])

    return (
        <div className="flex-1 overflow-y-auto p-4 lg:p-8 bg-slate-50">
            <header className="mb-8">
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Centro de trabajo</p>
                <h1 className="font-display font-bold text-3xl text-slate-900 mt-1">Operaciones</h1>
                <p className="text-slate-500 mt-2 max-w-3xl">
                    Los módulos de Operaciones son interfaces especializadas para registrar hechos económicos. Todos
                    escriben en el <Link to="/asientos" className="text-blue-600 font-medium hover:underline">Libro
                    Diario</Link>, que sigue siendo la única fuente contable: los importes de esta pantalla se derivan
                    del mismo motor que produce los estados contables del ejercicio {periodYear}.
                </p>
            </header>

            {summaries === null ? (
                <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
                    Cargando la información del ejercicio…
                </div>
            ) : (
                <>
                    {totalMovements === 0 && (
                        <div
                            className="mb-8 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4"
                            role="status"
                        >
                            <Info weight="fill" size={20} className="text-blue-600 shrink-0 mt-0.5" aria-hidden />
                            <div className="text-sm text-blue-900">
                                <p className="font-semibold">Este ejercicio todavía no tiene asientos contabilizados.</p>
                                <p className="mt-1 text-blue-800">
                                    Por eso todos los módulos muestran {money(0)}. No hay datos de ejemplo ni saldos
                                    precargados: los importes aparecerán a medida que registres operaciones desde cada
                                    módulo o directamente en el Libro Diario.
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="space-y-10">
                        {PROCESS_GROUPS.map(group => (
                            <section key={group.id} aria-labelledby={`grupo-${group.id}`}>
                                <div className="border-b border-slate-200 pb-3 mb-5">
                                    <h2
                                        id={`grupo-${group.id}`}
                                        className="font-display font-semibold text-xl text-slate-900"
                                    >
                                        {group.title}
                                    </h2>
                                    <p className="text-sm text-slate-500 mt-0.5">{group.description}</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                                    {group.modules.map(spec => (
                                        <ModuleCard key={spec.id} spec={spec} summary={summaries[spec.id]} />
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}
