import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, Plus, X } from 'lucide-react'

import { buildFrontmatter, extractAllFrontmatterValues } from '@/lib/frontmatter'

type FrontmatterField = {
  key: string
  value: string | string[]
}

type PropertyKind = 'text' | 'list' | 'date'

type SuggestedProperty = {
  key: string
  kind: PropertyKind
}

const SUGGESTED_PROPERTIES: SuggestedProperty[] = [
  { key: 'type', kind: 'text' },
  { key: 'status', kind: 'text' },
  { key: 'relationship', kind: 'text' },
  { key: 'industry', kind: 'text' },
  { key: 'domain', kind: 'text' },
  { key: 'aliases', kind: 'list' },
  { key: 'people', kind: 'list' },
  { key: 'projects', kind: 'list' },
  { key: 'first met', kind: 'date' },
  { key: 'last seen', kind: 'date' },
]

function fieldsFromRaw(raw: string | null): FrontmatterField[] {
  return Object.entries(extractAllFrontmatterValues(raw)).map(([key, value]) => ({ key, value }))
}

function rawFromFields(fields: FrontmatterField[]): string | null {
  const record: Record<string, string | string[]> = {}
  for (const field of fields) {
    const trimmedKey = field.key.trim()
    if (!trimmedKey) continue
    record[trimmedKey] = field.value
  }
  return buildFrontmatter(record)
}

function inferFieldKind(field: FrontmatterField): PropertyKind {
  if (Array.isArray(field.value)) return 'list'
  const lowerKey = field.key.trim().toLowerCase()
  if (
    lowerKey.includes('date')
    || lowerKey.includes('seen')
    || lowerKey.includes('met')
    || /^\d{4}-\d{2}-\d{2}$/.test(field.value.trim())
  ) {
    return 'date'
  }
  return 'text'
}

function buildInitialValue(kind: PropertyKind): string | string[] {
  return kind === 'list' ? [] : ''
}

