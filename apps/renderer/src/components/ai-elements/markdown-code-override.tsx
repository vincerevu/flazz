import { isValidElement, useState, type JSX, type MouseEvent } from 'react'
import { DownloadIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FilePathCard } from './file-path-card'

export function MarkdownPreOverride(props: JSX.IntrinsicElements['pre']) {
  const { children, ...rest } = props

  // Check if the child is a <code> with className "language-filepath"
  if (isValidElement(children)) {
    const childProps = children.props as { className?: string; children?: unknown }
    if (
      typeof childProps.className === 'string' &&
      childProps.className.includes('language-filepath')
    ) {
      // Extract the text content from the code element
      const text = typeof childProps.children === 'string'
        ? childProps.children.trim()
        : ''
      if (text) {
        return <FilePathCard filePath={text} />
      }
    }
  }

  // Passthrough for all other code blocks - return children directly
  // so Streamdown's own rendering (syntax highlighting, etc.) is preserved
  return <pre {...rest}>{children}</pre>
}

export function MarkdownImageOverride(props: JSX.IntrinsicElements['img']) {
  const { alt, src, className, ...rest } = props
  const [failed, setFailed] = useState(false)

  if (
    typeof src === 'string' &&
    (/\/\/(?:tse\d*\.)?mm\.bing\.net\//i.test(src) || /\/\/[^/]*\.bing\.com\/th\/id\//i.test(src))
  ) {
    return null
  }

  if (!src || failed) {
    return null
  }

  const label = alt || 'Image'

  const downloadImage = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()

    try {
      const response = await fetch(src, { mode: 'cors' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      const extension = blob.type.split('/')[1]?.split(';')[0] || 'png'
      anchor.href = objectUrl
      anchor.download = `${label.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80) || 'image'}.${extension}`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(objectUrl)
    } catch {
      const anchor = document.createElement('a')
      anchor.href = src
      anchor.download = ''
      anchor.target = '_blank'
      anchor.rel = 'noreferrer'
      anchor.click()
    }
  }

  return (
    <span className="group relative inline-flex max-w-20 align-middle sm:max-w-24">
      <button
        type="button"
        className="block cursor-zoom-in rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        title="Open image preview"
      >
        <img
          {...rest}
          alt={label}
          src={src}
          loading="lazy"
          referrerPolicy="no-referrer"
          className={cn(
            'block max-h-14 w-auto max-w-20 rounded-md border object-contain sm:max-h-16 sm:max-w-24',
            className
          )}
          onError={() => setFailed(true)}
          onLoad={(event) => {
            const image = event.currentTarget
            if (image.naturalWidth <= 140 && image.naturalHeight <= 140) {
              setFailed(true)
            }
          }}
        />
      </button>
      <button
        type="button"
        aria-label="Download image"
        title="Download image"
        onClick={downloadImage}
        className={cn(
          'absolute right-0.5 bottom-0.5 flex size-5 items-center justify-center rounded border border-border bg-background/90 text-foreground shadow-sm backdrop-blur-sm transition-opacity',
          'opacity-0 hover:bg-background group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        )}
      >
        <DownloadIcon className="size-3" aria-hidden="true" />
      </button>
    </span>
  )
}
