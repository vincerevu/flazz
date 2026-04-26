import * as React from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type MemoryCollectionSaveDialogProps = {
  open: boolean
  saveName: string
  inputRef: React.RefObject<HTMLInputElement | null>
  onOpenChange: (open: boolean) => void
  onSaveNameChange: (value: string) => void
  onConfirm: () => void
}

export function MemoryCollectionSaveDialog({
  open,
  saveName,
  inputRef,
  onOpenChange,
  onSaveNameChange,
  onConfirm,
}: MemoryCollectionSaveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[360px]">
        <DialogHeader>
          <DialogTitle>Save Base</DialogTitle>
          <DialogDescription>Choose a name for this base view.</DialogDescription>
        </DialogHeader>
        <input
          ref={inputRef}
          type="text"
          value={saveName}
          onChange={(event) => onSaveNameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onConfirm()
          }}
          placeholder="e.g. Contacts, Projects..."
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          autoFocus
        />
        <DialogFooter>
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!saveName.trim()}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Save
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
