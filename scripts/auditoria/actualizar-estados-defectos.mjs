/**
 * Actualiza la fila "Estado" de cada defecto del registro tras la Fase 2I.
 *
 * Sustitución posicional: sólo toca la línea `| **Estado** | … |` que sigue al
 * encabezado del defecto indicado. No reescribe ninguna otra parte del archivo.
 *
 * Ejecutar:  node scripts/auditoria/actualizar-estados-defectos.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const FILE = resolve(HERE, '..', '..', 'docs', 'auditoria', 'REGISTRO_DEFECTOS.md')

/** defecto → nuevo estado */
const NUEVOS = {
    'DEF-A06': 'Corregido en la Fase 2I — `f9296c5` · confirmado que NO era un falso positivo',
    'DEF-A07': 'Corregido en la Fase 2I — `f9296c5`',
    'DEF-A09': 'Corregido en la Fase 2I — `d2340d7`',
    'DEF-A10': 'Corregido en la Fase 2I — `d2340d7`',
    'DEF-A11': 'Corregido en la Fase 2I — `b27bf55`',
    'DEF-A13': 'Mitigado en la Fase 2I — el motor usa el clasificador correcto; la planilla conserva su heurística',
    'DEF-A14': 'Corregido en la Fase 2I — `78cee1a`',
    'DEF-A15': 'Corregido en la Fase 2I — `b27bf55`',
    'DEF-A16': 'Corregido en la Fase 2I — `b27bf55` · era de presentación',
    'DEF-A17': 'Corregido en la Fase 2I — `b27bf55`',
    'DEF-A20': 'Corregido en la Fase 2I — `b27bf55`',
    'DEF-A21': 'Corregido en la Fase 2I — `b27bf55`',
    'DEF-A22': 'Corregido en la Fase 2I — `b27bf55`',
}

const lines = readFileSync(FILE, 'utf-8').split(/\r?\n/)
let current = null
let cambiados = 0

for (let i = 0; i < lines.length; i++) {
    const header = /^## (DEF-A\d+)/.exec(lines[i])
    if (header) { current = header[1]; continue }
    if (current && /^\| \*\*Estado\*\* \|/.test(lines[i]) && NUEVOS[current]) {
        lines[i] = `| **Estado** | ${NUEVOS[current]} |`
        cambiados += 1
        current = null
    }
}

writeFileSync(FILE, lines.join('\n'), 'utf-8')
console.log(`Estados actualizados: ${cambiados}`)
