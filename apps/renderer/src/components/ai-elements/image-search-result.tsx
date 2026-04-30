"use client";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  ImageIcon,
  LoaderIcon,
  XCircleIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

type ImageSearchResultItem = {
  title: string;
  imageUrl: string;
  thumbnailUrl: string;
  sourceUrl: string;
  width?: number;
  height?: number;
  source?: string;
  sourceDomain?: string;
};

interface ImageSearchResultProps {
  query: string;
  results: ImageSearchResultItem[];
  status: "pending" | "running" | "completed" | "error";
  error?: string;
  filteredOut?: number;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function ImageSearchResult({ query, results, status, error, filteredOut }: ImageSearchResultProps) {
  const isRunning = status === "pending" || status === "running";
  const hasError = status === "error" || Boolean(error);
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  const visibleResults = useMemo(() => results.slice(0, 8), [results]);

  const markImageFailed = (url: string) => {
    setFailedImages((current) => {
      const next = new Set(current);
      next.add(url);
      return next;
    });
  };

  return (
    <Collapsible defaultOpen className="not-prose mb-3 w-full rounded-md border">
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 px-2.5 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <ImageIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-xs font-medium">Searched images</span>
        </div>
        <ChevronDownIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-2 px-2.5 pb-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <ImageIcon className="size-3 shrink-0" />
              <span className="truncate">{query}</span>
            </div>
            {results.length > 0 && (
              <div className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground">
                <span>{results.length} image{results.length !== 1 ? "s" : ""}</span>
                {filteredOut ? <span>({filteredOut} filtered)</span> : null}
              </div>
            )}
          </div>

          {visibleResults.length > 0 && (
            <div className="grid max-h-72 grid-cols-3 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-4">
              {visibleResults.map((result, index) => {
                const imageCandidates = [result.thumbnailUrl, result.imageUrl].filter(Boolean);
                const imageUrl = imageCandidates.find((url) => !failedImages.has(url));
                const domain = result.sourceDomain || getDomain(result.sourceUrl);
                const dimensions = result.width && result.height
                  ? `${result.width} x ${result.height}`
                  : "";

                return (
                  <button
                    key={`${result.imageUrl}-${index}`}
                    type="button"
                    onClick={() => openExternal(result.sourceUrl)}
                    className="group overflow-hidden rounded-md border bg-background text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title={`${result.title}\n${result.sourceUrl}`}
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-muted">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={result.title}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="size-full object-cover transition-transform group-hover:scale-[1.02]"
                          onError={() => markImageFailed(imageUrl)}
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center text-muted-foreground">
                          <ImageIcon className="size-5" />
                        </div>
                      )}
                    </div>
                    <div className="space-y-0.5 p-1.5">
                      <div className="line-clamp-2 min-h-7 text-[11px] font-medium leading-3.5">
                        {result.title}
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span className="truncate">{domain}</span>
                        <ExternalLinkIcon className="size-3 shrink-0" />
                      </div>
                      {dimensions && (
                        <div className="text-[10px] leading-3 text-muted-foreground">
                          {dimensions}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {hasError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error || "Image search failed."}
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {isRunning ? (
              <>
                <LoaderIcon className="size-3.5 animate-spin" />
                <span>Searching...</span>
              </>
            ) : hasError ? (
              <>
                <XCircleIcon className="size-3.5 text-destructive" />
                <span>Failed</span>
              </>
            ) : (
              <>
                <CheckCircleIcon className="size-3.5 text-green-600" />
                <span>Done</span>
              </>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
