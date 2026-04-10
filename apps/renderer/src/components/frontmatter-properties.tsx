import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight, Plus, X } from 'lucide-react'

import { buildFrontmatter, extractAllFrontmatterValues } from '@/lib/frontmatter'

type FrontmatterField = {
  key: string
  value: string | string[]
}

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

  const removeField = useCallback((index: number) => {
    setFields((prev) => {
      const next = prev.filter((_, fieldIndex) => fieldIndex !== index)
      commit(next)
      return next
    })
  }, [commit])

  const addField = useCallback((key: string) => {
    const trimmed = key.trim()
    if (!trimmed) return
    setFields((prev) => {
      if (prev.some((field) => field.key === trimmed)) return prev
      const next = [...prev, { key: trimmed, value: '' }]
      commit(next)
      return next
    })
    setAddingField(false)
  }, [commit])

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
          {rows.map((field, index) => (
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
          ))}

          {editable ? (
            addingField ? (
              <div className="frontmatter-row frontmatter-new-row">
                <input
                  ref={newFieldInputRef}
                  className="frontmatter-input frontmatter-new-key-input"
                  placeholder="Property name"
                  onBlur={(event) => {
                    if (event.currentTarget.value.trim()) {
                      addField(event.currentTarget.value)
                    } else {
                      setAddingField(false)
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      addField(event.currentTarget.value)
                    } else if (event.key === 'Escape') {
                      setAddingField(false)
                    }
                  }}
                />
              </div>
            ) : (
              <button
                type="button"
                className="frontmatter-add"
                onClick={() => setAddingField(true)}
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

