import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const rootDir = process.cwd()
const svgPath = path.join(rootDir, 'public', 'favicon.svg')
const svgBuffer = await fs.readFile(svgPath)

const outputs = [
  { name: 'favicon-16.png', size: 16 },
  { name: 'favicon-32.png', size: 32 },
  { name: 'apple-touch-icon.png', size: 180 },
  { name: 'android-chrome-192.png', size: 192 },
  { name: 'android-chrome-512.png', size: 512 }
]

await Promise.all(
  outputs.map(({ name, size }) =>
    sharp(svgBuffer, { density: 512 })
      .resize(size, size, { fit: 'contain' })
      .png()
      .toFile(path.join(rootDir, 'public', name))
  )
)

console.log('Favicons generated.')
