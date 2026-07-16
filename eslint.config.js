import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
    { ignores: ['dist'] },
    {
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        files: ['**/*.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 2020,
            globals: globals.browser,
        },
        plugins: {
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            'react-refresh/only-export-components': [
                'warn',
                { allowConstantExport: true },
            ],
            // Fase 2A (ACC-001): la tabla de asientos solo se escribe desde
            // src/accounting/repositories/journalRepository.ts (ver override).
            'no-restricted-syntax': [
                'error',
                {
                    selector:
                        "CallExpression[callee.object.object.name='db'][callee.object.property.name='entries'][callee.property.name=/^(add|put|update|delete|bulkAdd|bulkPut|bulkDelete|clear|modify)$/]",
                    message:
                        'Escritura directa en db.entries prohibida (ACC-001). Usá el servicio único de contabilización: src/accounting (createDraftEntry, postNewEntry, postOperation, reverseEntry, replaceOperationEntry, voidOperationEntry).',
                },
            ],
        },
    },
    {
        // Único punto de escritura autorizado a la tabla de asientos
        files: ['src/accounting/repositories/journalRepository.ts'],
        rules: {
            'no-restricted-syntax': 'off',
        },
    },
)
