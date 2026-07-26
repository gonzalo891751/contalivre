/**
 * SectorProfilesPanel — Fase 2H (§H2). Activación de perfiles sectoriales.
 *
 * Deja explícito lo que la fase exige: la activación AGREGA cuentas al plan
 * existente y la desactivación NO borra nada. El usuario ve cuántas cuentas
 * aporta cada perfil y cuántas ya están incorporadas antes de decidir.
 */

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle, Plant, HandHeart, Factory, Storefront, Wrench, Info } from '@phosphor-icons/react'
import {
    ACTIVITY_PROFILES,
    ACTIVITY_PROFILE_DESCRIPTION,
    ACTIVITY_PROFILE_LABEL,
    vocabularyFor,
    type ActivityProfile,
} from '../../../core/sectorProfiles/types'
import { SECTOR_CATALOG } from '../../../core/sectorProfiles/catalog'
import {
    activateSectorProfile,
    deactivateSectorProfile,
    getActiveProfiles,
    listSectorAccounts,
} from '../../../storage/sectorProfiles'

const PROFILE_ICON: Record<ActivityProfile, typeof Plant> = {
    COMMERCIAL: Storefront,
    SERVICES: Wrench,
    INDUSTRIAL: Factory,
    AGRICULTURAL: Plant,
    NONPROFIT: HandHeart,
}

export function SectorProfilesPanel() {
    const [active, setActive] = useState<ActivityProfile[]>(['COMMERCIAL'])
    const [installed, setInstalled] = useState<Record<string, number>>({})
    const [busy, setBusy] = useState<ActivityProfile | null>(null)
    const [message, setMessage] = useState<string | null>(null)

    const refresh = useCallback(async () => {
        setActive(await getActiveProfiles())
        const counts: Record<string, number> = {}
        for (const profile of ACTIVITY_PROFILES) {
            counts[profile] = (await listSectorAccounts(profile)).length
        }
        setInstalled(counts)
    }, [])

    useEffect(() => {
        void refresh()
    }, [refresh])

    const toggle = async (profile: ActivityProfile, isActive: boolean) => {
        setBusy(profile)
        setMessage(null)
        try {
            if (isActive) {
                await deactivateSectorProfile(profile)
                setMessage(
                    `Se desactivó el perfil ${ACTIVITY_PROFILE_LABEL[profile]}. Las cuentas ya incorporadas se conservan: no se borró ninguna.`
                )
            } else {
                const result = await activateSectorProfile(profile)
                setMessage(
                    result.created.length > 0
                        ? `Se incorporaron ${result.created.length} cuentas del perfil ${ACTIVITY_PROFILE_LABEL[profile]}.`
                        : `El perfil ${ACTIVITY_PROFILE_LABEL[profile]} ya tenía todas sus cuentas en el plan; no se duplicó ninguna.`
                )
            }
            await refresh()
        } finally {
            setBusy(null)
        }
    }

    const vocabulary = vocabularyFor(active)

    return (
        <section className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="font-display font-semibold text-lg text-slate-900">Perfiles de actividad</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-3xl">
                El plan de cuentas tiene un núcleo común y extensiones sectoriales. Activar un perfil agrega al plan las
                cuentas que falten, con sus metadatos de exposición ya configurados. Desactivarlo no borra nada.
            </p>

            <div className="mt-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <Info weight="fill" size={16} className="text-blue-600 shrink-0 mt-0.5" aria-hidden />
                <p className="text-xs text-blue-900">
                    Exposición vigente: <strong>{vocabulary.incomeStatementTitle}</strong> · los ingresos se denominan{' '}
                    <strong>{vocabulary.revenueLabel}</strong> y el resultado,{' '}
                    <strong>{vocabulary.resultLabel.toLowerCase()}</strong>.
                </p>
            </div>

            {message && (
                <p className="mt-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-3" role="status">
                    {message}
                </p>
            )}

            <ul className="mt-5 space-y-3">
                {ACTIVITY_PROFILES.map(profile => {
                    const isActive = active.includes(profile)
                    const isCore = profile === 'COMMERCIAL'
                    const catalogSize = (SECTOR_CATALOG[profile] ?? []).length
                    const Icon = PROFILE_ICON[profile]

                    return (
                        <li
                            key={profile}
                            className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-slate-200 p-4"
                        >
                            <div className="w-10 h-10 shrink-0 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 flex items-center justify-center">
                                <Icon weight="duotone" size={22} aria-hidden />
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-slate-900">{ACTIVITY_PROFILE_LABEL[profile]}</span>
                                    {isActive && (
                                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                            <CheckCircle weight="fill" size={11} aria-hidden /> Activo
                                        </span>
                                    )}
                                    {isCore && (
                                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                                            Núcleo común
                                        </span>
                                    )}
                                </div>
                                <p className="text-sm text-slate-500 mt-0.5">{ACTIVITY_PROFILE_DESCRIPTION[profile]}</p>
                                {catalogSize > 0 && (
                                    <p className="text-xs text-slate-400 mt-1">
                                        Aporta {catalogSize} cuentas · {installed[profile] ?? 0} ya presentes en el plan
                                    </p>
                                )}
                            </div>

                            {!isCore && (
                                <button
                                    type="button"
                                    onClick={() => void toggle(profile, isActive)}
                                    disabled={busy === profile}
                                    className={`shrink-0 px-4 py-2 rounded-lg text-sm font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-60 ${
                                        isActive
                                            ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                            : 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
                                    }`}
                                >
                                    {busy === profile ? 'Aplicando…' : isActive ? 'Desactivar' : 'Activar'}
                                </button>
                            )}
                        </li>
                    )
                })}
            </ul>
        </section>
    )
}
