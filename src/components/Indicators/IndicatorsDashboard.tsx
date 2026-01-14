import { useState, useMemo } from 'react';
import {
    Info,
    Coins,
    Landmark,
    TrendingUp,
    CheckCircle2,
    AlertTriangle
} from 'lucide-react';
import styles from './IndicatorsDashboard.module.css';
import { useIndicatorsMetrics, type FinancialData } from '../../hooks/useIndicatorsMetrics';
import {
    getStatus,
    formatCurrency,
    formatNumber,
    formatPercent,
    safeDiv,
    type GroupId,
    type ChartType,
    type Sentiment
} from '../../utils/indicators';

// --- 1. TYPES & INTERFACES ---
interface IndicatorResult {
    id: string;
    title: string;
    value: number | null;
    formattedValue: string;
    group: GroupId;
    sentiment: Sentiment;
    statusLabel: string; // "Sólido", "Alerta", etc.
    formula: string;
    explanation: string;
    interpretation: string;
    chartType: ChartType;
    thresholdMin?: number;
    thresholdMax?: number;
}

// --- 2. SUB-COMPONENTS ---

// A. Micro Gauge SVG
const MicroGauge = ({ value, max, sentiment }: { value: number, max: number, sentiment: Sentiment }) => {
    // Normalizar
    const limit = max * 1.5;
    const safeVal = Math.max(0, Math.min(limit, value));
    const percentage = (safeVal / limit) * 100;

    const colorMap: Record<string, string> = {
        success: '#10B981', // emerald-500
        warning: '#F59E0B', // amber-500
        error: '#EF4444',   // red-500
        info: '#3B82F6',    // blue-500
        neutral: '#CBD5E1'  // slate-300
    };

    const radius = 14;
    const circumference = radius * Math.PI;
    const offset = circumference - ((percentage / 100) * circumference);

    return (
        <div className={styles.microGaugeContainer}>
            <svg className={styles.microGaugeSvg} viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="14" fill="none" stroke="#E2E8F0" strokeWidth="4"
                    strokeDasharray={`${circumference} ${circumference}`} transform="rotate(180 18 18)" />
                <circle cx="18" cy="18" r="14" fill="none" stroke={colorMap[sentiment] || colorMap.neutral} strokeWidth="4"
                    strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={offset}
                    strokeLinecap="round" transform="rotate(180 18 18)" className="transition-all duration-700 ease-out" />
            </svg>
        </div>
    );
};

// B. Status Dot
const StatusDot = ({ sentiment }: { sentiment: Sentiment }) => {
    const dotClass = {
        success: styles.dotSuccess,
        warning: styles.dotWarning,
        error: styles.dotError,
        info: styles.dotInfo,
        neutral: styles.dotNeutral
    }[sentiment];

    return <div className={`${styles.statusDot} ${dotClass}`} />;
};

// C. Indicator Card
const IndicatorCard = ({ data }: { data: IndicatorResult }) => {
    const isND = data.sentiment === 'neutral' && data.value === null;

    const containerClasses = isND ? styles.cardND : '';

    const textStatusColor = {
        success: styles.pillSuccess,
        warning: styles.pillWarning,
        error: styles.pillError,
        info: styles.pillInfo,
        neutral: styles.pillNeutral
    }[data.sentiment];

    return (
        <div className={`${styles.card} ${containerClasses}`}>

            {/* 1. Header: Dot + Title + Info */}
            <div className={styles.cardHeader}>
                <div className={styles.cardTitleGroup}>
                    <StatusDot sentiment={data.sentiment} />
                    <div className={styles.cardTitle}>
                        {data.title}
                    </div>
                </div>

                {/* Tooltip Wrapper */}
                <div className={`${styles.tooltipWrapper} group/tooltip`}>
                    <Info
                        size={18}
                        className={styles.infoIcon}
                    />
                    {/* Tooltip Content */}
                    <div className={styles.tooltipContent}>
                        <div className="font-mono text-blue-300 mb-1.5 border-b border-slate-700 pb-1.5">{data.formula}</div>
                        <p className="mb-2 text-slate-300 leading-relaxed font-sans">{data.explanation}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                            <CheckCircle2 className="text-emerald-400 shrink-0" size={12} />
                            <span className="text-emerald-100 italic">{data.interpretation}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 2. Value + MicroChart */}
            <div className={styles.cardFooter}>
                <div className={styles.valueGroup}>
                    <span className={`${styles.value} ${isND ? styles.valueND : ''}`}>
                        {data.formattedValue}
                    </span>

                    {/* Status Label Pill */}
                    <span className={`${styles.pill} ${textStatusColor}`}>
                        {data.statusLabel}
                    </span>
                </div>

                {/* Chart (Solo si no es N/D y es tipo gauge) */}
                {!isND && data.chartType === 'gauge' && data.value !== null && (
                    <div className="mb-1">
                        <MicroGauge value={data.value} max={data.thresholdMax || 2} sentiment={data.sentiment} />
                    </div>
                )}
            </div>
        </div>
    );
};

