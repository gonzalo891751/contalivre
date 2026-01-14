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
                        {isND ? '—' : data.formattedValue}
                    </span>

                    {/* Status Label Pill */}
                    <span className={`${styles.pill} ${textStatusColor}`}>
                        {isND ? 'Requiere ER' : data.statusLabel}
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
        if (!data) return []; // Skeleton handling handled by parent or empty state? For now empty list.

        const list: IndicatorResult[] = [];

        // --- A. FINANCIEROS ---
        const ct = data.activoCorriente - data.pasivoCorriente;
        const lc = safeDiv(data.activoCorriente, data.pasivoCorriente);
        const pa = safeDiv(data.activoCorriente - data.inventarios, data.pasivoCorriente);
        const cash = safeDiv(data.disponibilidades, data.pasivoCorriente);

        // Mocks para supuestos (Activity Ratios require temporal data not yet in hook)
        // Keep hardcoded or safe defaults for now as requested by user "Primary: use existing account metadata... Fallback: if not available return nulls"
        // But the previous mock had hardcoded logic. I'll keep the hardcoded logic for Activity Ratios as placeholders
        // OR better, mark them as N/D if we can't compute them real.
        // User said: "Connect IndicatorsDashboard to real ContaLivre accounting data... remove all mock/demo numbers".
        // If I can't compute them, I should probably return null?
        // But pprac/ppepc require "Purchases" and "Average Balances". We only have "Entries".
        // Calculating averages is heavy. I'll mock them with a fixed "N/D" or keep the "Estimated" suffix if I can't do it.
        // Actually, for "Plazo Cobro", I need Sales.
        // I'll set them to null (N/D) for now to be honest to the data principle.
        const pprac = null;
        const ppepc = null;
        const lcn = null;
        const cob = null;
        const ccc = null;

        list.push(
            {
                id: 'ct', group: 'financiero', title: 'Capital de Trabajo', value: ct, formattedValue: formatCurrency(ct),
                ...getStatus(ct, 0, Infinity, { good: 'Positivo', mid: 'Ajustado', bad: 'Déficit' }),
                formula: 'AC - PC', explanation: 'Fondo de maniobra operativo.', interpretation: 'Debe ser > 0.', chartType: 'none'
            },

            {
                id: 'lc', group: 'financiero', title: 'Liquidez Corriente', value: lc, formattedValue: formatNumber(lc),
                ...getStatus(lc, 1.5, 2.0, { good: 'Sólido', mid: 'Aceptable', bad: 'Riesgo' }),
                chartType: 'gauge', thresholdMin: 1, thresholdMax: 2.5,
                formula: 'AC / PC', explanation: 'Capacidad de pago CP.', interpretation: 'Ideal 1.5 - 2.0.'
            },

            {
                id: 'pa', group: 'financiero', title: 'Prueba Ácida', value: pa, formattedValue: formatNumber(pa),
                ...getStatus(pa, 1.0, 1.5, { good: 'Excelente', mid: 'Bueno', bad: 'Bajo' }),
                chartType: 'gauge', thresholdMin: 0.8, thresholdMax: 1.5,
                formula: '(AC - Inv) / PC', explanation: 'Liquidez ácida.', interpretation: 'Ideal > 1.0.'
            },

            {
                id: 'cash', group: 'financiero', title: 'Liquidez Caja', value: cash, formattedValue: formatNumber(cash),
                ...getStatus(cash, 0.1, 0.3, { good: 'Óptimo', mid: 'Bajo', bad: 'Crítico' }),
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
        const end = safeDiv(data.pasivoTotal, data.activoTotal);
        const solv = safeDiv(data.activoTotal, data.pasivoTotal);
        const aut = safeDiv(data.patrimonioNeto, data.activoTotal);
        const lev = safeDiv(data.pasivoTotal, data.patrimonioNeto);
        const quality = safeDiv(data.pasivoCorriente, data.pasivoTotal);
        const inmov = safeDiv(data.activoNoCorriente, data.activoTotal);

        list.push(
            {
                id: 'end', group: 'patrimonial', title: 'Endeudamiento', value: end, formattedValue: formatPercent(end),
                ...getStatus(end, 0.4, 0.6, { good: 'Equilibrado', mid: 'Alto', bad: 'Excesivo' }, true),
                chartType: 'gauge', thresholdMin: 0, thresholdMax: 1,
                formula: 'PT / AT', explanation: 'Dependencia de terceros.', interpretation: '< 60% recomendado.'
            },

            {
                id: 'solv', group: 'patrimonial', title: 'Solvencia Total', value: solv, formattedValue: formatNumber(solv),
                ...getStatus(solv, 1.5, 2.0, { good: 'Sólido', mid: 'Suficiente', bad: 'Débil' }),
                chartType: 'gauge', thresholdMin: 1, thresholdMax: 3,
                formula: 'AT / PT', explanation: 'Garantía total.', interpretation: '> 1.5 ideal.'
            },

            {
                id: 'aut', group: 'patrimonial', title: 'Autonomía', value: aut, formattedValue: formatPercent(aut),
                ...getStatus(aut, 0.4, 0.8, { good: 'Alto', mid: 'Medio', bad: 'Bajo' }),
                chartType: 'gauge', thresholdMin: 0, thresholdMax: 1,
                formula: 'PN / AT', explanation: 'Independencia financiera.', interpretation: 'Mayor es mejor.'
            },

            {
                id: 'lev', group: 'patrimonial', title: 'Apalancamiento', value: lev, formattedValue: formatNumber(lev),
                ...getStatus(lev, 0.5, 1.5, { good: 'Moderado', mid: 'Alto', bad: 'Arriesgado' }, true),
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

        let marginGross: number | null = null;
        let marginNet: number | null = null;
        let roe: number | null = null;

        if (sales !== null && sales !== 0) {
            // Gross Profit = Sales - COGS. If COGS comes as expense (positive number in accounting logic for expense), subtract.
            // But statements logic relies on signed values?
            // "data.costoVentas" comes from "computeStatements".
            // Expenses in DB are usually same sign logic.
            // Let's assume Gross Profit is computed if possible?
            // We only have Sales and Cogs.
            // If we prefer, we can rely on netIncome for Net Margin.
            // For Gross Margin:
            if (cogs !== null) {
                // Warning: simplistic assumption.
                // Gross Margin = (Sales - |COGS|) / Sales
                // Assuming Sales > 0.
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
                ...getStatus(marginGross, 0.2, 0.4, { good: 'Alto', mid: 'Medio', bad: 'Bajo' }),
                chartType: 'none',
                formula: '(Vtas-Cost)/Vtas', explanation: 'Rentabilidad producto.', interpretation: 'Alto es mejor.'
            },
            {
                id: 'mgnt', group: 'economico', title: 'Margen Neto', value: marginNet, formattedValue: marginNet !== null ? formatPercent(marginNet) : 'N/D',
                ...getStatus(marginNet, 0.05, 0.15, { good: 'Excelente', mid: 'Bueno', bad: 'Bajo' }),
                chartType: 'none',
                formula: 'R.Neto / Vtas', explanation: 'Ganancia final.', interpretation: 'Positivo es ganancia.'
            },
            {
                id: 'roe', group: 'economico', title: 'ROE', value: roe, formattedValue: roe !== null ? formatPercent(roe) : 'N/D',
                ...getStatus(roe, 0.15, 0.25, { good: 'Excelente', mid: 'Bueno', bad: 'Bajo' }),
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

            {/* 2. Tabs */}
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

        </div>
    );
}
