# Guía de Integración RT6 - CierreValuacionPage

Esta guía muestra cómo integrar los módulos RT6 automáticos en la página principal.

## Paso 1: Agregar Imports

```typescript
// En CierreValuacionPage.tsx, agregar estos imports:

import { useLedgerBalances } from '../../hooks/useLedgerBalances';
import { useAccountOverrides } from '../../hooks/useAccountOverrides';
import { autoGeneratePartidasRT6 } from '../../core/cierre-valuacion/auto-partidas-rt6';
import { calculateRecpamIndirecto } from '../../core/cierre-valuacion/recpam-indirecto';
import { MonetaryAccountsPanel } from './components/MonetaryAccountsPanel';
import { RecpamIndirectoDrawer } from './components/RecpamIndirectoDrawer';
import { toggleMonetaryClass, markAsValidated } from '../../hooks/useAccountOverrides';
```

## Paso 2: Agregar State

```typescript
// Después del state existente, agregar:

// Sub-tab state for Step 2 (Monetarias vs No Monetarias)
const [step2SubTab, setStep2SubTab] = useState<'monetarias' | 'nomonetarias'>('nomonetarias');

// RECPAM Drawer state
const [isRecpamDrawerOpen, setRecpamDrawerOpen] = useState(false);
const [recpamResult, setRecpamResult] = useState<RecpamIndirectoResult | null>(null);
const [recpamLoading, setRecpamLoading] = useState(false);
```

## Paso 3: Usar Hooks

```typescript
// Después de allJournalEntries, agregar:

// Ledger balances
const { byAccount: ledgerBalances, totals: ledgerTotals, loading: ledgerLoading } =
    useLedgerBalances(allJournalEntries, allAccounts, { closingDate });

// Account overrides
const { overrides, setOverride, clearOverride } = useAccountOverrides(
    state?.accountOverrides || {},
    (newOverrides) => {
        updateState(prev => ({ ...prev, accountOverrides: newOverrides }));
    }
);
```

## Paso 4: Handlers

```typescript
// Agregar estos handlers después de los existentes:

const handleCalcularAutomaticamente = useCallback(() => {
    if (!allAccounts || !ledgerBalances || !state) return;

    // Determinar inicio de período (simplificado: 1 año antes del cierre)
    const closingYear = parseInt(closingDate.split('-')[0]);
    const startOfPeriod = `${closingYear}-01-01`;

    // Auto-generar partidas
    const { partidas, stats } = autoGeneratePartidasRT6(
        allAccounts,
        ledgerBalances,
        state.accountOverrides || {},
        {
            startOfPeriod,
            closingDate,
            groupByMonth: true,
            minLotAmount: 100
        }
    );

    // Actualizar state
    updateState(prev => ({
        ...prev,
        partidasRT6: partidas
    }));

    showToast(`✓ Generadas ${stats.partidasGenerated} partidas con ${stats.lotsGenerated} lotes`);
}, [allAccounts, ledgerBalances, state, closingDate, updateState]);

const handleRecalcular = useCallback(() => {
    // Mismo que handleCalcularAutomaticamente pero respetando partidas manuales
    handleCalcularAutomaticamente();
}, [handleCalcularAutomaticamente]);

const handleToggleMonetaryClass = useCallback((accountId: string, currentClass: MonetaryClass) => {
    toggleMonetaryClass(accountId, currentClass, state?.accountOverrides || {}, (newOverrides) => {
        updateState(prev => ({ ...prev, accountOverrides: newOverrides }));
    });
    showToast('Clasificación actualizada');
}, [state, updateState]);

const handleMarkValidated = useCallback((accountId: string) => {
    markAsValidated(accountId, state?.accountOverrides || {}, (newOverrides) => {
        updateState(prev => ({ ...prev, accountOverrides: newOverrides }));
    });
}, [state, updateState]);

const handleMarkAllValidated = useCallback(() => {
    if (!allAccounts || !state) return;

    const newOverrides = { ...state.accountOverrides };
    for (const account of allAccounts) {
        if (!account.isHeader && !newOverrides[account.id]?.validated) {
            newOverrides[account.id] = { ...(newOverrides[account.id] || {}), validated: true };
        }
    }

    updateState(prev => ({ ...prev, accountOverrides: newOverrides }));
    showToast('Todas las cuentas marcadas como validadas');
}, [allAccounts, state, updateState]);

const handleOpenRecpamDrawer = useCallback(async () => {
    if (!allJournalEntries || !allAccounts || !state) return;

    setRecpamDrawerOpen(true);
    setRecpamLoading(true);

    try {
        const closingYear = parseInt(closingDate.split('-')[0]);
        const startOfPeriod = `${closingYear}-01-01`;

        const result = calculateRecpamIndirecto(
            allJournalEntries,
            allAccounts,
            state.accountOverrides || {},
            indices,
            startOfPeriod,
            closingDate
        );

        setRecpamResult(result);
    } catch (error) {
        console.error('Error calculating RECPAM:', error);
        showToast('Error al calcular RECPAM');
    } finally {
        setRecpamLoading(false);
    }
}, [allJournalEntries, allAccounts, state, closingDate, indices]);
```

