import { readFile } from 'fs/promises'
import { NextResponse } from 'next/server'
import path from 'path'

import { wpGate } from '@/lib/wp-access'

export const dynamic = 'force-dynamic'

const FOLDER = 'deskteam360-monitor'
const FILE = 'deskteam360-monitor.php'

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** A zip with one stored (uncompressed) file: all WordPress needs for "Plugins, Add New, Upload". */
function zipOne(name: string, data: Buffer): Buffer {
  const nameBuf = Buffer.from(name, 'utf8')
  const crc = crc32(data)
  const now = new Date()
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()

  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0x0800, 6)
  local.writeUInt16LE(0, 8)
  local.writeUInt16LE(dosTime, 10)
  local.writeUInt16LE(dosDate, 12)
  local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(data.length, 18)
  local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(nameBuf.length, 26)
  local.writeUInt16LE(0, 28)

  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE(20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0x0800, 8)
  central.writeUInt16LE(0, 10)
  central.writeUInt16LE(dosTime, 12)
  central.writeUInt16LE(dosDate, 14)
  central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(data.length, 20)
  central.writeUInt32LE(data.length, 24)
  central.writeUInt16LE(nameBuf.length, 28)
  central.writeUInt32LE(0, 38)
  central.writeUInt32LE(0, 42)

  const localPart = Buffer.concat([local, nameBuf, data])
  const centralPart = Buffer.concat([central, nameBuf])
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(centralPart.length, 12)
  end.writeUInt32LE(localPart.length, 16)
  return Buffer.concat([localPart, centralPart, end])
}

/** GET /api/wp-monitor/plugin - the DeskTeam360 Monitor plugin as a zip, ready for WordPress "Upload plugin" (admin only). */
export async function GET() {
  const g = await wpGate({ adminOnly: true })
  if ('error' in g) return g.error
  let source: Buffer
  try {
    source = await readFile(path.join(process.cwd(), 'wp-plugin', FOLDER, FILE))
  } catch {
    return NextResponse.json({ error: 'The plugin file is not on this server' }, { status: 404 })
  }
  const zip = zipOne(`${FOLDER}/${FILE}`, source)
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${FOLDER}.zip"`,
      'Cache-Control': 'no-store',
    },
  })
}
