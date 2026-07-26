/**
 * Cierre del PR #28 — Pie de provenance del PDF profesional.
 *
 * El pie decía `Motor 2G.0 · schema v22 · reporte ca341a6b · VALIDATED`, que se
 * leía como si toda la aplicación fuera una versión vieja, mezclaba inglés y
 * exponía un identificador técnico sin contexto en un documento formal.
 *
 * Ahora distingue la versión de la aplicación de la del motor contable, traduce
 * el estado y mueve el identificador del reporte a los metadatos del archivo.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { reportProvenanceLine } from '../../src/pdf/reportBundlePdfFormal'

const META = {
    appVersion: 'v0.5.0-rc.1',
    engineVersion: '2G.0',
    schemaVersion: 22,
    status: 'VALIDATED',
}

describe('PR #28 — leyenda de provenance', () => {
    it('distingue la versión de la app de la del motor contable', () => {
        const line = reportProvenanceLine(META, false)
        expect(line).toContain('ContaLivre v0.5.0-rc.1')
        expect(line).toContain('Motor contable 2G.0')
    })

    it('no puede confundirse con la versión de toda la aplicación', () => {
        const line = reportProvenanceLine(META, false)
        // El "2G.0" siempre va precedido de "Motor contable".
        expect(line).not.toMatch(/(^|[^e])Motor 2G/)
        expect(line).toMatch(/Motor contable 2G\.0/)
    })

    it('usa castellano en el esquema y en el estado', () => {
        const line = reportProvenanceLine(META, false)
        expect(line).toContain('esquema v22')
        expect(line).toContain('VALIDADO')
        expect(line).not.toContain('schema v')
        expect(line).not.toContain('VALIDATED')
    })

    it('el identificador técnico del reporte NO aparece en el pie', () => {
        const line = reportProvenanceLine({ ...META }, false)
        expect(line).not.toContain('reporte')
    })

    it('traduce los demás estados y respeta el borrador', () => {
        expect(reportProvenanceLine({ ...META, status: 'BLOCKED' }, false)).toContain('BLOQUEADO')
        expect(reportProvenanceLine(META, true)).toContain('BORRADOR')
    })

    it('el reportVersion se conserva en los metadatos del PDF', () => {
        const source = readFileSync(
            join(__dirname, '..', '..', 'src', 'pdf', 'reportBundlePdfFormal.ts'),
            'utf-8'
        )
        expect(source).toContain('doc.setProperties')
        expect(source).toContain('reporte ${m.reportVersion}')
        expect(source).toContain('`reporte:${m.reportVersion}`')
    })
})