export function FrontmatterProperties({
  raw,
  onRawChange,
  editable = true,
}: {
  raw: string | null
  onRawChange: (raw: string | null) => void
  editable?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const [fields, setFields] = useState<FrontmatterField[]>(() => fieldsFromRaw(raw))
  const [addingField, setAddingField] = useState(false)
  const [pendingFieldKey, setPendingFieldKey] = useState('')
  const [pendingFieldKind, setPendingFieldKind] = useState<PropertyKind>('text')
  const newFieldInputRef = useRef<HTMLInputElement | null>(null)
  const lastRawRef = useRef(raw)

  useEffect(() => {
    if (lastRawRef.current !== raw) {
      setFields(fieldsFromRaw(raw))
      lastRawRef.current = raw
    }
  }, [raw])

  useEffect(() => {
    if (addingField) {
      newFieldInputRef.current?.focus()
    }
  }, [addingField])

  const commit = useCallback((nextFields: FrontmatterField[]) => {
    const nextRaw = rawFromFields(nextFields)
    lastRawRef.current = nextRaw
    onRawChange(nextRaw)
  }, [onRawChange])

  const propertyCount = fields.length

  const beginAddField = useCallback((suggestion?: SuggestedProperty) => {
    setAddingField(true)
    setPendingFieldKey(suggestion?.key ?? '')
    setPendingFieldKind(suggestion?.kind ?? 'text')
  }, [])

  const cancelAddField = useCallback(() => {
    setAddingField(false)
    setPendingFieldKey('')
    setPendingFieldKind('text')
  }, [])

  const removeField = useCallback((index: number) => {
    setFields((prev) => {
      const next = prev.filter((_, fieldIndex) => fieldIndex !== index)
      commit(next)
      return next
    })
  }, [commit])

  const addField = useCallback((key: string, kind: PropertyKind) => {
    const trimmed = key.trim()
    if (!trimmed) return

    let added = false
    setFields((prev) => {
      if (prev.some((field) => field.key.toLowerCase() === trimmed.toLowerCase())) return prev
      const next = [...prev, { key: trimmed, value: buildInitialValue(kind) }]
      commit(next)
      added = true
      return next
    })

    if (added) {
      cancelAddField()
    }
  }, [cancelAddField, commit])

  const updateFieldValue = useCallback((index: number, nextValue: string) => {
    setFields((prev) => prev.map((field, fieldIndex) => (
      fieldIndex === index ? { ...field, value: nextValue } : field
    )))
  }, [])

  const commitFieldValue = useCallback(() => {
    setFields((prev) => {
      commit(prev)
      return prev
    })
  }, [commit])

  const updateArrayField = useCallback((index: number, nextValue: string[]) => {
    setFields((prev) => {
      const next = prev.map((field, fieldIndex) => (
        fieldIndex === index ? { ...field, value: nextValue } : field
      ))
      commit(next)
      return next
    })
  }, [commit])

  const rows = useMemo(() => fields, [fields])
  const remainingSuggestions = useMemo(
    () => SUGGESTED_PROPERTIES.filter((suggestion) => (
      !fields.some((field) => field.key.toLowerCase() === suggestion.key.toLowerCase())
    )),
    [fields]
  )

  return (
    <div className="frontmatter-properties">
      <button
        type="button"
        className="frontmatter-toggle"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <ChevronRight className={`frontmatter-chevron ${expanded ? 'expanded' : ''}`} size={14} />
        <span className="frontmatter-label">
          Properties{propertyCount > 0 ? ` (${propertyCount})` : ''}
        </span>
      </button>

      {expanded ? (
        <div className="frontmatter-fields">
          {rows.map((field, index) => {
            const kind = inferFieldKind(field)

            return (
              <div key={`${field.key}-${index}`} className="frontmatter-row">
                <span className="frontmatter-key" title={field.key}>
                  {field.key}
                </span>
                <div className="frontmatter-value-area">
                  {Array.isArray(field.value) ? (
                    <ArrayField
                      value={field.value}
                      editable={editable}
                      onChange={(nextValue) => updateArrayField(index, nextValue)}
                    />
                  ) : (
                    <input
                      className="frontmatter-input"
                      type={kind === 'date' ? 'date' : 'text'}
                      readOnly={!editable}
                      value={field.value}
                      onChange={(event) => updateFieldValue(index, event.target.value)}
                      onBlur={commitFieldValue}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.currentTarget.blur()
                        }
                      }}
                    />
                  )}
                </div>
                {editable ? (
                  <button
                    type="button"
                    className="frontmatter-remove"
                    onClick={() => removeField(index)}
                    title="Remove property"
                  >
                    <X size={12} />
                  </button>
                ) : null}
              </div>
            )
          })}

          {editable && remainingSuggestions.length > 0 ? (
            <div className="frontmatter-suggestions">
              {remainingSuggestions.map((suggestion) => (
                <button
                  key={suggestion.key}
                  type="button"
                  className="frontmatter-suggestion"
                  onClick={() => addField(suggestion.key, suggestion.kind)}
                  title={`Add ${suggestion.key}`}
                >
                  <Plus size={10} />
                  <span>{suggestion.key}</span>
                </button>
              ))}
            </div>
          ) : null}

          {editable ? (
            addingField ? (
              <div className="frontmatter-add-panel">
                <div className="frontmatter-add-row">
                  <input
                    ref={newFieldInputRef}
                    className="frontmatter-input frontmatter-new-key-input"
                    placeholder="Property name"
                    value={pendingFieldKey}
                    onChange={(event) => setPendingFieldKey(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        addField(pendingFieldKey, pendingFieldKind)
                      } else if (event.key === 'Escape') {
                        cancelAddField()
                      }
                    }}
                  />
                  <select
                    className="frontmatter-kind-select"
                    value={pendingFieldKind}
                    onChange={(event) => setPendingFieldKind(event.target.value as PropertyKind)}
                  >
                    <option value="text">Text</option>
                    <option value="list">List</option>
                    <option value="date">Date</option>
                  </select>
                </div>
                <div className="frontmatter-add-actions">
                  <button
                    type="button"
                    className="frontmatter-add-confirm"
                    onClick={() => addField(pendingFieldKey, pendingFieldKind)}
                  >
                    Add property
                  </button>
                  <button
                    type="button"
                    className="frontmatter-add-cancel"
                    onClick={cancelAddField}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="frontmatter-add"
                onClick={() => beginAddField()}
              >
                <Plus size={12} />
                <span>Add property</span>
              </button>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function ArrayField({
  value,
  editable,
  onChange,
}: {
  value: string[]
  editable: boolean
  onChange: (nextValue: string[]) => void
}) {
  const removeItem = useCallback((index: number) => {
    onChange(value.filter((_, itemIndex) => itemIndex !== index))
  }, [onChange, value])

  const addItem = useCallback((rawValue: string) => {
    const trimmed = rawValue.trim()
    if (!trimmed) return
    onChange([...value, trimmed])
  }, [onChange, value])

  return (
    <div className="frontmatter-array">
      {value.map((item, index) => (
        <span key={`${item}-${index}`} className="frontmatter-chip">
          <span className="frontmatter-chip-text">{item}</span>
          {editable ? (
            <button
              type="button"
              className="frontmatter-chip-remove"
              onClick={() => removeItem(index)}
            >
              <X size={10} />
            </button>
          ) : null}
        </span>
      ))}
      {editable ? (
        <input
          className="frontmatter-chip-input"
          placeholder="Add..."
          onBlur={(event) => {
            if (event.currentTarget.value.trim()) {
              addItem(event.currentTarget.value)
              event.currentTarget.value = ''
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault()
              addItem(event.currentTarget.value)
              event.currentTarget.value = ''
            } else if (event.key === 'Backspace' && !event.currentTarget.value && value.length > 0) {
              removeItem(value.length - 1)
            }
          }}
        />
      ) : null}
    </div>
  )
}
