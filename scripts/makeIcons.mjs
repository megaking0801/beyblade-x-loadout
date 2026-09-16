/**
 * 產生 PWA 需要的 App icon。
 *
 * 規格對照：第 2 節（manifest、App icon、可加入主畫面）。
 *
 * 直接用 Node 的 zlib 寫 PNG，不引入額外相依，也不抓取外部素材。
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '../public/icons')

const BG = [15, 23, 42, 255]
const FG = [77, 142, 247, 255]
const FG2 = [232, 237, 244, 255]

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const typeBuffer = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0)
  return Buffer.concat([length, typeBuffer, data, crc])
}

function encodePng(size, pixelAt) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  let offset = 0
  for (let y = 0; y < size; y += 1) {
    raw[offset] = 0
    offset += 1
    for (let x = 0; x < size; x += 1) {
      const [r, g, b, a] = pixelAt(x, y, size)
      raw[offset] = r
      raw[offset + 1] = g
      raw[offset + 2] = b
      raw[offset + 3] = a
      offset += 4
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** 圓形底 + 斜向雙線構成的 X 標記。maskable 版留出安全邊界。 */
function makePixel(padRatio) {
  return (x, y, size) => {
    const cx = size / 2
    const cy = size / 2
    const radius = size / 2 - 1
    const dx = x - cx
    const dy = y - cy
    const inCircle = dx * dx + dy * dy <= radius * radius
    if (!inCircle) return [0, 0, 0, 0]

    const inner = size * (0.5 - padRatio)
    const nx = dx / inner
    const ny = dy / inner
    const thickness = 0.26

    const onDiagA = Math.abs(nx - ny) < thickness && Math.abs(nx) < 1 && Math.abs(ny) < 1
    const onDiagB = Math.abs(nx + ny) < thickness && Math.abs(nx) < 1 && Math.abs(ny) < 1

    if (onDiagA) return FG2
    if (onDiagB) return FG
    return BG
  }
}

mkdirSync(outDir, { recursive: true })

const targets = [
  { file: 'icon-192.png', size: 192, pad: 0.08 },
  { file: 'icon-512.png', size: 512, pad: 0.08 },
  { file: 'icon-maskable-512.png', size: 512, pad: 0.2 },
]

for (const target of targets) {
  writeFileSync(resolve(outDir, target.file), encodePng(target.size, makePixel(target.pad)))
  console.log(`寫出 ${target.file}（${target.size}×${target.size}）`)
}

const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="32" fill="#0f172a"/>
  <path d="M16 16 L48 48" stroke="#e8edf4" stroke-width="9" stroke-linecap="round"/>
  <path d="M48 16 L16 48" stroke="#4d8ef7" stroke-width="9" stroke-linecap="round"/>
</svg>
`
writeFileSync(resolve(here, '../public/favicon.svg'), favicon, 'utf8')
console.log('寫出 favicon.svg')
