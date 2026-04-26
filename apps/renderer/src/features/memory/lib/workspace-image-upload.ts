import { getExtension, toFileUrl } from '@/lib/file-utils'
import { workspaceIpc } from '@/services/workspace-ipc'

const WORKSPACE_IMAGE_DIR = 'assets/images'

function sanitizeFilenameSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
}

function inferImageExtension(file: File) {
  const explicit = getExtension(file.name)
  if (explicit) return explicit

  const mime = file.type.toLowerCase()
  if (mime === 'image/png') return 'png'
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  if (mime === 'image/svg+xml') return 'svg'
  if (mime === 'image/bmp') return 'bmp'
  if (mime === 'image/tiff') return 'tiff'
  return 'bin'
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

export async function uploadImageToWorkspace(file: File, workspaceRoot: string) {
  const ext = inferImageExtension(file)
  const baseName = sanitizeFilenameSegment(file.name.replace(/\.[^.]+$/, '')) || `image-${Date.now()}`
  const dateStamp = new Date().toISOString().slice(0, 10)
  const filename = `${baseName}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const relativePath = `${WORKSPACE_IMAGE_DIR}/${dateStamp}/${filename}`
  const base64 = arrayBufferToBase64(await file.arrayBuffer())

  await workspaceIpc.writeFile(relativePath, base64, { encoding: 'base64', mkdirp: true })
  return toFileUrl(`${workspaceRoot}/${relativePath}`)
}
