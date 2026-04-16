import { Activity, Clock3, History, ListChecks, Sparkles, Wand2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { IPCChannels } from "@flazz/shared/src/ipc.js"
import type { SkillPanelItem, SkillRevisionItem } from "@/features/skills/types"

type SkillLearningStats = IPCChannels['skills:getLearningStats']['res']

export function SkillsMainPanel({
  skills,
  selectedSkill,
  learningStats,
  revisions,
  selectedRevision,
  selectedRevisionId,
  setSelectedRevisionId,
  mutatingCandidateId,
  rollingBackRevisionId,
  onPromoteCandidate,
  onRejectCandidate,
  onRollbackRevision,
}: {
  skills: SkillPanelItem[]
  selectedSkill: SkillPanelItem | null
  learningStats: SkillLearningStats | null
  revisions: SkillRevisionItem[]
  selectedRevision: SkillRevisionItem | null
  selectedRevisionId: string | null
  setSelectedRevisionId?: (revisionId: string | null) => void
  mutatingCandidateId?: string | null
  rollingBackRevisionId?: string | null
  onPromoteCandidate?: (signature: string) => void
  onRejectCandidate?: (signature: string) => void
  onRollbackRevision?: (skillName: string, revisionId: string) => void
}) {
  if (!selectedSkill) {
    return null
  }

  const isCandidate = selectedSkill.status !== 'active'
  const isMutating = isCandidate && 'signature' in selectedSkill && mutatingCandidateId === selectedSkill.signature

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Sparkles className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold">{selectedSkill.name}</h1>
              <Badge variant="outline" className="rounded-full px-2 text-[11px] font-normal">
                {selectedSkill.category}
              </Badge>
              <Badge variant={isCandidate ? "secondary" : "outline"} className="rounded-full px-2 text-[11px] font-normal capitalize">
                {selectedSkill.status}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{selectedSkill.tagline}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
          <section className="space-y-6">
            {learningStats && (
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <Activity className="size-4 text-primary" />
                  Learning pipeline
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <StatCard label="Pending candidates" value={String(learningStats.pendingCandidateCount)} />
                  <StatCard label="Promoted" value={String(learningStats.promotedCandidateCount)} />
                  <StatCard label="Rejected" value={String(learningStats.rejectedCandidateCount)} />
                  <StatCard label="Tracked skills" value={String(learningStats.trackedSkillCount)} />
                </div>
              </div>
            )}

            {isCandidate && 'signature' in selectedSkill && (
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="mb-3 text-sm font-medium">Candidate review</div>
                <p className="mb-4 text-sm leading-6 text-muted-foreground">
                  This skill was proposed by the autonomous learning loop. Promote it if the workflow is reusable, or reject it if the pattern is too narrow.
                </p>
                <div className="mb-4 grid gap-3 sm:grid-cols-2">
                  <StatCard label="Confidence" value={`${Math.round(selectedSkill.confidence * 100)}%`} />
                  <StatCard label="Matched runs" value={String(selectedSkill.occurrences)} />
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => onPromoteCandidate?.(selectedSkill.signature)}
                    disabled={isMutating}
                  >
                    Promote candidate
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => onRejectCandidate?.(selectedSkill.signature)}
                    disabled={isMutating}
                  >
                    Reject candidate
                  </Button>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Wand2 className="size-4 text-primary" />
                What this skill is for
              </div>
              <p className="text-sm leading-6 text-muted-foreground">{selectedSkill.description}</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <ListChecks className="size-4 text-primary" />
                Operating checklist
              </div>
              <div className="space-y-2">
                {selectedSkill.checklist.map((item, index) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 rounded-lg bg-muted/40 px-3 py-2.5 text-sm"
                  >
                    <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-[11px] text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="leading-5">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {selectedSkill.status === 'active' && selectedSkill.source === 'workspace' && (
              <div className="rounded-xl border border-border bg-card p-5">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <History className="size-4 text-primary" />
                  Revision history
                </div>
                {revisions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No revisions yet.</p>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      {revisions.map((revision) => (
                        <Button
                          key={revision.id}
                          variant={selectedRevisionId === revision.id ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setSelectedRevisionId?.(revision.id)}
                        >
                          {revision.reason} · {new Date(revision.createdAt).toLocaleDateString()}
                        </Button>
                      ))}
                    </div>
                    {selectedRevision && (
                      <div className="space-y-3">
                        <div className="rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
                          {selectedRevision.summary || `Revision by ${selectedRevision.actor}`}
                        </div>
                        <div className="grid gap-3 xl:grid-cols-2">
                          <div className="rounded-lg border border-border bg-muted/30 p-3">
                            <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              Previous
                            </div>
                            <div className="font-mono text-xs leading-5 text-foreground/90 whitespace-pre-wrap max-h-64 overflow-y-auto">
                              {(selectedRevision.previousContent || 'No previous content recorded.').slice(0, 2400)}
                            </div>
                          </div>
                          <div className="rounded-lg border border-border bg-muted/30 p-3">
                            <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              Selected Revision
                            </div>
                            <div className="font-mono text-xs leading-5 text-foreground/90 whitespace-pre-wrap max-h-64 overflow-y-auto">
                              {selectedRevision.nextContent.slice(0, 2400)}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          disabled={rollingBackRevisionId === selectedRevision.id}
                          onClick={() => onRollbackRevision?.(selectedSkill.name, selectedRevision.id)}
                        >
                          Roll back to this revision
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          <aside className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Activity className="size-4 text-primary" />
                Snapshot
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <StatCard label="Usage" value={selectedSkill.usageCountLabel} />
                <StatCard label="Last updated" value={selectedSkill.lastUpdatedLabel} />
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 text-sm font-medium">Trigger phrases</div>
              <div className="flex flex-wrap gap-2">
                {selectedSkill.triggers.map((trigger) => (
                  <Badge key={trigger} variant="secondary" className="rounded-full px-2 py-0.5 font-normal">
                    {trigger}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Clock3 className="size-4 text-primary" />
                Tools and starter prompt
              </div>
              <div className="space-y-4">
                <div>
                  <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Connected tools
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedSkill.tools.map((tool) => (
                      <span
                        key={tool}
                        className={cn(
                          "rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground",
                        )}
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    Prompt starter
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3 font-mono text-xs leading-5 text-foreground/90">
                    {selectedSkill.promptStarter}
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  )
}
