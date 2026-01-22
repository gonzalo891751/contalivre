import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

export default defineConfig({
    plugins: [
        react(),
        tailwindcss(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: [
                'favicon.svg',
                'favicon.ico',
                'favicon-16.png',
                'favicon-32.png',
                'apple-touch-icon.png',
                'android-chrome-192.png',
                'android-chrome-512.png',
                'icons/*.png',
                'brand/*.png'
            ],
            manifest: {
                name: 'ContaLivre',
                short_name: 'ContaLivre',
                description: 'Tu asistente contable',
                theme_color: '#0F172A',
                background_color: '#0F172A',
                display: 'standalone',
                scope: '/',
                start_url: '/',
                icons: [
                    {
                        src: '/android-chrome-192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: '/android-chrome-512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    }
                ]
            },
            workbox: {
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
                globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'google-fonts-cache',
                            expiration: {
                                maxEntries: 10,
                                maxAgeSeconds: 60 * 60 * 24 * 365
                            },
                            cacheableResponse: {
                                statuses: [0, 200]
                            }
                        }
                    }
                ]
            }
        })
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            '@core': path.resolve(__dirname, './src/core'),
            '@storage': path.resolve(__dirname, './src/storage'),
            '@ui': path.resolve(__dirname, './src/ui'),
            '@pages': path.resolve(__dirname, './src/pages')
        }
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: './tests/setup.ts'
    }
})
