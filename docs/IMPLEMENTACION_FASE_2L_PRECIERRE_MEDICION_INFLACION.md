# Fase 2L — Pre-cierre guiado, medición e inflación

Informe de implementación · 3 de agosto de 2026

---

## 1. Identificación y alcance entregado

| Dato | Valor |
|---|---|
| Rama | `feat/fase-2l-pre-cierre-guiado-medicion-inflacion` |
| Base exacta | `origin/main` @ `6aafdab30f876f7338a4d4531e84f3c822e723df` |
| `main` local al iniciar | `fbb178e41502f07e5f94e05703be433cd388b27c` (intacto; estaba detrás de `origin/main`) |
| HEAD final | Se informa junto con la entrega, una vez cerrado el último commit documental |
| Node / npm | v22.23.1 / 10.9.8 (`C:\Tools\node-v22.23.1-win-x64`) |
| Esquema Dexie | v24 → **v25**, migración `v25-fase2l-pre-cierre-guiado` |
| Estado inicial | Árbol limpio; 108 archivos de pruebas y 818 tests aprobados |

La fase reemplaza el recorrido pasivo de once apartados de la Fase 2J por un
centro de preparación de cierre de ocho etapas. El resultado no es sólo una
presentación nueva: agrega una decisión persistente de unidad de medida, política
de medición trazable, evaluación de recuperabilidad, secuencia explícita entre
reexpresión y valor de cierre, papel de trabajo de inflación, conciliación dual
del RECPAM, ciclo auditable de ajustes y una compuerta única para publicar y
cerrar.

No se hizo merge, rebase, squash, deploy ni force-push. `main` no fue modificado.

---

## 2. Diagnóstico de la implementación anterior

### 2.1 Funcional y de navegación

- El pre-cierre mostraba once bloques, pero no conducía al usuario desde el
  primer impedimento hasta la emisión.
- La pantalla podía indicar que una etapa tardía estaba completa aunque una
  etapa anterior impidiera continuar. La dependencia existía en la compuerta de
  cierre, no en el estado ni en la acción del recorrido.
- Las leyendas de identidad y ejercicio estaban semánticamente invertidas.
- La decisión sobre inflación no era obligatoria: la ausencia de una serie podía
  interpretarse como escenario nominal sin que un profesional hubiera documentado
  `NO_APLICABLE`.

### 2.2 Contable y monetario

- Las mediciones de cierre se comparaban contra la base nominal. En una partida
  no monetaria eso mezclaba el efecto de reexpresión con el resultado de tenencia
  o deterioro y podía impedir la conciliación explicativa del RECPAM.
- El asiento de medición infería el lado natural como si toda cuenta fuera un
  activo; un aumento de pasivo podía recibir el signo incorrecto.
- La selección del criterio no estaba restringida por rubro, destino y
  disponibilidad de datos fiables.
- El valor recuperable no integraba VNR, valor de uso, deterioro y tope de
  reversión en un cálculo trazable.

### 2.3 Inflación y auditoría

- Faltaba una auditoría continua de la serie entre apertura y cierre y un papel
  que expusiera base nominal, orígenes, coeficientes, reexpresión, medición final
  y guardia contra doble ajuste.
- La aplicación tomaba la serie más reciente si el usuario no había elegido una
  para el ejercicio. Eso era cómodo, pero no una decisión profesional auditable.
- El RECPAM ya tenía dos métodos, pero el recorrido no mostraba con suficiente
  claridad sus componentes ni el efecto de aplicar medición después de
  reexpresar la base histórica.

### 2.4 Visual

La pantalla anterior tenía una jerarquía débil: mucho contenido lineal, escasa
separación entre objetivo, hallazgo, impacto y próxima acción, y poca ayuda para
entender por qué un bloqueo impedía avanzar. La comparación se conserva en
`docs/evidence/phase2l/antes`; la solución, en `docs/evidence/phase2l/despues`.

---

## 3. Arquitectura del flujo nuevo

| Capa | Responsabilidad |
|---|---|
| `closingWorkPaperTypes.ts` | Contrato persistente del papel de trabajo: decisiones, revisiones, orígenes, ajustes y auditoría |
| `closingWorkPaperService.ts` | Validación, versionado, aprobación, contabilización idempotente, tratamiento extracontable y reversión |
| `measurementPolicy.ts` | Reglas permitidas por rubro/destino/datos y cálculo de recuperabilidad |
| `measurementService.ts` | Medición, vista previa y asiento con signo según clase/lado natural de la cuenta |
| `accountTreatment.ts` | Matriz por cuenta y secuencia base nominal → base reexpresada → valor de cierre |
| `inflationWorkPaper.ts` | Serie, coeficientes, orígenes, clasificación, guardia de doble ajuste, totales y RECPAM |
| `closingImpact.ts` | Activo, pasivo, PN, resultado, RECPAM y efectivo antes/ajustes/después |
| `closingReadiness.ts` | Núcleo único de bloqueos, advertencias, dependencias y próxima acción |
| `loadReportingBundle.ts` | Orquestación del mismo ejercicio, política, serie, mediciones, papel y estados |
| `exportPreCloseWorkingPaper.ts` | Libro de trabajo auditable en 12 hojas |
| `PreCierrePage.tsx` | Asistente de tres columnas en escritorio y apilado en móvil |

