"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

const GOOGLE_CLIENT_ID_SETUP_GUIDE_URL =
  "https://github.com/Flazzlabs/Flazz/blob/main/google-setup.md"

interface GoogleClientIdModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (clientId: string, clientSecret?: string) => void
  isSubmitting?: boolean
  description?: string
}

export function GoogleClientIdModal({
  open,
  onOpenChange,
  onSubmit,
  isSubmitting = false,
  description,
}: GoogleClientIdModalProps) {
  const [clientId, setClientId] = useState("")
  const [clientSecret, setClientSecret] = useState("")

  useEffect(() => {
    if (!open) {
      setClientId("")
      setClientSecret("")
    }
  }, [open])

  const trimmedClientId = clientId.trim()
  const isValid = trimmedClientId.length > 0

  const handleSubmit = () => {
    if (!isValid || isSubmitting) return
    onSubmit(trimmedClientId, clientSecret.trim() || undefined)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enter Google Client ID</DialogTitle>
          <DialogDescription>
            {description ?? "Enter the client ID for your Google OAuth app to continue."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="google-client-id">
            Client ID
          </label>
          <div className="text-xs text-muted-foreground">
            Need help setting this up?{" "}
            <a
              className="text-primary underline underline-offset-4 hover:text-primary/80"
              href={GOOGLE_CLIENT_ID_SETUP_GUIDE_URL}
              target="_blank"
              rel="noreferrer"
            >
              Read the setup guide
            </a>
            .
          </div>
          <Input
            id="google-client-id"
            placeholder="xxxxxxxxxxxx-xxxxxxxxxxxxxxxxxxxxxxxx.apps.googleusercontent.com"
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                handleSubmit()
              }
            }}
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="google-client-secret">
            Client secret
          </label>
          <div className="text-xs text-muted-foreground">
            Optional for public desktop clients, but some Google OAuth setups still require it during token exchange.
          </div>
          <Input
            id="google-client-secret"
            type="password"
            placeholder="Enter client secret if Google requires it"
            value={clientSecret}
            onChange={(event) => setClientSecret(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                handleSubmit()
              }
            }}
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || isSubmitting}>
            Continue
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