// D. Integral Score Card (Restored Design)
const IntegralScoreCard = ({ scores }: { scores: { fin: number | null, pat: number | null, eco: number | null, avg: number } }) => {

    const getBadgeStyle = (s: number) => {
        if (s >= 8) return { label: 'Excelente', className: styles.badgeExcellent };
        if (s >= 7) return { label: 'Muy Buena', className: styles.badgeVeryGood };
        if (s >= 6) return { label: 'Buena', className: styles.badgeGood };
        if (s >= 4) return { label: 'Regular', className: styles.badgeRegular };
        return { label: 'Mala', className: styles.badgeBad };
    };

    const badge = getBadgeStyle(scores.avg);

    // Circle Math
    const r = 58;
    const c = 2 * Math.PI * r;
    const offset = c - ((scores.avg / 10) * c);

    return (
        <div className={styles.integralCard}>

            {/* Left: Gauge */}
            <div className={styles.integralLeft}>
                <h3 className={styles.integralTitle}>Salud Financiera</h3>

                <div className={styles.gaugeContainer}>
                    {/* Track */}
                    <svg className="w-full h-full transform -rotate-90">
                        <circle cx="80" cy="80" r={r} stroke="#E2E8F0" strokeWidth="10" fill="transparent" />
                        <circle cx="80" cy="80" r={r} stroke={scores.avg >= 6 ? '#10B981' : '#F59E0B'} strokeWidth="10"
                            fill="transparent" strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
                            className="transition-all duration-1000 ease-out" />
                    </svg>
                    <div className={styles.integralScore}>
                        <span className={styles.scoreValue}>{scores.avg.toFixed(1)}</span>
                        <span className={styles.scoreLabel}>GLOBAL</span>
                    </div>
                </div>

                <div className={`${styles.badge} ${badge.className}`}>
                    {badge.label}
                </div>
            </div>

            {/* Right: Progress Bars */}
            <div className={styles.integralRight}>
                <h3 className={styles.breakdownTitle}>Desglose por Capacidad</h3>

                <div className={styles.barsContainer}>
                    {[
                        { label: 'Capacidad Financiera', val: scores.fin, barClass: styles.barBlue },
                        { label: 'Capacidad Patrimonial', val: scores.pat, barClass: styles.barEmerald },
                        { label: 'Capacidad Económica', val: scores.eco, barClass: styles.barIndigo }
                    ].map((item, idx) => (
                        <div key={idx}>
                            <div className={styles.barHeader}>
                                <span className={styles.barLabel}>{item.label}</span>
                                <span className={styles.barValue}>
                                    {item.val !== null ? item.val.toFixed(1) : 'N/D'} <span className="text-slate-400 font-normal">/ 10</span>
                                </span>
                            </div>
                            <div className={styles.barTrack}>
                                <div
                                    className={`${styles.barFill} ${item.val === null ? 'bg-slate-300' : item.barClass}`}
                                    style={{ width: item.val === null ? '0%' : `${(item.val / 10) * 100}%` }}
                                ></div>
                            </div>
                        </div>
                    ))}
                </div>

                {scores.eco === null && (
                    <div className={styles.warningBox}>
                        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                        <p>El puntaje global no incluye la capacidad económica por falta de datos en el Estado de Resultados.</p>
                    </div>
                )}
            </div>
        </div>
    );
};