La migración v25 agrega únicamente `closingWorkPapers`; no reutiliza ni cambia el
significado de tablas anteriores. Backup y restore incluyen la tabla nueva.

### Ocho etapas y dependencia

1. Identidad y ejercicio.
2. Integridad y cobertura.
3. Corte y devengamientos.
4. Inventario y costo de ventas.
5. Bienes de uso y depreciaciones.
6. Medición y recuperabilidad.
7. Unidad de medida e inflación.
8. Conciliación y emisión.

Cada etapa hereda los bloqueos de las anteriores. La pantalla muestra objetivo,
preguntas, evidencia, hallazgos, impacto y acción. Si el usuario abre la etapa 8
con un borrador pendiente en la 3, la 8 se muestra `BLOQUEADA`, la acción dice
«Resolver antes de seguir» y lleva al primer impedimento. Publicar y cerrar usan
la misma conclusión del núcleo.

---

## 4. Decisiones de dominio

### 4.1 Aplicabilidad de inflación

`PENDIENTE` bloquea. `APLICABLE` exige un conjunto de índices elegido para el
ejercicio. `NO_APLICABLE` exige un motivo verificable. Actor, fecha, fuente
normativa, versión y cambio quedan en el papel de trabajo; no existe selección
silenciosa de «la última serie».

La serie debe cubrir todos los meses desde apertura hasta cierre. No se interpola
un índice faltante. El coeficiente es índice de cierre dividido por índice de
origen y se presenta junto con ambos valores.

### 4.2 Secuencia medición–reexpresión

Para una partida no monetaria a costo se reconstruyen sus orígenes y se expresa
primero la base histórica en moneda de cierre. Sólo entonces se compara con el
valor corriente o recuperable de cierre:

`importe final = base nominal + ajuste por inflación + ajuste de medición`

El asiento de medición ya registrado se excluye de la base previa para no
reconocerlo otra vez. Una partida medida a valor de cierre conserva ese importe;
la matriz puede mostrar el efecto inflacionario de su base, pero el ajuste de
medición absorbe la diferencia y la guardia evita reexpresar el valor final.

### 4.3 Política de medición y recuperabilidad

- Los criterios ofrecidos dependen de rubro, destino, mercado y datos fiables.
- Una combinación inválida se rechaza antes de guardar o contabilizar.
- Políticas distintas para partidas similares requieren resolver la
  inconsistencia, no sólo agregar una nota.
- Cuando corresponde, el valor recuperable es el mayor entre VNR y valor de uso.
- El deterioro surge del exceso del importe contable sobre ese valor.
- La reversión no supera el importe que habría existido sin el deterioro previo.
- Fuente, fecha, evidencia, nivel de prueba y explicación quedan asociados a la
  medición.

### 4.4 Ajustes y libros

Los ajustes tienen estados `PROPUESTO`, `APROBADO`, `CONTABILIZADO`,
`EXTRACONTABLE` o `REVERTIDO`. Debe = Haber se valida en centavos; no puede haber
dos ajustes activos para el mismo origen; contabilizar dos veces devuelve el
mismo asiento; revertir usa el servicio canónico del Diario y conserva el
antecedente. Ningún asiento original se modifica.

No se creó una cuenta plug para forzar Activo = Pasivo + PN ni para cerrar la
diferencia del RECPAM.

---

## 5. Dataset independiente Cierre Iberá 2025

`src/accounting/fixtures/cierreIbera2025.ts` es un caso separado y pequeño:

- 17 asientos balanceados;
- 13 períodos de índices (apertura 2024-12 a cierre 2025-12);
- efectivo, créditos y deudas monetarios;
- bienes de cambio con orígenes múltiples;
- bienes de uso, alta y depreciación;
- ventas y gastos de distintos meses;
- capital y reserva;
- moneda extranjera;
- tres mediciones de cierre;
- prueba de recuperabilidad y deterioro;
- valor de cierre protegido contra doble reexpresión;
- RECPAM conciliado por método secuencial y analítico;
- estados e impacto antes/después.

SHA-256 del fixture Iberá al cerrar el desarrollo:
`71D5B51102C68CD6D1D0DF7D5B78F7F9A8C2E8D339DAD530C4C4FAF7E7BAFDB8`.