## Paso 5: UI - Botones en Header

```typescript
// En el header de Step 2, reemplazar la sección de botones:

<div className="step2-actions">
    <button
        className="btn btn-secondary"
        onClick={handleOpenRecpamDrawer}
        disabled={ledgerLoading}
    >
        <i className="ph-bold ph-function" /> Método indirecto
    </button>
    <button
        className="btn btn-secondary"
        onClick={handleRecalcular}
        disabled={ledgerLoading}
    >
        <i className="ph-bold ph-arrows-clockwise" /> Recalcular
    </button>
    <button
        className="btn btn-primary"
        onClick={handleCalcularAutomaticamente}
        disabled={ledgerLoading}
    >
        <i className="ph-bold ph-magic-wand" /> Calcular automáticamente
    </button>
</div>
```

## Paso 6: UI - Sub-tabs

```typescript
// En el contenido de activeTab === 'reexpresion', agregar sub-tabs:

{activeTab === 'reexpresion' && (
    <div className="step2-container">
        {/* Sub-tabs */}
        <div className="step2-tabs">
            <button
                className={`step2-tab ${step2SubTab === 'monetarias' ? 'active' : ''}`}
                onClick={() => setStep2SubTab('monetarias')}
            >
                <i className="ph-fill ph-currency-dollar" />
                Partidas Monetarias
                <span className="badge">{ledgerTotals.totalNonZero || 0}</span>
            </button>
            <button
                className={`step2-tab ${step2SubTab === 'nomonetarias' ? 'active' : ''}`}
                onClick={() => setStep2SubTab('nomonetarias')}
            >
                <i className="ph ph-package" />
                Partidas No Monetarias
                <span className="badge">{computedRT6.length}</span>
            </button>
        </div>

        {/* Tab Content */}
        {step2SubTab === 'monetarias' && (
            <MonetaryAccountsPanel
                accounts={allAccounts}
                balances={ledgerBalances}
                overrides={state?.accountOverrides || {}}
                onToggleClassification={handleToggleMonetaryClass}
                onMarkValidated={handleMarkValidated}
                onMarkAllValidated={handleMarkAllValidated}
                onExclude={(accountId) => {
                    setOverride(accountId, { exclude: true });
                    showToast('Cuenta excluida');
                }}
            />
        )}

        {step2SubTab === 'nomonetarias' && (
            <Step2RT6Panel
                computedRT6={computedRT6}
                onAddPartida={() => handleOpenRT6Drawer()}
                onEditPartida={(id) => handleOpenRT6Drawer(id)}
                onDeletePartida={(id) => setDeleteConfirm({ type: 'RT6', id })}
            />
        )}
    </div>
)}
```

## Paso 7: Drawers