// --- 4. MAIN DASHBOARD ---

export default function IndicatorsDashboard() {
    const [activeTab, setActiveTab] = useState<GroupId>('financiero');

    // --- REAL DATA CONNECTION ---
    const data: FinancialData | null = useIndicatorsMetrics();

    // --- CALCULATION ENGINE ---
    const indicators: IndicatorResult[] = useMemo(() => {
        if (!data) return [];

        const list: IndicatorResult[] = [];

        // --- HELPERS FOR COMPONENT SPECIFIC LOGIC ---
        // We override getStatus defaults to handle specific "Reasons" for N/D
        const resolveStatus = (
            val: number | null,
            min: number,
            max: number,
            labels: { good: string, mid: string, bad: string },
            inverted = false,
            missingReason: string = 'N/D'
        ) => {
            const base = getStatus(val, min, max, labels, inverted);
            if (base.statusLabel === 'N/D') {
                return { ...base, statusLabel: missingReason };
            }
            return base;
        };

        // --- A. FINANCIEROS ---
        const ct = safeDiv(data.activoCorriente - data.pasivoCorriente, 1); // safe math
        const lc = safeDiv(data.activoCorriente, data.pasivoCorriente);

        // Pa & Cash require VALID mappings. If data is null, ratio is null.
        const pa = (data.inventarios === null) ? null : safeDiv(data.activoCorriente - data.inventarios, data.pasivoCorriente);
        const cash = (data.disponibilidades === null) ? null : safeDiv(data.disponibilidades, data.pasivoCorriente);

        // Placeholders
        const pprac = null;
        const ppepc = null;
        const lcn = null;
        const cob = null;
        const ccc = null;

        list.push(
            {
                id: 'ct', group: 'financiero', title: 'Capital de Trabajo', value: ct, formattedValue: formatCurrency(ct),
                ...resolveStatus(ct, 0, Infinity, { good: 'Positivo', mid: 'Ajustado', bad: 'Déficit' }),
                formula: 'AC - PC', explanation: 'Fondo de maniobra operativo.', interpretation: 'Debe ser > 0.', chartType: 'none'
            },

            {
                id: 'lc', group: 'financiero', title: 'Liquidez Corriente', value: lc, formattedValue: formatNumber(lc),
                ...resolveStatus(lc, 1.5, 2.0, { good: 'Sólido', mid: 'Aceptable', bad: 'Riesgo' }),
                chartType: 'gauge', thresholdMin: 1, thresholdMax: 2.5,
                formula: 'AC / PC', explanation: 'Capacidad de pago CP.', interpretation: 'Ideal 1.5 - 2.0.'
            },

            {
                id: 'pa', group: 'financiero', title: 'Prueba Ácida', value: pa, formattedValue: formatNumber(pa),
                ...resolveStatus(pa, 1.0, 1.5, { good: 'Excelente', mid: 'Bueno', bad: 'Bajo' }, false, 'Requiere Mapeo'),
                chartType: 'gauge', thresholdMin: 0.8, thresholdMax: 1.5,
                formula: '(AC - Inv) / PC', explanation: 'Liquidez ácida.', interpretation: 'Ideal > 1.0.'
            },

            {
                id: 'cash', group: 'financiero', title: 'Liquidez Caja', value: cash, formattedValue: formatNumber(cash),
                ...resolveStatus(cash, 0.1, 0.3, { good: 'Óptimo', mid: 'Bajo', bad: 'Crítico' }, false, 'Requiere Mapeo'),
                chartType: 'bar',
                formula: 'Disp / PC', explanation: 'Efectivo inmediato.', interpretation: '0.1 - 0.3 recomendado.'
            },

            {
                id: 'pprac', group: 'financiero', title: 'Plazo Cobro (Est)', value: pprac, formattedValue: 'N/D',
                sentiment: 'neutral', statusLabel: 'N/D',
                chartType: 'none', formula: 'Prom. Pond. AC', explanation: 'Conversión de activos.', interpretation: 'Menor es mejor.'
            },

            {
                id: 'ppepc', group: 'financiero', title: 'Plazo Pago (Est)', value: ppepc, formattedValue: 'N/D',
                sentiment: 'neutral', statusLabel: 'N/D',
                chartType: 'none', formula: 'Prom. Pond. PC', explanation: 'Exigibilidad deudas.', interpretation: '> Cobro es ideal.'
            },

            {
                id: 'lcn', group: 'financiero', title: 'Liquidez Nec.', value: lcn, formattedValue: 'N/D',
                sentiment: 'neutral', statusLabel: 'Ref. Técnica', chartType: 'none',
                formula: 'PPRAC / PPEPC', explanation: 'Liquidez técnica mínima.', interpretation: 'Base de cálculo.'
            },

            {
                id: 'cob', group: 'financiero', title: 'Cobertura LCN', value: cob, formattedValue: 'N/D',
                sentiment: 'neutral', statusLabel: 'N/D',
                chartType: 'gauge', thresholdMin: 0.9, thresholdMax: 1.5,
                formula: 'LC / LCN', explanation: 'Cobertura real vs técnica.', interpretation: '> 1.0 es sano.'
            },

            {
                id: 'ccc', group: 'financiero', title: 'Ciclo Caja', value: ccc, formattedValue: 'N/D',
                sentiment: 'neutral', statusLabel: 'N/D', chartType: 'none',
                formula: 'Ciclo Operativo', explanation: 'Días de dinero en calle.', interpretation: 'Requiere Ventas.'
            },
        );

        // --- B. PATRIMONIALES ---
        // For ratios where we divide by Total Assets/Liabilities/Equity, we need to be safe if they are 0.
        // safeDiv handles 0 denominator.
        const end = safeDiv(data.pasivoTotal, data.activoTotal);
        const solv = safeDiv(data.activoTotal, data.pasivoTotal);
        const aut = safeDiv(data.patrimonioNeto, data.activoTotal);
        const lev = safeDiv(data.pasivoTotal, data.patrimonioNeto);
        const quality = safeDiv(data.pasivoCorriente, data.pasivoTotal);
        const inmov = safeDiv(data.activoNoCorriente, data.activoTotal);

        list.push(
            {
                id: 'end', group: 'patrimonial', title: 'Endeudamiento', value: end, formattedValue: formatPercent(end),
                ...resolveStatus(end, 0.4, 0.6, { good: 'Equilibrado', mid: 'Alto', bad: 'Excesivo' }, true),
                chartType: 'gauge', thresholdMin: 0, thresholdMax: 1,
                formula: 'PT / AT', explanation: 'Dependencia de terceros.', interpretation: '< 60% recomendado.'
            },

            {
                id: 'solv', group: 'patrimonial', title: 'Solvencia Total', value: solv, formattedValue: formatNumber(solv),
                ...resolveStatus(solv, 1.5, 2.0, { good: 'Sólido', mid: 'Suficiente', bad: 'Débil' }),
                chartType: 'gauge', thresholdMin: 1, thresholdMax: 3,
                formula: 'AT / PT', explanation: 'Garantía total.', interpretation: '> 1.5 ideal.'
            },

            {
                id: 'aut', group: 'patrimonial', title: 'Autonomía', value: aut, formattedValue: formatPercent(aut),
                ...resolveStatus(aut, 0.4, 0.8, { good: 'Alto', mid: 'Medio', bad: 'Bajo' }),
                chartType: 'gauge', thresholdMin: 0, thresholdMax: 1,
                formula: 'PN / AT', explanation: 'Independencia financiera.', interpretation: 'Mayor es mejor.'
            },

            {
                id: 'lev', group: 'patrimonial', title: 'Apalancamiento', value: lev, formattedValue: formatNumber(lev),
                ...resolveStatus(lev, 0.5, 1.5, { good: 'Moderado', mid: 'Alto', bad: 'Arriesgado' }, true),
                chartType: 'none', formula: 'PT / PN', explanation: 'Deuda sobre capital.', interpretation: '< 1.0 conservador.'
            },

            {
                id: 'qual', group: 'patrimonial', title: '% Deuda CP', value: quality, formattedValue: formatPercent(quality),
                sentiment: 'info', statusLabel: 'Estructura', chartType: 'bar',
                formula: 'PC / PT', explanation: 'Perfil de vencimientos.', interpretation: 'Informativo.'
            },

            {
                id: 'inm', group: 'patrimonial', title: 'Inmovilidad', value: inmov, formattedValue: formatPercent(inmov),
                sentiment: 'neutral', statusLabel: 'Estructural', chartType: 'gauge', thresholdMin: 0, thresholdMax: 1,
                formula: 'ANC / AT', explanation: 'Rigidez activo.', interpretation: 'Varía por sector.'
            },
        );

        // --- C. ECONOMICOS ---
        const sales = data.ventas;
        const cogs = data.costoVentas; // absolute value usually
        const netIncome = data.resultadoNeto;

        // REASON: If sales/cogs/income are null, it means no ER data -> "Requiere ER"
        const erReason = 'Requiere ER';

        let marginGross: number | null = null;
        let marginNet: number | null = null;
        let roe: number | null = null;

        if (sales !== null && sales !== 0) {
            if (cogs !== null) {
                marginGross = (sales - Math.abs(cogs)) / sales;
            }
            if (netIncome !== null) {
                marginNet = netIncome / sales;
            }
        }

        if (netIncome !== null && data.patrimonioNeto !== 0) {
            roe = netIncome / data.patrimonioNeto;
        }

        list.push(
            {
                id: 'mgbr', group: 'economico', title: 'Margen Bruto', value: marginGross, formattedValue: marginGross !== null ? formatPercent(marginGross) : 'N/D',
                ...resolveStatus(marginGross, 0.2, 0.4, { good: 'Alto', mid: 'Medio', bad: 'Bajo' }, false, erReason),
                chartType: 'none',
                formula: '(Vtas-Cost)/Vtas', explanation: 'Rentabilidad producto.', interpretation: 'Alto es mejor.'
            },
            {
                id: 'mgnt', group: 'economico', title: 'Margen Neto', value: marginNet, formattedValue: marginNet !== null ? formatPercent(marginNet) : 'N/D',
                ...resolveStatus(marginNet, 0.05, 0.15, { good: 'Excelente', mid: 'Bueno', bad: 'Bajo' }, false, erReason),
                chartType: 'none',
                formula: 'R.Neto / Vtas', explanation: 'Ganancia final.', interpretation: 'Positivo es ganancia.'
            },
            {
                id: 'roe', group: 'economico', title: 'ROE', value: roe, formattedValue: roe !== null ? formatPercent(roe) : 'N/D',
                ...resolveStatus(roe, 0.15, 0.25, { good: 'Excelente', mid: 'Bueno', bad: 'Bajo' }, false, erReason),
                chartType: 'none',
                formula: 'R.Neto / PN', explanation: 'Retorno inversión.', interpretation: 'Clave accionistas.'
            }
        );

        return list;
    }, [data]);

    // SCORING ENGINE
    const scores = useMemo(() => {
        if (!indicators.length) return { fin: 0, pat: 0, eco: 0, avg: 0 };

        const computeScore = (group: GroupId) => {
            const groupIndicators = indicators.filter(i => i.group === group);
            if (!groupIndicators.length) return null;

            let totalPoints = 0;
            let count = 0;

            groupIndicators.forEach(ind => {
                if (ind.value === null) return; // Skip N/D
                count++;
                // Simple scoring model:
                // Success: 10, Info: 8, Warning: 5, Error: 2
                switch (ind.sentiment) {
                    case 'success': totalPoints += 10; break;
                    case 'info': totalPoints += 8; break; // Info is usually reliable/good context
                    case 'neutral': totalPoints += 5; break; // Neutral is ... neutral
                    case 'warning': totalPoints += 5; break;
                    case 'error': totalPoints += 2; break;
                }
            });

            if (count === 0) return null; // No available data for this group
            return (totalPoints / count);
        };

        const fin = computeScore('financiero');
        const pat = computeScore('patrimonial');
        const eco = computeScore('economico');

        // Global Average
        const validScores = [fin, pat, eco].filter(s => s !== null) as number[];
        const avg = validScores.length ? validScores.reduce((a, b) => a + b, 0) / validScores.length : 0;

        return { fin, pat, eco, avg };
    }, [indicators]);

    const activeIndicators = indicators.filter(i => i.group === activeTab);
    const counts = {
        financiero: indicators.filter(i => i.group === 'financiero').length,
        patrimonial: indicators.filter(i => i.group === 'patrimonial').length,
        economico: indicators.filter(i => i.group === 'economico').length,
    };

    if (!data) return null; // Or a loading skeleton could go here

    return (
        <div data-styling="css-modules" className={styles.root}>

            {/* 1. Header Clean */}
            <div className={styles.header}>
                <h1 className={styles.title}>
                    <span className={styles.gradientText}>
                        INDICADORES
                    </span>
                </h1>
                <p className={styles.subtitle}>
                    Análisis de salud financiera, económica y patrimonial de la empresa.
                </p>
            </div>

            {/* 2. Empty State (Visible only if totals are 0 and no data) */}
            {data && data.activoTotal === 0 && data.pasivoTotal === 0 && data.entriesCount !== 0 ? (
                // Logic subtlety: If we have entries but they are closing, or just no effect? 
                // The hook returns 0s for empty set.
                // Let's assume if ALL totals are 0, it's empty.
                // But wait, hook might return 0 if there are entries but they cancel out? unlikely.
                // Let's just use the totals = 0 check for now.
                <div className="w-full py-12 flex flex-col items-center justify-center text-center opacity-70">
                    <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                        <Info className="text-blue-400" size={32} />
                    </div>
                    <h3 className="text-lg font-medium text-slate-700 mb-1">Sin datos suficientes</h3>
                    <p className="text-slate-500 max-w-sm">
                        Cargá tu primer asiento contable para activar el tablero de indicadores.
                    </p>
                </div>
            ) : (
                <>
                    {/* 3. Tabs */}
                    <div className={styles.tabsContainer}>
                        <div className={styles.tabsList}>
                            {[
                                { id: 'financiero', label: 'Financieros', icon: Coins },
                                { id: 'patrimonial', label: 'Patrimoniales', icon: Landmark },
                                { id: 'economico', label: 'Económicos', icon: TrendingUp }
                            ].map(tab => {
                                const isActive = activeTab === tab.id;
                                const Icon = tab.icon;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id as GroupId)}
                                        className={`${styles.tabBtn} ${isActive ? styles.tabActive : styles.tabInactive}`}
                                    >
                                        <Icon size={18} />
                                        {tab.label}
                                        <span className={`${styles.tabBadge} ${isActive ? styles.badgeActive : styles.badgeInactive}`}>
                                            {counts[tab.id as GroupId]}
                                        </span>
                                        {isActive && <div className={styles.activeLine}></div>}
                                    </button>
                                )
                            })}
                        </div>
                    </div>

                    {/* 3. Grid Content */}
                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className={styles.grid}>
                            {activeIndicators.map(ind => (
                                <div key={ind.id} className={styles.cardWrapper}>
                                    <IndicatorCard data={ind} />
                                </div>
                            ))}
                        </div>

                        {/* 4. Integral Evaluation (Always Visible at bottom of tab) */}
                        <IntegralScoreCard scores={scores} />
                    </div>
                </>
            )}

        </div>
    );
}
