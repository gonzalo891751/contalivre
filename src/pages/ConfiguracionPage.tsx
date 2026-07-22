/**
 * ConfiguracionPage — Fase 2D (§4): hub único de Configuración con menú interno.
 *
 * Consolida las opciones técnicas dispersas (mapeos, respaldo, versión,
 * capacidades) y la gestión de empresa/ejercicios, más la zona peligrosa de
 * datos. Reemplaza el acceso suelto a /mapeos (ahora sección interna) y a la
 * información técnica antes en "Acerca de".
 */

import { useMemo, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import {
    Gear, Buildings, CalendarBlank, TreeStructure, TrendUp,
    UploadSimple, FloppyDisk, Database, Info,
    type Icon as PhosphorIcon,
} from '@phosphor-icons/react'
import { useCompanyProfile } from '../hooks/useCompanyProfile'
import { CompanyProfileModal, CompanyProfileCard } from '../components/CompanyProfile'
import { MapeosPanel } from '../components/Configuracion/panels/MapeosPanel'
import { EfePoliticasPanel } from '../components/Configuracion/panels/EfePoliticasPanel'
import { EjerciciosPanel } from '../components/Configuracion/panels/EjerciciosPanel'
import { BackupPanel } from '../components/Configuracion/panels/BackupPanel'
import { VersionInfoPanel } from '../components/Configuracion/panels/VersionInfoPanel'
import { CapabilitiesPanel } from '../components/Configuracion/panels/CapabilitiesPanel'
import { DangerZonePanel } from '../components/Configuracion/panels/DangerZonePanel'
import { AcceptanceFixturePanel } from '../components/Configuracion/panels/AcceptanceFixturePanel'
import { ExpenseAllocationEditor } from '../components/Configuracion/panels/ExpenseAllocationEditor'

/** El fixture de aceptación RC solo existe fuera de producción (Fase 2F §5) */
const SHOW_RC_FIXTURE = import.meta.env.MODE !== 'production'

type SectionId =
    | 'general' | 'empresa' | 'ejercicios' | 'plan-cuentas'
    | 'inflacion' | 'importaciones' | 'respaldo' | 'datos' | 'acerca'

interface SectionDef {
    id: SectionId
    label: string
    icon: PhosphorIcon
    hint: string
}

const SECTIONS: SectionDef[] = [
    { id: 'general', label: 'General', icon: Gear, hint: 'Resumen y accesos rápidos' },
    { id: 'empresa', label: 'Empresa', icon: Buildings, hint: 'Ficha e identificación fiscal' },
    { id: 'ejercicios', label: 'Ejercicios', icon: CalendarBlank, hint: 'Alta, cierre y reapertura' },
    { id: 'plan-cuentas', label: 'Plan de cuentas y mapeos', icon: TreeStructure, hint: 'Metadata contable de cuentas' },
    { id: 'inflacion', label: 'Inflación', icon: TrendUp, hint: 'Índices y ajuste por inflación' },
    { id: 'importaciones', label: 'Importaciones', icon: UploadSimple, hint: 'Carga de planillas y datos' },
    { id: 'respaldo', label: 'Respaldo', icon: FloppyDisk, hint: 'Exportar y restaurar' },
    { id: 'datos', label: 'Datos', icon: Database, hint: 'Zona peligrosa' },
    { id: 'acerca', label: 'Acerca', icon: Info, hint: 'Versión y capacidades' },
]

const VALID_IDS = new Set(SECTIONS.map(s => s.id))

export default function ConfiguracionPage() {
    const [params, setParams] = useSearchParams()
    const navigate = useNavigate()
    const raw = params.get('seccion') ?? 'general'
    const active: SectionId = (VALID_IDS.has(raw as SectionId) ? raw : 'general') as SectionId

    const { profile, isConfigured, save, isSaving } = useCompanyProfile()
    const [showCompanyModal, setShowCompanyModal] = useState(false)

    const activeDef = useMemo(() => SECTIONS.find(s => s.id === active)!, [active])

    const go = (id: SectionId) => setParams({ seccion: id })

    return (
        <div className="cfg-page">
            <header className="page-header" style={{ maxWidth: 1200, margin: '0 auto', padding: '0 8px' }}>
                <h1 className="page-title">Configuración</h1>
                <p className="page-subtitle">Empresa, ejercicios, plan de cuentas, respaldo y datos</p>
            </header>

            <div className="cfg-layout">
                <nav className="cfg-menu" aria-label="Secciones de configuración">
                    {SECTIONS.map(s => {
                        const Icon = s.icon
                        return (
                            <button
                                key={s.id}
                                className={`cfg-menu-item${active === s.id ? ' active' : ''}`}
                                onClick={() => go(s.id)}
                                aria-current={active === s.id ? 'page' : undefined}
                            >
                                <Icon size={18} weight={active === s.id ? 'fill' : 'regular'} />
                                <span className="cfg-menu-labels">
                                    <span className="cfg-menu-label">{s.label}</span>
                                    <span className="cfg-menu-hint">{s.hint}</span>
                                </span>
                            </button>
                        )
                    })}
                </nav>

                <section className="cfg-content">
                    <h2 className="cfg-content-title">{activeDef.label}</h2>

                    {active === 'general' && (
                        <div>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                                Desde acá gestionás todo lo transversal de ContaLivre. Elegí una sección en el menú.
                            </p>
                            <div className="cfg-quick-grid">
                                {SECTIONS.filter(s => s.id !== 'general').map(s => {
                                    const Icon = s.icon
                                    return (
                                        <button key={s.id} className="cfg-quick-card" onClick={() => go(s.id)}>
                                            <Icon size={22} />
                                            <strong>{s.label}</strong>
                                            <span>{s.hint}</span>
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    )}

                    {active === 'empresa' && (
                        <div style={{ maxWidth: 560 }}>
                            <CompanyProfileCard
                                profile={profile}
                                isConfigured={isConfigured}
                                onEdit={() => setShowCompanyModal(true)}
                                onPrintPdf={() => window.print()}
                            />
                        </div>
                    )}

                    {active === 'ejercicios' && <EjerciciosPanel />}

                    {active === 'plan-cuentas' && (
                        <div>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                                <button className="btn btn-secondary btn-sm" onClick={() => navigate('/cuentas')}>Abrir Plan de Cuentas</button>
                            </div>
                            <MapeosPanel />
                            <EfePoliticasPanel />
                            <ExpenseAllocationEditor />
                        </div>
                    )}

                    {active === 'inflacion' && (
                        <div>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                                El ajuste por inflación (AxI) y la valuación al cierre viven en la planilla de Cierre.
                                Ahí cargás los índices y generás la reexpresión que alimenta los estados en moneda de cierre.
                            </p>
                            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/planillas/cierre-valuacion')}>
                                Ir a Cierre (AxI + Valuación)
                            </button>
                        </div>
                    )}

                    {active === 'importaciones' && (
                        <div>
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                                La importación de planillas se realiza dentro de cada módulo (Plan de Cuentas,
                                Inventario, Bienes de Uso, etc.), con validación de límites y vista previa antes de aplicar.
                                Para restaurar un respaldo completo, usá la sección Respaldo.
                            </p>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <button className="btn btn-secondary btn-sm" onClick={() => navigate('/cuentas')}>Plan de Cuentas</button>
                                <button className="btn btn-secondary btn-sm" onClick={() => go('respaldo')}>Restaurar respaldo</button>
                            </div>
                        </div>
                    )}

                    {active === 'respaldo' && <BackupPanel />}

                    {active === 'datos' && (
                        <div>
                            {SHOW_RC_FIXTURE && <AcceptanceFixturePanel />}
                            <DangerZonePanel />
                        </div>
                    )}

                    {active === 'acerca' && (
                        <div style={{ maxWidth: 760 }}>
                            <VersionInfoPanel />
                            <CapabilitiesPanel />
                        </div>
                    )}
                </section>
            </div>

            <CompanyProfileModal
                isOpen={showCompanyModal}
                onClose={() => setShowCompanyModal(false)}
                profile={profile}
                onSave={save}
                isSaving={isSaving}
            />

            <style>{styles}</style>
        </div>
    )
}

const styles = `
.cfg-page { max-width: 1200px; margin: 0 auto; padding: 24px 16px; }
.cfg-layout { display: grid; grid-template-columns: 260px 1fr; gap: 24px; align-items: start; margin-top: 8px; }
@media (max-width: 860px) { .cfg-layout { grid-template-columns: 1fr; } }

.cfg-menu { display: flex; flex-direction: column; gap: 4px; position: sticky; top: 16px; }
@media (max-width: 860px) { .cfg-menu { position: static; flex-direction: row; overflow-x: auto; padding-bottom: 6px; } }
.cfg-menu-item {
    display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 10px;
    border: 1px solid transparent; background: transparent; cursor: pointer; text-align: left;
    color: #475569; transition: all 0.15s ease; white-space: nowrap;
}
.cfg-menu-item:hover { background: #f1f5f9; }
.cfg-menu-item.active { background: white; border-color: #e2e8f0; color: #2563eb; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
.cfg-menu-labels { display: flex; flex-direction: column; }
.cfg-menu-label { font-size: 0.88rem; font-weight: 600; }
.cfg-menu-hint { font-size: 0.7rem; color: #94a3b8; }
@media (max-width: 860px) { .cfg-menu-hint { display: none; } }

.cfg-content { min-width: 0; }
.cfg-content-title { font-size: 1.35rem; font-weight: 800; color: #0f172a; margin: 0 0 16px; }

.cfg-quick-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.cfg-quick-card {
    display: flex; flex-direction: column; align-items: flex-start; gap: 4px; text-align: left;
    padding: 16px; border: 1px solid #e2e8f0; border-radius: 12px; background: white; cursor: pointer;
    color: #64748b; transition: all 0.15s ease;
}
.cfg-quick-card:hover { border-color: #cbd5e1; transform: translateY(-1px); box-shadow: 0 4px 10px rgba(0,0,0,0.05); }
.cfg-quick-card strong { color: #0f172a; font-size: 0.92rem; }
.cfg-quick-card span { font-size: 0.75rem; }
`
