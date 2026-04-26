import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'

type PanelErrorBoundaryProps = {
  panelName: string
  children: React.ReactNode
  onReset?: () => void
}

type PanelErrorBoundaryState = {
  error: Error | null
}

export class PanelErrorBoundary extends React.Component<
  PanelErrorBoundaryProps,
  PanelErrorBoundaryState
> {
  state: PanelErrorBoundaryState = {
    error: null,
  }

  static getDerivedStateFromError(error: Error): PanelErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[Renderer] ${this.props.panelName} crashed`, error, errorInfo)
  }

  private handleReset = () => {
    this.setState({ error: null })
    this.props.onReset?.()
  }

  render() {
    if (!this.state.error) {
      return this.props.children
    }

    return (
      <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center p-6">
        <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-border bg-background/80 p-6 text-center shadow-sm">
          <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </span>
          <div className="space-y-1">
            <div className="text-sm font-semibold">{this.props.panelName} crashed</div>
            <div className="text-sm text-muted-foreground">
              Flazz isolated the failure so the rest of the app can keep running.
            </div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={this.handleReset}>
            <RefreshCw className="size-4" />
            Reload panel
          </Button>
        </div>
      </div>
    )
  }
}
