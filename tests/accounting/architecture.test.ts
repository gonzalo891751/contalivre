/**
 * Fase 2A — Test arquitectónico (ACC-001).
 * Ningún archivo de src/ puede escribir directamente en la tabla de asientos,
 * salvo el repositorio autorizado. Complementa la regla ESLint
 * no-restricted-syntax: si alguien la desactiva, este test lo detecta.
 */

import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const SRC_DIR = join(__dirname, '..', '..', 'src')
const ALLOWED = ['src/accounting/repositories/journalRepository.ts']
const WRITE_PATTERN = /db\s*\.\s*entries\s*\.\s*(add|put|update|delete|bulkAdd|bulkPut|bulkDelete|clear|modify)\s*\(/g

function collectSourceFiles(dir: string): string[] {
    const files: string[] = []
    for (const name of readdirSync(dir)) {
        const full = join(dir, name)
        if (statSync(full).isDirectory()) {
            files.push(...collectSourceFiles(full))
        } else if (/\.(ts|tsx)$/.test(name)) {
            files.push(full)
        }
    }
    return files
}

describe('Fase 2A — arquitectura: puerta única de contabilización', () => {
    it('solo journalRepository.ts escribe en db.entries', () => {
        const offenders: string[] = []
        for (const file of collectSourceFiles(SRC_DIR)) {
            const rel = relative(join(SRC_DIR, '..'), file).split(sep).join('/')
            if (ALLOWED.includes(rel)) continue
            const content = readFileSync(file, 'utf-8')
            const matches = content.match(WRITE_PATTERN)
            if (matches) {
                offenders.push(`${rel}: ${matches.join(', ')}`)
            }
        }
        expect(offenders, `Escrituras directas prohibidas encontradas:\n${offenders.join('\n')}`).toEqual([])
    })
})