---

## 6. Papeles de trabajo y exportación

El botón «Exportar papel de trabajo» genera un XLSX formal con estas hojas:

1. Resumen.
2. Checklist.
3. Mediciones.
4. Recuperabilidad.
5. Papel AxI.
6. Coeficientes.
7. Clasificación.
8. RECPAM.
9. Ajustes.
10. Pendientes.
11. Informe final.
12. Trazabilidad.

Las filas conservan cuenta, política, origen, índice, medición, ajuste y estado.
La exportación reutiliza la infraestructura XLSX existente; no se construyó una
segunda fuente de cálculo ni un exportador paralelo en PDF.

---

## 7. Pruebas e invariantes

### 7.1 Casos nuevos

`fase2l-golden.test.ts` contiene 27 casos numerados que cubren dataset, balance
en centavos, serie completa/incompleta, monetarias y no monetarias, orígenes
múltiples, valor corriente, doble ajuste, moneda extranjera, bienes de uso,
depreciación, PN, resultados, comparativo, idempotencia, finitud, política,
recuperabilidad, reversión de deterioro, signos de activo/pasivo, RECPAM,
aplicabilidad, prevalencia de bloqueos, exportación y no regresión de fixtures.

`fase2l-workpaper.test.ts` agrega 16 casos persistentes: motivos obligatorios,
serie requerida, auditoría, política similar, Debe = Haber, duplicados,
aprobación, contabilización idempotente, reversión, extracontable, preservación
de libros, cierre/reapertura y validación de importados.

Los E2E cubren las ocho etapas, próxima acción, cierre habilitado y bloqueado,
resolución desde Configuración, redirección histórica, inflación/RECPAM,
escritorio Chromium, Firefox y 390×844 sin desborde.

### 7.2 Resultado técnico final

| Validación | Resultado |
|---|---|
| Unitarias/integración | **110 archivos, 862 tests aprobados** |
| TypeScript | Aprobado |
| Build Vite | Aprobado; 7.840 módulos transformados |
| Chromium desktop completo | **48/48 aprobados** en una corrida final monolítica (4,0 min) |
| Chromium, flujo 2L | **9/9 aprobados** dentro de la suite completa; corrida focal final: 28,0 s |
| Móvil Chromium 390×844 completo | **5/5 aprobados** (32,1 s) |
| Firefox completo | **23/23 aprobados** (2,6 min), incluidas las 9 pruebas 2L |
| Lint | **Aprobado: 0 errores, 53 warnings heredados fuera de los archivos 2L** |

La primera corrida monolítica de Chromium terminó por timeout externo a los
604 s, sin resumen. Al fragmentarla aparecieron dos escenarios históricos que
no declaraban la nueva política v25: la auditoría había cargado una serie sin
seleccionarla profesionalmente y el fixture RC nominal no documentaba
`NO_APLICABLE`. Se corrigieron los datos de prueba —no el gate ni sus
aserciones—, se aislaron los grupos para comprobar la causa y finalmente se
repitieron los 48 casos juntos, todos verdes. La cobertura 2L ejecuta el flujo
completo nuevo, no se limita a comprobar que existan componentes.

### 7.3 No regresión de datasets

| Dataset | SHA-256 | Resultado |
|---|---|---|
| Purmamarca | `954006A48B9CAE0942AC75296CAF5EB571E62A8C5F16E405592C02B82921CD30` | Idéntico byte a byte |
| Grupo Litoral | `AC7D7E86EBA004DB2F480F7AFEE4F4C8C1593DB0FB132D7B3D16C2B8C18B5198` | Idéntico byte a byte |

---

## 8. Evidencia visual antes/después

Antes: cinco capturas del recorrido heredado en
`docs/evidence/phase2l/antes`.

Después: doce capturas en `docs/evidence/phase2l/despues`:

- resumen, identidad, cobertura, corte, inventario, bienes de uso;
- medición/recuperabilidad, inflación, conciliación y bloqueo visible;
- resumen móvil e inflación móvil a 390 px.

También se actualizaron las evidencias canónicas 21–25 de
`docs/auditoria/evidencia`. La revisión fue página/captura completa: jerarquía,
legibilidad, estado y acción coherentes, botones, tablas, barra lateral,
encabezado y ausencia de overflow del documento móvil. El encabezado fijo que
puede repetirse en una captura `fullPage` es un comportamiento de composición de
Playwright, no una duplicación en la interfaz.

---

## 9. Fuentes efectivamente consultadas

