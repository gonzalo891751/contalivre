/**
 * Guía didáctica del Análisis de Estados Contables.
 *
 * El motor (reporting/metrics) calcula; esta guía EXPLICA: qué mide cada
 * índice, cómo se lee, la trampa típica de examen y la fórmula en notación de
 * apunte (LaTeX). Se mantiene separada para que el texto pedagógico pueda
 * crecer sin tocar el cálculo.
 */

export type SectionId = 'corto-plazo' | 'plazos' | 'estructura' | 'economica' | 'flujo'

export interface SectionInfo {
    id: SectionId
    title: string
    question: string
    intro: string
    metrics: string[]
}

export const SECTIONS: SectionInfo[] = [
    {
        id: 'corto-plazo',
        title: 'Situación financiera de corto plazo',
        question: '¿Puede pagar sus deudas de los próximos 12 meses?',
        intro: 'Compara lo que se va a convertir en dinero dentro del año (activo corriente) con lo que hay que pagar en ese plazo (pasivo corriente). Cada índice va quitando partidas menos líquidas para ser más exigente.',
        metrics: ['capital-trabajo', 'liquidez-corriente', 'prueba-acida', 'liquidez-inmediata'],
    },
    {
        id: 'plazos',
        title: 'Plazos y ciclo operativo',
        question: '¿Cuánto tarda el dinero en dar la vuelta?',
        intro: 'La liquidez es una foto al cierre; los plazos muestran la película. Cuántos días está la mercadería en stock, cuánto se tarda en cobrar y cuánto financian los proveedores. Con eso se arma el ciclo operativo.',
        metrics: ['rotacion-inventarios', 'dias-inventario', 'rotacion-creditos', 'dias-cobranza', 'dias-pago', 'ciclo-operativo', 'ciclo-conversion'],
    },
    {
        id: 'estructura',
        title: 'Situación patrimonial (largo plazo)',
        question: '¿Quién financia la empresa y qué tan comprometida está?',
        intro: 'Analiza la estructura: cuánto aportan los dueños (PN) y cuánto los terceros (pasivo), cuánto del activo está inmovilizado y si está financiado con fondos de largo plazo.',
        metrics: ['solvencia', 'endeudamiento', 'composicion-deuda', 'inmovilizacion', 'financiacion-inmovilizacion', 'cobertura-intereses'],
    },
    {
        id: 'economica',
        title: 'Situación económica (rentabilidad)',
        question: '¿Cuánto rinde lo invertido?',
        intro: 'Relaciona resultados con ventas (márgenes) y con lo invertido (rentabilidades). La comparación entre la rentabilidad del activo y la del patrimonio neto muestra si endeudarse convino: es el efecto palanca.',
        metrics: ['margen-bruto', 'margen-operativo', 'margen-neto', 'margen-ebitda', 'rotacion-activo', 'roa', 'roe', 'costo-deuda', 'efecto-palanca', 'dupont', 'autosuficiencia'],
    },
    {
        id: 'flujo',
        title: 'Flujo de efectivo',
        question: '¿El resultado se convirtió en plata?',
        intro: 'Usa el Estado de Flujo de Efectivo. Una empresa puede ganar y quedarse sin efectivo si vende a crédito o invierte mucho; estos índices lo muestran.',
        metrics: ['cfo-pc', 'cfo-resultado', 'flujo-libre', 'deuda-cfo'],
    },
]

export interface MetricGuide {
    /** fórmula en LaTeX (notación de apunte) */
    tex: string
    /** cómo se arma el reemplazo numérico */
    shape: 'ratio' | 'diff' | 'sum'
    concept: string
    howToRead: string
    examTip?: string
    /** dirección favorable desde el punto de vista financiero (null = depende) */
    favorable: 'up' | 'down' | null
}

const t = (s: string) => `\\text{${s}}`
const frac = (a: string, b: string) => `\\dfrac{${t(a)}}{${t(b)}}`

