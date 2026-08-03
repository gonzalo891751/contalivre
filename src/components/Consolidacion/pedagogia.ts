/**
 * Ayudas contextuales del módulo de consolidación (Fase 2K §18).
 *
 * ContaLivre también enseña. Estas explicaciones acompañan al cálculo: el
 * usuario ve la cifra Y por qué existe. No sustituyen la traza del motor (cada
 * eliminación lleva su propio `computation` paso a paso); la complementan con
 * la idea de fondo, en lenguaje llano.
 */

export interface HelpTopic {
    id: string
    question: string
    answer: string
    normative?: string
}

export const HELP_TOPICS: Record<string, HelpTopic> = {
    queEsConsolidar: {
        id: 'queEsConsolidar',
        question: '¿Qué significa consolidar?',
        answer:
            'Consolidar es contar la historia del grupo como si la controladora y sus controladas fueran una sola ' +
            'empresa. No es sumar balances: hay que borrar todo lo que las entidades se hicieron entre sí, porque ' +
            'para esa única entidad económica nunca ocurrió. Lo que queda es únicamente lo que el grupo hizo con ' +
            'terceros.',
        normative: 'RT 54 — preparación de estados contables consolidados',
    },
    porQueDesapareceLaInversion: {
        id: 'porQueDesapareceLaInversion',
        question: '¿Por qué la inversión desaparece del consolidado?',
        answer:
            'Porque estaría contada dos veces. La cuenta "Inversión en la controlada" representa, de forma resumida, ' +
            'los mismos activos y pasivos de esa controlada. Al incorporarlos línea por línea al consolidado, la ' +
            'inversión ya no puede quedar: sería el mismo patrimonio anotado dos veces, una en detalle y otra en ' +
            'resumen. Por eso se elimina contra el patrimonio neto de la controlada.',
        normative: 'RT 54 — método de consolidación total',
    },
    queEsLaPnc: {
        id: 'queEsLaPnc',
        question: '¿Qué representa la participación no controladora?',
        answer:
            'El consolidado incorpora el 100 % de los activos y pasivos de la controlada, aunque la controladora no ' +
            'sea dueña del 100 %. La parte del patrimonio de esa controlada que pertenece a los otros accionistas es ' +
            'la participación no controladora. Es patrimonio de terceros DENTRO del grupo, no una deuda: el grupo no ' +
            'les debe plata, son co-propietarios de una de sus sociedades. Por eso se expone dentro del patrimonio ' +
            'neto y no en el pasivo.',
        normative: 'RT 54. La RT 21 la llamaba "participación minoritaria" y la ubicaba entre el pasivo y el patrimonio neto: esa exposición ya no es la vigente.',
    },
    ventaInterna: {
        id: 'ventaInterna',
        question: '¿Por qué una venta interna no es una venta para el grupo?',
        answer:
            'Porque nadie de afuera compró nada. Si una entidad del grupo le vende mercadería a otra, el grupo sigue ' +
            'teniendo la misma mercadería: sólo cambió de estante. Exponer esa operación como venta inflaría los ' +
            'ingresos y los costos del grupo sin que hubiera existido ninguna transacción con terceros. Por eso el ' +
            'ingreso del vendedor y el costo del comprador se eliminan íntegramente, incluso cuando el bien ya salió ' +
            'del grupo.',
    },
    resultadoNoTrascendido: {
        id: 'resultadoNoTrascendido',
        question: '¿Qué es un resultado no trascendido a terceros?',
        answer:
            'Es la ganancia que una entidad del grupo le cobró a otra y que todavía nadie de afuera pagó. Si Iberá le ' +
            'vende a Litoral por 180.000 algo que le costó 120.000, esos 60.000 son ganancia para Iberá, pero para el ' +
            'grupo no: el bien sigue adentro, ahora medido a un precio inflado. Mientras el bien no salga hacia un ' +
            'tercero, esa ganancia no se reconoce: se elimina, y el activo vuelve a su costo para el grupo. Cuando ' +
            'finalmente se venda afuera, la ganancia aparecerá en ese momento.',
    },
    ascendenteDescendente: {
        id: 'ascendenteDescendente',
        question: '¿Por qué cambia la atribución en una operación ascendente o descendente?',
        answer:
            'Porque el ajuste se le imputa a QUIEN GENERÓ el resultado, es decir al vendedor.\n\n' +
            'ASCENDENTE (la controlada vende a la controladora): el resultado inflado está en el estado de la ' +
            'controlada, así que corregirlo baja SU patrimonio y SU resultado. Como ese patrimonio se reparte entre ' +
            'la controladora y los accionistas no controladores, el ajuste se reparte también.\n\n' +
            'DESCENDENTE (la controladora vende a la controlada): el resultado inflado lo generó la controladora. La ' +
            'controlada no ganó nada de más, así que su patrimonio no se toca y la participación no controladora NO ' +
            'se reduce: el ajuste completo recae sobre los propietarios de la controladora.\n\n' +
            'Es la misma regla en los dos casos; lo único que cambia es quién vendió.',
    },
    porQueNoVanAlDiario: {
        id: 'porQueNoVanAlDiario',
        question: '¿Por qué estos ajustes no van al Libro Diario?',
        answer:
            'Porque el grupo económico no es un sujeto contable: no tiene libros, no tiene CUIT, no emite facturas. ' +
            'Las que sí existen jurídicamente son cada una de las sociedades, y sus libros reflejan lo que realmente ' +
            'les pasó, incluida la venta que le hicieron a otra empresa del grupo. Esa venta ocurrió de verdad para ' +
            'ellas. Las eliminaciones sólo tienen sentido en el papel de trabajo del grupo, y por eso son ' +
            'extracontables: se recalculan, se corrigen o se anulan sin tocar un solo asiento de las entidades.',
    },
    reciprocos: {
        id: 'reciprocos',
        question: '¿Por qué se eliminan los saldos recíprocos?',
        answer:
            'Una entidad no puede deberse dinero a sí misma. Si Litoral le prestó 200.000 a Iberá, en el consolidado ' +
            'ese crédito y esa deuda son la misma partida vista desde dos lados: exponerlos inflaría el activo y el ' +
            'pasivo del grupo sin que hubiera ni un peso más ni una obligación real con nadie de afuera. Se elimina ' +
            'por el importe CONCILIADO: si los dos lados no coinciden, la diferencia se muestra y se explica, nunca ' +
            'se compensa para que cierre.',
    },
    flujosInternos: {
        id: 'flujosInternos',
        question: '¿Por qué se eliminan los flujos de efectivo internos?',
        answer:
            'Porque el grupo no puede generar efectivo consigo mismo. Cuando una entidad le paga a otra, la caja de ' +
            'una baja exactamente lo que sube la de la otra: el efectivo total del grupo no cambió. Si no se ' +
            'eliminaran ambos lados, el Estado de Flujo de Efectivo mostraría movimientos operativos, de inversión o ' +
            'de financiación que nunca cruzaron la frontera del grupo. Los dividendos pagados a los accionistas no ' +
            'controladores, en cambio, SÍ salen del grupo y se mantienen.',
    },
    asociadaNoSeConsolida: {
        id: 'asociadaNoSeConsolida',
        question: '¿Una asociada se consolida por VPP?',
        answer:
            'No. Esa frase mezcla dos cosas distintas. Una asociada NO se consolida: no se incorporan sus activos ni ' +
            'sus pasivos línea por línea. Lo que se hace es MEDIR la inversión en ella por su valor patrimonial ' +
            'proporcional, y esa medición queda en una sola línea del activo. Consolidar es un método de exposición ' +
            'del grupo; el VPP es un criterio de medición de una inversión. Lo mismo vale para un negocio conjunto ' +
            'societario: tampoco se incorpora como si fuera una subsidiaria.',
        normative: 'RT 54',
    },
    controlNoEsPorcentaje: {
        id: 'controlNoEsPorcentaje',
        question: '¿Alcanza con tener más del 50 % para consolidar?',
        answer:
            'El porcentaje es un indicio fuerte, pero la norma exige CONTROL, que es la capacidad de dirigir las ' +
            'políticas operativas y financieras de la otra entidad. Puede haber control con menos del 50 % (por un ' +
            'acuerdo de accionistas, por el derecho a designar la mayoría del directorio) y puede no haberlo con más ' +
            '(acciones sin voto, restricciones legales). Por eso ContaLivre pide una conclusión explícita y su ' +
            'fundamento: no la deduce sola del porcentaje.',
        normative: 'RT 54',
    },
    diferenciaConsolidacion: {
        id: 'diferenciaConsolidacion',
        question: '¿Qué es la diferencia de consolidación que aparece bloqueando?',
        answer:
            'Es la parte de la inversión que NO se explica por el patrimonio de la controlada. Si la controladora ' +
            'tiene la inversión anotada en 400.000 pero su parte del patrimonio de la controlada vale 432.900, hay ' +
            '32.900 sin explicar: puede ser una llave de negocio pagada al comprar, una medición desactualizada o un ' +
            'error. ContaLivre no la absorbe en silencio ni inventa un "ajuste de cierre" para que cierre: la muestra ' +
            'y bloquea la emisión hasta que alguien diga qué es.',
    },
}

