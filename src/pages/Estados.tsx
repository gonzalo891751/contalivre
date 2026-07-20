/**
 * Estados contables — Fase 2C (§5): consumen EXCLUSIVAMENTE el motor canónico.
 *
 * Toda cifra sale de un único loadReportingBundle(year). No hay presentadores
 * legacy, ni cálculos en componentes, ni localStorage como fuente contable,
 * ni heurísticas por nombre. ESP/ER/EEPN/EFE/Notas + indicadores + análisis +
 * validación + metadatos vienen del mismo bundle y del mismo ReportingContext.
 */

import { useEffect, useState, useCallback } from 'react'
import { usePeriodYear } from '../hooks/usePeriodYear'
import { useCompanyProfile } from '../hooks/useCompanyProfile'
import { CompanyProfileModal } from '../components/CompanyProfile'
import '../components/CompanyProfile/CompanyProfile.css'
import { EstadosHeader, type EstadosTab } from '../components/Estados/EstadosHeader'
import {
    ESPCanonicalTab,
    ERCanonicalTab,
    EEPNCanonicalTab,
    NotasCanonicalTab,
} from '../components/Estados/canonical/CanonicalTabs'
import FlujoEfectivoCanonicalTab from '../components/Estados/canonical/FlujoEfectivoCanonicalTab'
import { ReportMetadataBar } from '../components/Estados/canonical/ReportMetadataBar'
import { ExportEstadosModal } from '../components/Estados/ExportEstadosModal'
import { loadReportingBundle, type ReportingBundle } from '../reporting/loadReportingBundle'
import { createSnapshot, listSnapshots } from '../reporting/snapshots/snapshotService'

export default function Estados() {
    const [activeTab, setActiveTab] = useState<EstadosTab>('ESP')
    const [noteFocus, setNoteFocus] = useState<string | null>(null)
    const { year } = usePeriodYear()

    const openNote = useCallback((ref: string) => {
        setNoteFocus(ref)
        setActiveTab('NA')
    }, [])

    const { profile: companyProfile, save: saveCompanyProfile, isSaving: isSavingCompanyProfile } = useCompanyProfile()
    const [showCompanyProfileModal, setShowCompanyProfileModal] = useState(false)
    const empresaName = companyProfile?.legalName || 'Empresa ContaLivre'

    const [showComparative, setShowComparative] = useState(false)
    const [bundle, setBundle] = useState<ReportingBundle | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [reloadKey, setReloadKey] = useState(0)
    const [showExportModal, setShowExportModal] = useState(false)
    const [snapshotInfo, setSnapshotInfo] = useState<string | null>(null)

    useEffect(() => {
        listSnapshots().then(list => {
            const forYear = list.filter(s => s.exerciseId.includes(String(year)))
            if (forYear.length > 0) {
                const last = forYear[0]
                setSnapshotInfo(`${forYear.length} versión(es) validada(s) de este ejercicio · última: ${last.status} (${last.createdAt.slice(0, 10)}, v${last.reportVersion})`)
            } else {
                setSnapshotInfo(null)
            }
        })
    }, [year, reloadKey])

    const handlePublishSnapshot = useCallback(async () => {
        if (!bundle) return
        const snap = await createSnapshot(bundle, { status: 'PUBLISHED' })
        setSnapshotInfo(`Versión validada guardada (${snap.status}, v${snap.reportVersion}, ${snap.createdAt.slice(0, 10)}).`)
        setReloadKey(k => k + 1)
    }, [bundle])

    useEffect(() => {
        let cancelled = false
        setLoading(true)
        setError(null)
        loadReportingBundle(year, { withComparative: showComparative })
            .then(b => { if (!cancelled) { setBundle(b); setLoading(false) } })
            .catch(e => { if (!cancelled) { setError(e instanceof Error ? e.message : String(e)); setLoading(false) } })
        return () => { cancelled = true }
    }, [year, showComparative, reloadKey])

    return (
        <div className="estados-page">
            <EstadosHeader activeTab={activeTab} onTabChange={setActiveTab} empresaName={empresaName} />

            <main className="estados-main">
                {loading && (
                    <div className="empty-state">
                        <div className="empty-state-icon">⏳</div>
                        <p>Calculando estados desde el motor canónico…</p>
                    </div>
                )}

                {!loading && error && (
                    <div className="card" style={{ padding: 20, borderLeft: '4px solid #ef4444' }}>
                        <strong>No se pudo generar el reporte.</strong>
                        <p style={{ marginTop: 6, color: '#64748b' }}>{error}</p>
                        <button className="btn btn-secondary" style={{ marginTop: 10 }} onClick={() => setReloadKey(k => k + 1)}>
                            Reintentar
                        </button>
                    </div>
                )}

                {!loading && !error && bundle && (
                    <div className="animate-slide-up" role="tabpanel" aria-label={`Contenido: ${activeTab}`}>
                        <ReportMetadataBar
                            metadata={bundle.metadata}
                            showComparative={showComparative}
                            onToggleComparative={() => setShowComparative(v => !v)}
                            onExport={() => setShowExportModal(true)}
                            onEditCompany={() => setShowCompanyProfileModal(true)}
                            onPublishSnapshot={handlePublishSnapshot}
                            snapshotInfo={snapshotInfo ?? undefined}
                        />

                        {activeTab === 'ESP' && <ESPCanonicalTab bundle={bundle} onOpenNote={openNote} />}
                        {activeTab === 'ER' && <ERCanonicalTab bundle={bundle} onOpenNote={openNote} />}
                        {activeTab === 'EPN' && <EEPNCanonicalTab bundle={bundle} />}
                        {activeTab === 'EFE' && <FlujoEfectivoCanonicalTab bundle={bundle} />}
                        {activeTab === 'NA' && <NotasCanonicalTab bundle={bundle} focusNote={noteFocus} onDataChanged={() => setReloadKey(k => k + 1)} />}
                    </div>
                )}
            </main>

            {showExportModal && bundle && (
                <ExportEstadosModal bundle={bundle} onClose={() => setShowExportModal(false)} />
            )}

            <CompanyProfileModal
                isOpen={showCompanyProfileModal}
                onClose={() => setShowCompanyProfileModal(false)}
                profile={companyProfile}
                onSave={saveCompanyProfile}
                isSaving={isSavingCompanyProfile}
            />

            <style>{pageStyles}</style>
        </div>
    )
}

const pageStyles = `
.estados-page { min-height: 100vh; background: #f8fafc; }
.estados-main { max-width: 1280px; margin: 0 auto; padding: 24px 16px; position: relative; }
@media (min-width: 640px) { .estados-main { padding: 32px 24px; } }
@media (min-width: 1024px) { .estados-main { padding: 32px; } }
.animate-slide-up { animation: slideUp 0.4s ease-out forwards; }
@keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) {
    .animate-slide-up { animation: none; }
}
.empty-state { text-align: center; padding: 64px 32px; color: #64748b; }
.empty-state-icon { font-size: 3rem; margin-bottom: 16px; }
.card { background: white; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); border: 1px solid #f1f5f9; }
`