export const METRIC_GUIDE: Record<string, MetricGuide> = {
    'capital-trabajo': {
        tex: `${t('Activo corriente')} - ${t('Pasivo corriente')}`, shape: 'diff',
        concept: 'Es el excedente de recursos corrientes que queda después de cubrir las deudas corrientes. Se expresa en pesos.',
        howToRead: 'Positivo: el activo corriente alcanza para pagar el pasivo corriente y sobra. Negativo: parte de las deudas de corto plazo financia activos no corrientes.',
        examTip: 'Al estar en pesos no sirve para comparar empresas de distinto tamaño: para eso se usa la liquidez corriente.',
        favorable: 'up',
    },
    'liquidez-corriente': {
        tex: frac('Activo corriente', 'Pasivo corriente'), shape: 'ratio',
        concept: 'Cuántos pesos de activo corriente hay por cada peso de pasivo corriente.',
        howToRead: 'Mayor que 1: el AC cubre el PC. Menor que 1: no alcanza. La bibliografía clásica menciona "2 a 1" como referencia, pero depende del sector y de los plazos de cobro y pago.',
        examTip: 'Un índice alto no siempre es bueno: puede esconder mercadería sin rotación, créditos incobrables o efectivo ocioso. Mirá también la ácida y los plazos.',
        favorable: 'up',
    },
    'prueba-acida': {
        tex: `\\dfrac{${t('Activo corriente')} - ${t('Bienes de cambio')}}{${t('Pasivo corriente')}}`, shape: 'ratio',
        concept: 'Igual que la liquidez corriente pero sin los bienes de cambio, que primero hay que vender (y después cobrar) para convertir en dinero.',
        howToRead: 'Cerca de 1 o más: se pueden cubrir las deudas corrientes sin depender de vender el stock.',
        examTip: 'Algunas cátedras también restan los gastos pagados por adelantado (no se convierten en dinero).',
        favorable: 'up',
    },
    'liquidez-inmediata': {
        tex: `\\dfrac{${t('Caja y bancos')} + ${t('Inversiones corrientes')}}{${t('Pasivo corriente')}}`, shape: 'ratio',
        concept: 'La prueba más exigente: solo el efectivo y las inversiones de rápida realización contra el pasivo corriente.',
        howToRead: 'Muestra qué parte de las deudas corrientes se podría pagar hoy mismo. Es normal que sea menor que 1: las deudas no vencen todas el día del cierre.',
        favorable: 'up',
    },
    'rotacion-inventarios': {
        tex: frac('Costo de ventas', 'Bienes de cambio promedio'), shape: 'ratio',
        concept: 'Cuántas veces se vendió y repuso el stock en el ejercicio.',
        howToRead: 'Más rotación = la mercadería está menos tiempo inmovilizada.',
        examTip: 'Va con el costo de ventas, no con las ventas: el stock está valuado al costo.',
        favorable: 'up',
    },
    'dias-inventario': {
        tex: `${frac('Bienes de cambio promedio', 'Costo de ventas')} \\times 365`, shape: 'ratio',
        concept: 'Antigüedad promedio de los bienes de cambio: días que pasa la mercadería en stock antes de venderse.',
        howToRead: 'Menos días = el stock se convierte antes en ventas. Es el primer tramo del ciclo operativo.',
        examTip: 'Es lo mismo que 365 / rotación. Si la cátedra usa año comercial, reemplazá 365 por 360 (lo podés cambiar arriba).',
        favorable: 'down',
    },
    'rotacion-creditos': {
        tex: frac('Ventas a crédito con IVA', 'Créditos por ventas promedio'), shape: 'ratio',
        concept: 'Cuántas veces se cobraron y renovaron los créditos por ventas en el ejercicio.',
        howToRead: 'Más rotación = se cobra más rápido.',
        favorable: 'up',
    },
    'dias-cobranza': {
        tex: `${frac('Créditos por ventas promedio', 'Ventas a crédito con IVA')} \\times 365`, shape: 'ratio',
        concept: 'Días promedio entre la venta y su cobro.',
        howToRead: 'Menos días = se cobra antes. Compararlo con el plazo que la empresa otorga en sus condiciones de venta.',
        examTip: 'Las ventas se multiplican por 1,21 porque el saldo de deudores incluye el IVA facturado: así el numerador y el denominador son homogéneos. Si no todas las ventas son a crédito, usá solo la parte a crédito (lo podés indicar arriba).',
        favorable: 'down',
    },
    'dias-pago': {
        tex: `${frac('Deudas comerciales promedio', 'Compras a crédito con IVA')} \\times 365`, shape: 'ratio',
        concept: 'Días promedio que los proveedores le dan a la empresa para pagar.',
        howToRead: 'Más días = los proveedores financian más tiempo. Si se alarga demasiado puede indicar atrasos en los pagos.',
        examTip: 'Las compras no figuran en el estado de resultados: se despejan de la fórmula del costo (CMV = EI + Compras − EF ⇒ Compras = CMV + EF − EI).',
        favorable: 'up',
    },
    'ciclo-operativo': {
        tex: `${t('Plazo de bienes de cambio')} + ${t('Plazo de cobranza')}`, shape: 'sum',
        concept: 'Días que pasan desde que entra la mercadería hasta que se cobra su venta.',
        howToRead: 'Cuanto más largo, más capital de trabajo necesita la empresa para operar.',
        favorable: 'down',
    },
    'ciclo-conversion': {
        tex: `${t('Ciclo operativo')} - ${t('Plazo de pago')}`, shape: 'diff',
        concept: 'Ciclo operativo neto (o de efectivo): los días del ciclo que NO financian los proveedores.',
        howToRead: 'Positivo: hay que financiar esos días con fondos propios o préstamos. Negativo: se cobra antes de pagar (típico de supermercados).',
        favorable: 'down',
    },
    'solvencia': {
        tex: frac('Patrimonio neto', 'Pasivo'), shape: 'ratio',
        concept: 'Relación entre lo que financian los propietarios y lo que financian los terceros.',
        howToRead: 'Mayor que 1: los dueños financian más que los acreedores. Es la inversa del endeudamiento.',
        examTip: 'Ojo con la definición de tu cátedra: muchas llaman "solvencia" a Activo / Pasivo (abajo, en variantes, tenés los dos valores).',
        favorable: 'up',
    },
    'endeudamiento': {
        tex: frac('Pasivo', 'Patrimonio neto'), shape: 'ratio',
        concept: 'Cuántos pesos de deuda con terceros hay por cada peso de capital propio.',
        howToRead: 'Mayor que 1: los acreedores financian más que los dueños. Más endeudamiento aumenta el riesgo financiero, pero puede mejorar la rentabilidad del PN (efecto palanca).',
        examTip: 'Se puede abrir en corto y largo plazo (PC/PN y PNC/PN): no es lo mismo deber a 30 días que a 5 años.',
        favorable: null,
    },
    'composicion-deuda': {
        tex: frac('Pasivo corriente', 'Pasivo total'), shape: 'ratio',
        concept: 'Qué porcentaje de las deudas vence en los próximos 12 meses.',
        howToRead: 'Un porcentaje alto exige más liquidez para atender los vencimientos.',
        favorable: 'down',
    },
    'inmovilizacion': {
        tex: frac('Activo no corriente', 'Activo total'), shape: 'ratio',
        concept: 'Qué parte del activo es de lenta conversión en dinero (bienes de uso, inversiones permanentes, intangibles).',
        howToRead: 'Depende de la actividad: una industria tiene mucha inmovilización; un comercio, poca.',
        favorable: null,
    },
    'financiacion-inmovilizacion': {
        tex: frac('Patrimonio neto', 'Activo no corriente'), shape: 'ratio',
        concept: 'Si el capital propio alcanza para financiar el activo inmovilizado.',
        howToRead: 'Mayor que 1: el activo no corriente está totalmente financiado con fondos propios. Regla de oro: el inmovilizado no debería financiarse con deudas de corto plazo.',
        examTip: 'La variante (PN + Pasivo no corriente) / ANC mide la financiación con todos los fondos de largo plazo.',
        favorable: 'up',
    },
    'cobertura-intereses': {
        tex: `\\dfrac{${t('Resultado antes de intereses e impuestos')}}{${t('Intereses')}}`, shape: 'ratio',
        concept: 'Cuántas veces el resultado de la operación cubre los intereses de las deudas.',
        howToRead: 'Menor que 1: el resultado no alcanza ni para pagar los intereses.',
        favorable: 'up',
    },
    'margen-bruto': {
        tex: frac('Resultado bruto', 'Ventas netas'), shape: 'ratio',
        concept: 'Qué porcentaje de cada venta queda después del costo de lo vendido.',
        howToRead: 'Muestra el "recargo" efectivo sobre el costo. Tiene que cubrir los gastos de administración, comercialización y financieros.',
        favorable: 'up',
    },
    'margen-operativo': {
        tex: frac('Resultado operativo', 'Ventas netas'), shape: 'ratio',
        concept: 'Qué porcentaje de cada venta queda después de los gastos de la operación.',
        howToRead: 'Mide la eficiencia del negocio antes de cómo se financia y de los impuestos.',
        favorable: 'up',
    },
    'margen-neto': {
        tex: frac('Resultado del ejercicio', 'Ventas netas'), shape: 'ratio',
        concept: 'Qué porcentaje de cada venta llega al resultado final.',
        howToRead: 'Es el primer factor de la rentabilidad: margen × rotación.',
        favorable: 'up',
    },
    'margen-ebitda': {
        tex: `\\dfrac{${t('Resultado operativo')} + ${t('Depreciaciones')}}{${t('Ventas netas')}}`, shape: 'ratio',
        concept: 'Resultado operativo antes de depreciaciones y amortizaciones (EBITDA), sobre ventas. Aproxima la generación de fondos de la operación.',
        howToRead: 'Indicador de gestión muy usado por analistas; no surge de las normas contables profesionales.',
        favorable: 'up',
    },
    'rotacion-activo': {
        tex: frac('Ventas netas', 'Activo promedio'), shape: 'ratio',
        concept: 'Cuántos pesos de ventas genera cada peso invertido en el activo.',
        howToRead: 'Es el segundo factor de la rentabilidad: RA = margen × rotación. Un supermercado rota mucho con poco margen; una joyería, al revés.',
        favorable: 'up',
    },
    'roa': {
        tex: `\\dfrac{${t('Resultado')} + ${t('Intereses del pasivo')}}{${t('Activo promedio')}}`, shape: 'ratio',
        concept: 'Rentabilidad del activo (o de la inversión total): cuánto rinde cada peso invertido, sin importar si lo pusieron los dueños o los acreedores.',
        howToRead: 'Se suman los intereses porque son la retribución de los acreedores: así se mide el rendimiento del negocio con independencia de cómo se financió.',
        examTip: 'Se descompone en margen × rotación: (R + I) / Ventas × Ventas / Activo. En variantes tenés la versión internacional (ROA sobre resultado neto).',
        favorable: 'up',
    },
    'roe': {
        tex: frac('Resultado del ejercicio', 'Patrimonio neto promedio'), shape: 'ratio',
        concept: 'Rentabilidad del patrimonio neto: cuánto rindió cada peso aportado por los propietarios.',
        howToRead: 'Es la que le interesa al dueño. Conviene compararla con lo que rendiría una inversión alternativa de riesgo parecido.',
        examTip: 'El PN promedio se toma (PN inicial + PN final) / 2. Si hubo aportes o retiros importantes en el año, algunas cátedras ponderan por el tiempo.',
        favorable: 'up',
    },
    'costo-deuda': {
        tex: frac('Intereses del pasivo', 'Pasivo promedio'), shape: 'ratio',
        concept: 'Costo medio del financiamiento de terceros.',
        howToRead: 'Si es menor que la rentabilidad del activo, endeudarse conviene (palanca favorable).',
        examTip: 'Incluye deudas sin interés (proveedores, cargas sociales): por eso suele dar menos que la tasa del préstamo.',
        favorable: 'down',
    },
    'efecto-palanca': {
        tex: frac('Rentabilidad del PN', 'Rentabilidad del activo'), shape: 'ratio',
        concept: 'Muestra si el endeudamiento potenció o perjudicó la rentabilidad de los propietarios.',
        howToRead: 'Mayor que 1: favorable (el activo rinde más de lo que cuesta la deuda). Igual a 1: neutro. Menor que 1: desfavorable.',
        examTip: 'Con impuesto a las ganancias, el costo de la deuda a comparar es el neto del ahorro impositivo: i × (1 − t).',
        favorable: 'up',
    },
    'dupont': {
        tex: `\\dfrac{${t('R')}}{${t('V')}} \\times \\dfrac{${t('V')}}{${t('A')}} \\times \\dfrac{${t('A')}}{${t('PN')}}`, shape: 'ratio',
        concept: 'Descomposición de la rentabilidad del PN en margen neto, rotación del activo y apalancamiento (Activo / PN).',
        howToRead: 'Permite ver qué "palanca" explica el cambio de rentabilidad: vender con más margen, vender más con lo mismo, o endeudarse más.',
        favorable: 'up',
    },
    'autosuficiencia': {
        tex: frac('Recursos ordinarios', 'Gastos ordinarios'), shape: 'ratio',
        concept: 'En un ente sin fines de lucro: si los recursos del ejercicio alcanzan para cubrir sus gastos.',
        howToRead: 'Mayor que 1: hubo superávit operativo. Menor que 1: la entidad consume patrimonio para funcionar.',
        favorable: 'up',
    },
    'cfo-pc': {
        tex: frac('Flujo de efectivo operativo', 'Pasivo corriente'), shape: 'ratio',
        concept: 'Capacidad del efectivo generado por la operación del año para atender las deudas corrientes.',
        howToRead: 'Complementa la liquidez corriente con un dato dinámico (de flujo).',
        favorable: 'up',
    },
    'cfo-resultado': {
        tex: frac('Flujo de efectivo operativo', 'Resultado del ejercicio'), shape: 'ratio',
        concept: 'Calidad del resultado: qué parte de la ganancia se transformó en efectivo.',
        howToRead: 'Cerca de 1 o más: el resultado "se cobra". Muy por debajo de 1: la ganancia quedó en créditos o en stock.',
        favorable: 'up',
    },
    'flujo-libre': {
        tex: `${t('Flujo operativo')} + ${t('Flujo de inversión')}`, shape: 'sum',
        concept: 'Efectivo que queda después de las inversiones del año (el flujo de inversión es negativo cuando se compra activo fijo).',
        howToRead: 'Positivo: la operación financia las inversiones y sobra para pagar deudas o distribuir. Negativo: hubo que recurrir a financiación o a efectivo previo.',
        favorable: 'up',
    },
    'deuda-cfo': {
        tex: frac('Pasivo total', 'Flujo de efectivo operativo'), shape: 'ratio',
        concept: 'Años que tardaría la operación en cancelar toda la deuda si generara siempre el mismo flujo.',
        howToRead: 'Menos años = deuda más manejable.',
        favorable: 'down',
    },
}

export const OPENING_SOURCE_LABEL: Record<string, string> = {
    NONE: 'sin saldos de inicio (primer ejercicio del ente): los promedios usan el saldo final',
    PRIOR_BALANCES: 'saldos acumulados de asientos anteriores',
    OPENING_ENTRY: 'asiento de apertura generado por el cierre del ejercicio anterior',
    MANUAL_OPENING: 'asiento de apertura cargado el primer día del ejercicio',
}
