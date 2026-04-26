import * as React from "react"
import { Check, Filter, ListFilter, Save, Search, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

import type { ActiveFilter } from "./memory-collection-types"

type MemoryCollectionControlsProps = {
  builtinColumns: readonly string[]
  builtinLabels: Record<string, string>
  allPropertyKeys: string[]
  visibleColumns: string[]
  filterCategories: string[]
  valuesByCategory: Record<string, string[]>
  filters: ActiveFilter[]
  filterCategory: string | null
  searchOpen: boolean
  searchQuery: string
  searchMatchCount: number | null
  searchInputRef: React.RefObject<HTMLInputElement | null>
  toTitleCase: (key: string) => string
  toggleColumn: (column: string) => void
  setFilterCategory: (category: string | null) => void
  toggleFilter: (category: string, value: string) => void
  clearFilters: () => void
  toggleSearch: () => void
  onSearchQueryChange: (value: string) => void
  onSave: () => void
  onCreateNote: () => void
  hasFilter: (filters: ActiveFilter[], next: ActiveFilter) => boolean
  summaryTotal: number
  filteredTotal: number
}

export function MemoryCollectionControls({
  builtinColumns,
  builtinLabels,
  allPropertyKeys,
  visibleColumns,
  filterCategories,
  valuesByCategory,
  filters,
  filterCategory,
  searchOpen,
  searchQuery,
  searchMatchCount,
  searchInputRef,
  toTitleCase,
  toggleColumn,
  setFilterCategory,
  toggleFilter,
  clearFilters,
  toggleSearch,
  onSearchQueryChange,
  onSave,
  onCreateNote,
  hasFilter,
  summaryTotal,
  filteredTotal,
}: MemoryCollectionControlsProps) {
  return (
    <>
      <div className="shrink-0 border-b border-border px-4 py-2">
        <div className="flex items-center gap-3">
          <Popover>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <ListFilter className="size-3.5" />
                Properties
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-0">
              <Command>
                <CommandInput placeholder="Search properties..." />
                <CommandList>
                  <CommandEmpty>No properties found.</CommandEmpty>
                  <CommandGroup heading="Built-in">
                    {builtinColumns.map((column) => (
                      <CommandItem key={column} onSelect={() => toggleColumn(column)}>
                        <Check
                          className={cn(
                            "mr-2 size-3.5",
                            visibleColumns.includes(column) ? "opacity-100" : "opacity-0",
                          )}
                        />
                        {builtinLabels[column]}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  <CommandGroup heading="Frontmatter">
                    {allPropertyKeys.map((key) => (
                      <CommandItem key={key} onSelect={() => toggleColumn(key)}>
                        <Check
                          className={cn(
                            "mr-2 size-3.5",
                            visibleColumns.includes(key) ? "opacity-100" : "opacity-0",
                          )}
                        />
                        {toTitleCase(key)}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          <Popover
            onOpenChange={(open) => {
              if (!open) setFilterCategory(null)
            }}
          >
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground",
                  filters.length > 0 && "text-foreground",
                )}
              >
                <Filter className="size-3.5" />
                Filter
                {filters.length > 0 ? (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] font-medium leading-tight text-primary-foreground">
                    {filters.length}
                  </span>
                ) : null}
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className={cn("p-0", filterCategory ? "w-[420px]" : "w-[200px]")}
            >
              <div className="flex h-[300px]">
                <div
                  className={cn(
                    "overflow-auto",
                    filterCategory ? "w-[160px] border-r border-border" : "flex-1",
                  )}
                >
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Attributes
                    </span>
                    {filters.length > 0 ? (
                      <button
                        onClick={clearFilters}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        Reset
                      </button>
                    ) : null}
                  </div>
                  {filterCategories.map((category) => {
                    const activeCount = filters.filter(
                      (filter) => filter.category === category,
                    ).length
                    const isSelected = filterCategory === category
                    return (
                      <button
                        key={category}
                        onClick={() => setFilterCategory(category)}
                        className={cn(
                          "flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent",
                          isSelected ? "bg-accent text-foreground" : "text-muted-foreground",
                        )}
                      >
                        <span className="flex-1 truncate">{toTitleCase(category)}</span>
                        {activeCount > 0 ? (
                          <span className="shrink-0 rounded-full bg-primary px-1.5 text-[10px] font-medium leading-tight text-primary-foreground">
                            {activeCount}
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
                {filterCategory ? (
                  <div className="flex min-w-0 flex-1 flex-col">
                    <Command className="flex flex-1 flex-col">
                      <CommandInput
                        placeholder={`Search ${toTitleCase(filterCategory).toLowerCase()}...`}
                      />
                      <CommandList className="max-h-none flex-1 overflow-auto">
                        <CommandEmpty>No values found.</CommandEmpty>
                        <CommandGroup>
                          {(valuesByCategory[filterCategory] ?? []).map((value) => {
                            const active = hasFilter(filters, {
                              category: filterCategory,
                              value,
                            })
                            return (
                              <CommandItem
                                key={value}
                                onSelect={() => toggleFilter(filterCategory, value)}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 size-3.5 shrink-0",
                                    active ? "opacity-100" : "opacity-0",
                                  )}
                                />
                                <span className="truncate">{value}</span>
                              </CommandItem>
                            )
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </div>
                ) : null}
              </div>
            </PopoverContent>
          </Popover>

          <button
            onClick={toggleSearch}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground",
              searchOpen && "text-foreground",
            )}
          >
            <Search className="size-3.5" />
            Search
          </button>

          {searchOpen ? (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                placeholder="Search notes..."
                className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
              />
              {searchQuery ? (
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {searchMatchCount !== null ? `${searchMatchCount} matches` : "..."}
                </span>
              ) : null}
              <button
                onClick={toggleSearch}
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </div>
          ) : null}

          <div className="flex-1" />

          <button
            onClick={onSave}
            className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          >
            <Save className="size-3.5" />
            Save As
          </button>

          <Button size="sm" onClick={onCreateNote}>
            New note
          </Button>
        </div>
      </div>

      {filters.length > 0 ? (
        <div className="shrink-0 border-b border-border px-4 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0 text-xs text-muted-foreground">
              {filteredTotal} of {summaryTotal} notes
            </span>
            {filters.map((filter) => (
              <button
                key={`${filter.category}:${filter.value}`}
                onClick={() => toggleFilter(filter.category, filter.value)}
                className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground"
              >
                <span className="text-primary-foreground/60">{filter.category}:</span>
                {filter.value}
                <X className="size-3" />
              </button>
            ))}
            <button
              onClick={clearFilters}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear all
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