1. FACPCE, Resolución Técnica N.º 59 y texto ordenado de la RT 54 (NUA), PDF de
   301 páginas. Se revisaron el documento completo por texto y visualmente las
   páginas pertinentes a unidad de medida, valores corrientes,
   recuperabilidad, reexpresión, patrimonio/resultados, EFE y comparativos.
2. Modelo de estados contables RT 54 para entidades pequeñas con fines de lucro,
   libro XLSX de 14 hojas provisto en la sesión. Se inspeccionaron estructural y
   visualmente todas sus hojas; se usó como referencia de exposición, no como
   sustituto de la norma.
3. Informes de las fases 2I, 2J, 2K y 2K.1, registro de defectos y código/tests de
   Purmamarca y Grupo Litoral.
4. Relevamiento preliminar histórico del motor contable, usado sólo para orientar
   qué recorridos debían volver a comprobarse; las conclusiones se verificaron en
   el código y pruebas actuales.

No estuvieron disponibles con identificación inequívoca el **Programa de
Contabilidad IV**, el **Módulo de Contabilidad IV** ni el material práctico
específico solicitado. Se buscaron variantes de nombre en los recursos provistos
y no se atribuyó a documentos parecidos ese carácter. Los DOCX encontrados se
inspeccionaron estructuralmente; no había LibreOffice disponible para una
validación visual confiable y por eso no se cuentan como fuente normativa
efectivamente validada.

---

## 10. Riesgos, controles y límites deliberados

| Riesgo o límite | Control / tratamiento |
|---|---|
| Usar una serie incorrecta o incompleta | Elección explícita por ejercicio, hash/fuente y auditoría mensual; un faltante bloquea |
| Doble reexpresión de un valor de cierre | Secuencia explícita, exclusión del asiento de medición de la base y bandera `doubleAdjustmentPrevented` |
| RECPAM usado como plug | Conciliación por dos vías, componentes visibles y diferencia dentro de tolerancia; nunca se fuerza la ecuación |
| Política inválida o inconsistente | Catálogo condicionado y validación de partidas similares |
| Deterioro o reversión arbitrarios | Evidencia, VNR/valor de uso y tope del importe sin deterioro previo |
| Ajuste duplicado o libro alterado | `sourceId` único, ciclo de aprobación, posteo idempotente, reversión canónica y golden tests |
| Seleccionar `NO_APLICABLE` por comodidad | Motivo concreto obligatorio, actor/fecha/fuente y auditoría |
| Criterios profesionales fuera del alcance | El motor asiste y bloquea inconsistencias; no reemplaza aprobación profesional ni obtiene índices oficiales automáticamente |

La capacidad de ajuste por inflación queda declarada **PARTIAL**: el cálculo y
el papel son integrales para una serie provista, pero ContaLivre no descarga ni
certifica índices oficiales por sí solo. Tampoco automatiza todas las valuaciones
fiscales, actuariales o sectoriales posibles. Una entidad debe aportar evidencia
y un profesional debe aprobar políticas, estimaciones y emisión.

No se implementó un PDF específico del papel de pre-cierre porque el entregable
solicitó exportar la información y reutilizar infraestructura formal: se priorizó
un XLSX auditable de doce hojas. Los estados PDF existentes continúan siendo la
salida formal del juego de estados.

---

## 11. Diferencias frente a la Fase 2J

| Antes | Fase 2L |
|---|---|
| Once secciones principalmente informativas | Ocho etapas dependientes con objetivo, preguntas y próxima acción |
| Ausencia de serie podía pasar como nominal | Decisión `PENDIENTE/APLICABLE/NO_APLICABLE` persistente y obligatoria |
| Medición contra base nominal | Reexpresión de la base seguida de medición al cierre |
| Criterio libre | Criterios filtrados y validados por rubro/destino/datos |
| Recuperabilidad descriptiva | VNR, valor de uso, deterioro y reversión calculados |
| RECPAM difícil de auditar desde la pantalla | Componentes, evolución monetaria y conciliación dual visibles |
| Sin papel persistente integral | v25 con revisiones, decisiones, ajustes y audit trail |
| Exportación parcial | Libro de trabajo de doce hojas con trazabilidad |
| Bloqueo final sin propagación visual completa | Toda etapa posterior refleja el primer impedimento y conduce a resolverlo |

---

## 12. Veredicto

La implementación cumple el alcance funcional y contable de la Fase 2L para un
asistente de pre-cierre guiado con medición, recuperabilidad, expresión en moneda
de cierre, conciliación del RECPAM, ajustes auditables y exportación del papel de
trabajo. No se declara que ContaLivre sustituya el juicio profesional ni que
obtenga o certifique la serie oficial. Las suites unitarias, Chromium desktop,
Chromium móvil y Firefox están verdes; el timeout monolítico inicial quedó
diagnosticado y reemplazado por una ejecución completa, fragmentada y trazable.