```typescript
// Al final del return, antes de </div>, agregar:

<RecpamIndirectoDrawer
    isOpen={isRecpamDrawerOpen}
    onClose={() => setRecpamDrawerOpen(false)}
    result={recpamResult}
    loading={recpamLoading}
/>
```

## Ejemplo de Flujo Completo

```typescript
// 1. Usuario carga la página
// → useLedgerBalances calcula automáticamente balances del Mayor

// 2. Usuario hace click en "Calcular automáticamente"
// → handleCalcularAutomaticamente ejecuta:
//   - autoGeneratePartidasRT6 → genera partidas desde ledger
//   - updateState → guarda en partidasRT6

// 3. Usuario revisa tab "Partidas Monetarias"
// → MonetaryAccountsPanel muestra clasificación auto
// → Usuario puede reclasificar, validar, excluir

// 4. Usuario hace click en "Método indirecto"
// → handleOpenRecpamDrawer ejecuta:
//   - calculateRecpamIndirecto → calcula RECPAM mes a mes
//   - RecpamIndirectoDrawer muestra resultado

// 5. Usuario hace click en "Recalcular"
// → Regenera partidas respetando overrides (validated, classification, etc.)
```

## Estilos CSS

```css
/* Agregar al final del <style> existente */

.step2-container {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
}

.step2-tabs {
    display: flex;
    gap: var(--space-sm);
    border-bottom: 1px solid var(--color-border);
}

.step2-tab {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    padding: var(--space-sm) var(--space-md);
    background: none;
    border: none;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-text-secondary);
    cursor: pointer;
    position: relative;
    transition: color 0.2s;
    border-bottom: 2px solid transparent;
}

.step2-tab:hover {
    color: var(--color-text);
}

.step2-tab.active {
    color: var(--brand-primary);
    border-bottom-color: var(--brand-primary);
    background: rgba(59, 130, 246, 0.05);
}

.step2-tab .badge {
    background: var(--surface-3);
    color: var(--color-text-secondary);
    font-size: var(--font-size-xs);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
}

.step2-tab.active .badge {
    background: var(--brand-primary);
    color: white;
}

.step2-actions {
    display: flex;
    gap: var(--space-sm);
}
```

## Testing

```typescript
// Test 1: Verificar que ledgerBalances se calcula
console.log('Ledger balances:', ledgerBalances);
console.log('Total accounts with balance:', ledgerTotals.totalNonZero);

// Test 2: Ejecutar auto-generación manualmente
const result = autoGeneratePartidasRT6(allAccounts, ledgerBalances, {}, {
    startOfPeriod: '2026-01-01',
    closingDate: '2026-12-31',
    groupByMonth: true
});
console.log('Auto-generated partidas:', result.partidas);
console.log('Stats:', result.stats);

// Test 3: Calcular RECPAM
const recpam = calculateRecpamIndirecto(
    allJournalEntries, allAccounts, {}, indices,
    '2026-01-01', '2026-12-31'
);
console.log('RECPAM total:', recpam.total);
console.log('Monthly breakdown:', recpam.monthly);
```

## Notas Importantes

1. **Estado inicial:** El state ya debe tener `accountOverrides: {}` (inicializado en `createInitialState`)
2. **Performance:** `useLedgerBalances` se recalcula solo cuando cambian entries o accounts (memoizado)
3. **Overrides persistentes:** Se guardan automáticamente en IndexedDB via `debouncedSave`
4. **Partidas manuales:** Para preservarlas al recalcular, usar `mergeAutoPartidas` (futuro enhancement)

## Troubleshooting

**Problema:** Ledger balances vacío
**Solución:** Verificar que `allJournalEntries` y `allAccounts` no estén undefined

**Problema:** Clasificación incorrecta
**Solución:** Revisar heurísticas en `monetary-classification.ts`, agregar más mappings

**Problema:** RECPAM con signo incorrecto
**Solución:** Verificar fórmula `PMN * (coef - 1) * -1` (el -1 invierte el signo)

**Problema:** Performance lenta con muchos asientos
**Solución:** Usar `groupByMonth: true` y `minLotAmount > 0` para filtrar ruido
