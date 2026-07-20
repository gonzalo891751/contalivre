/**
 * AcceptanceFixturePanel — Fase 2F (§5): fixture "ContaLivre RC Acceptance".
 *
 * Panel de ENTORNO DE PRUEBA (no se monta en producción): carga el dataset
 * determinista de aceptación (ejercicios fijos 2024/2025), activa/revierte la
 * variante de estado bloqueado y elimina todo mediante el reseteo total
 * existente. Identificado explícitamente como fixture; no es la Práctica
 * guiada ni contiene datos reales.
 */

import { useEffect, useState } from 'react'
import {
    RC_CURRENT_YEAR,
    RC_PRIOR_YEAR,
    isRcDatasetLoaded,
    isSafeToLoad,
    loadRcAcceptanceDataset,
    postRcUnmappedVariant,
    revertRcUnmappedVariant,
} from '../../../accounting/fixtures/rcAcceptance'
import { resetApplication } from '../../../accounting/maintenance/resetService'

export function AcceptanceFixturePanel() {
    const [loaded, setLoaded] = useState<boolean | null>(null)
    const [safe, setSafe] = useState<{ safe: boolean; reason?: string } | null>(null)
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState<string | null>(null)

    const refresh = () => {
        isRcDatasetLoaded().then(setLoaded)
        isSafeToLoad().then(setSafe)
    }
    useEffect(refresh, [])

    const run = async (label: string, fn: () => Promise<unknown>) => {
        setBusy(true)
        setMessage(null)
        try {
            await fn()
            setMessage(`✓ ${label}`)
        } catch (e) {
            setMessage(`✗ ${label}: ${e instanceof Error ? e.message : String(e)}`)
        } finally {
            setBusy(false)
            refresh()
        }
    }

    return (
        <div className="card" style={{ padding: 16, marginBottom: 16, borderLeft: '4px solid #8b5cf6' }} data-testid="rc-fixture-panel">
            <h3 style={{ margin: '0 0 4px', fontSize: '1rem' }}>Fixture de aceptación — ContaLivre RC Acceptance</h3>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0 0 12px', lineHeight: 1.5 }}>
                Dataset determinista de TESTING (ejercicios fijos {RC_PRIOR_YEAR} comparativo y {RC_CURRENT_YEAR} actual)
                para la validación visual y E2E de la Release Candidate. Solo se carga sobre una base sin asientos
                reales; se elimina con el reseteo total. Este panel no existe en producción.
            </p>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                    className="btn btn-primary btn-sm"
                    data-testid="rc-load"
                    disabled={busy || safe?.safe === false}
                    title={safe?.safe === false ? safe.reason : 'Cargar el dataset completo (idempotente)'}
                    onClick={() => run('Dataset RC cargado', loadRcAcceptanceDataset)}
                >
                    Cargar dataset RC
                </button>
                <button
                    className="btn btn-secondary btn-sm"
                    data-testid="rc-unmapped-on"
                    disabled={busy || !loaded}
                    onClick={() => run('Variante sin mapping activada (estados bloqueados)', postRcUnmappedVariant)}
                >
                    Activar variante bloqueada
                </button>
                <button
                    className="btn btn-secondary btn-sm"
                    data-testid="rc-unmapped-off"
                    disabled={busy || !loaded}
                    onClick={() => run('Variante revertida (estados validados)', revertRcUnmappedVariant)}
                >
                    Revertir variante
                </button>
                <button
                    className="btn btn-secondary btn-sm"
                    data-testid="rc-delete"
                    disabled={busy}
                    style={{ color: '#b91c1c' }}
                    onClick={() => {
                        if (window.confirm('Reseteo TOTAL del entorno de prueba (borra todos los datos). ¿Continuar?')) {
                            void run('Entorno de prueba reseteado', () => resetApplication('rc-fixture'))
                        }
                    }}
                >
                    Eliminar (reseteo total)
                </button>
            </div>

            <div style={{ marginTop: 10, fontSize: '0.78rem', color: '#475569' }} data-testid="rc-status">
                Estado: {loaded == null ? '…' : loaded ? 'dataset cargado' : 'sin dataset'}
                {safe?.safe === false && <span style={{ color: '#b45309' }}> · {safe.reason}</span>}
                {message && <div style={{ marginTop: 4 }}>{message}</div>}
            </div>
        </div>
    )
}
