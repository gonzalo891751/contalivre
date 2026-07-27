/**
 * Auditoría E2E — el ciclo contable tiene que ser alcanzable desde la interfaz.
 *
 * Dos capacidades centrales estaban implementadas y probadas en el dominio pero
 * no tenían ninguna puerta de entrada en la aplicación:
 *
 *  - DEF-A01: registrar un set de índices (`saveIndexSet`). Sin él, "Moneda de
 *    cierre" nunca se habilita y no hay reexpresión ni RECPAM en los estados.
 *  - DEF-A04: cerrar el ejercicio (`previewClosing` / `generateClosingDrafts` /
 *    `postClosing` / `generateOpeningEntry`). Sólo estaba cableada la
 *    reapertura, así que se podía reabrir lo que nunca se había podido cerrar.
 *
 * Esta prueba es la guarda de regresión: si alguien vuelve a dejar el servicio
 * sin interfaz, falla acá y no en producción.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const SRC = join(__dirname, '..', '..', 'src')

function allSourceFiles(dir: string): string[] {
    const out: string[] = []
    for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) out.push(...allSourceFiles(full))
        else if (/\.tsx$/.test(name)) out.push(full)
    }
    return out
}

const rel = (f: string) => relative(join(SRC, '..'), f).split(sep).join('/')

/** Archivos de interfaz (.tsx) que importan un símbolo del dominio */
function uiFilesImporting(symbol: string, modulePath: string): string[] {
    const re = new RegExp(`import[^;]*\\b${symbol}\\b[^;]*from\\s+['"][^'"]*${modulePath}['"]`)
    return allSourceFiles(SRC).filter(f => re.test(readFileSync(f, 'utf-8'))).map(rel)
}

describe('el ciclo contable es alcanzable desde la interfaz', () => {
    it('alguna pantalla registra sets de índices en el registro canónico', () => {
        const users = uiFilesImporting('saveIndexSet', 'inflation/indexRegistry')
        expect(users, 'ninguna pantalla llama a saveIndexSet: la moneda de cierre queda inalcanzable').not.toHaveLength(0)
    })

    it('alguna pantalla ofrece la vista previa del cierre', () => {
        expect(uiFilesImporting('previewClosing', 'application/closingService')).not.toHaveLength(0)
    })

    it('alguna pantalla contabiliza el cierre y genera la apertura siguiente', () => {
        expect(uiFilesImporting('postClosing', 'application/closingService')).not.toHaveLength(0)
        expect(uiFilesImporting('generateOpeningEntry', 'application/closingService')).not.toHaveLength(0)
    })

    it('la refundición se puede revisar en borrador antes de contabilizarse', () => {
        expect(uiFilesImporting('generateClosingDrafts', 'application/closingService')).not.toHaveLength(0)
    })

    it('la reapertura sigue disponible y sigue exigiendo un motivo', () => {
        const users = uiFilesImporting('reopenClosedExercise', 'application/closingService')
        expect(users).not.toHaveLength(0)
        const content = readFileSync(join(SRC, 'components', 'Configuracion', 'panels', 'EjerciciosPanel.tsx'), 'utf-8')
        expect(content).toMatch(/reopenReason/)
    })

    it('el selector de índices ya no manda al papel de trabajo que no registra nada', () => {
        const selector = readFileSync(
            join(SRC, 'components', 'Estados', 'canonical', 'InflationSetSelector.tsx'), 'utf-8')
        expect(selector).toContain('seccion=inflacion')
        expect(selector).not.toMatch(/Cargalos en Cierre \(AxI\)/)
    })
})