/** Explicación breve de cada tipo de eliminación, para la grilla */
export const ELIMINATION_HELP: Record<string, string> = {
    INVESTMENT_VS_EQUITY: 'Inversión contra patrimonio neto de la controlada, con reconocimiento de la participación no controladora',
    NON_CONTROLLING_INTEREST: 'Reconocimiento del patrimonio y el resultado que pertenecen a accionistas ajenos al grupo',
    RECIPROCAL_BALANCE: 'Crédito y deuda entre entidades del grupo: la misma partida vista desde dos lados',
    INTRAGROUP_OPERATION: 'Ingreso y costo de una operación que el grupo se hizo a sí mismo',
    INTRAGROUP_DIVIDEND: 'Dividendos entre entidades del grupo: movimiento de fondos, no ganancia',
    UNREALIZED_RESULT: 'Ganancia contenida en un activo que todavía está dentro del grupo',
    UNREALIZED_RESULT_REVERSAL: 'Reconocimiento de la ganancia cuando el activo sale hacia terceros',
    EQUITY_METHOD_RESULT: 'Resultado que la inversión generó en la controladora, reemplazado por los ingresos y gastos reales de la controlada',
    DEFERRED_TAX: 'Impuesto ya tributado sobre un resultado que el grupo todavía no reconoce',
    INTRAGROUP_CASH_FLOW: 'Cobros y pagos entre entidades del grupo, que no cambian el efectivo total',
    HOMOGENIZATION: 'Ajuste para que todas las entidades apliquen los mismos criterios contables',
    MANUAL: 'Ajuste manual de consolidación, con su fundamento y su aprobación',
}

export const COLUMN_HELP: Record<string, string> = {
    subtotal: 'Suma línea por línea de los estados individuales, antes de eliminar nada',
    homogenization: 'Ajustes para uniformar criterios contables entre las entidades',
    investmentElimination: 'Baja de la inversión contra el patrimonio neto de cada controlada',
    nonControllingInterest: 'Patrimonio y resultado atribuibles a accionistas ajenos al grupo',
    reciprocalElimination: 'Créditos y deudas entre entidades del grupo',
    operationElimination: 'Ingresos y gastos de operaciones que el grupo se hizo a sí mismo',
    unrealizedElimination: 'Ganancias contenidas en activos que siguen dentro del grupo',
    deferredTax: 'Efecto impositivo de los ajustes anteriores',
    manualAdjustment: 'Ajustes manuales aprobados, con su fundamento',
    consolidated: 'Importe final del grupo: suma previa más todos los ajustes',
}
