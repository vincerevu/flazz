import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { useFileCard } from '@/contexts/file-card-context'
import { wikiLabel } from '@/lib/wiki-links'
import { FilePathCard } from '@/components/ai-elements/file-path-card'
import { cn } from '@/lib/utils'

export function WikiLink({ 
  path, 
  className 
}: { 
  path: string
  className?: string 
}) {
  const { onOpenMemoryFile } = useFileCard()
  const label = wikiLabel(path)

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          onClick={() => onOpenMemoryFile(path)}
          className={cn(
            "text-primary hover:underline font-mono text-[0.9em] opacity-80 hover:opacity-100 transition-opacity",
            className
          )}
        >
          [[{label}]]
        </button>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 p-0 overflow-hidden border-none bg-transparent shadow-2xl">
        <FilePathCard filePath={path} />
      </HoverCardContent>
    </HoverCard>
  )
}

export function FileCard({ 
  path, 
  onClick 
}: { 
  path: string
  onClick?: (path: string) => void 
}) {
  const { onOpenMemoryFile } = useFileCard()
  
  const handleClick = () => {
    if (onClick) {
      onClick(path)
    } else {
      onOpenMemoryFile(path)
    }
  }

  return (
    <div onClick={handleClick} className="cursor-pointer">
      <FilePathCard filePath={path} />
    </div>
  )
}
