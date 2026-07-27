/**
 * ModuleStatusBadge — estado de un módulo de Operaciones (Fase 2H §H10).
 *
 * Antes toda tarjeta llevaba un badge "Activo" fijo, sin relación con los datos.
 * Acá el estado se deriva del bundle canónico y NO se comunica sólo por color:
 * cada estado tiene su propia etiqueta textual y su propio icono.
 */

import { CheckCircle, MinusCircle, Warning } from '@phosphor-icons/react'
import type { OperationsModuleStatus } from '../reporting/operationsSelectors'

const STATUS_CONFIG: Record<
    OperationsModuleStatus,
    { label: string; className: string; Icon: typeof CheckCircle; hint: string }
> = {
    WITH_MOVEMENTS: {
        label: 'Con movimientos',
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        Icon: CheckCircle,
        hint: 'El módulo tiene asientos contabilizados en este ejercicio.',
    },
    NO_MOVEMENTS: {
        label: 'Sin movimientos',
        className: 'bg-slate-50 text-slate-600 border-slate-200',
        Icon: MinusCircle,
        hint: 'Las cuentas del rubro existen en el plan pero no registran movimientos en este ejercicio.',
    },
    NEEDS_MAPPING: {
        label: 'Requiere configuración',
        className: 'bg-amber-50 text-amber-700 border-amber-200',
        Icon: Warning,
        hint: 'Ninguna cuenta del plan está mapeada a este rubro: configuralo en Configuración → Plan de cuentas y mapeos.',
    },
}

export default function ModuleStatusBadge({ status }: { status: OperationsModuleStatus }) {
    const { label, className, Icon, hint } = STATUS_CONFIG[status]
    return (
        <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap ${className}`}
            title={hint}
        >
            <Icon weight="fill" size={11} aria-hidden />
            {label}
        </span>
    )
}

export { STATUS_CONFIG as MODULE_STATUS_CONFIG }
