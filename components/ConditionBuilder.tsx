'use client'

import { useState, useEffect, useRef } from 'react'
import { Button, Select } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { QueryBuilder, type Field, type RuleGroupType, useValueSelector } from 'react-querybuilder'
import { QueryBuilderAntD } from '@react-querybuilder/antd'
import 'react-querybuilder/dist/query-builder.css'
import { rqbToOurFormat, ourFormatToRQB, defaultRQBQuery, type OurConditionGroup } from '@/lib/condition-builder-utils'
import type { ActionProps, VersatileSelectorProps } from 'react-querybuilder'

function AddRuleButton({ handleOnClick, label }: ActionProps) {
  return (
    <Button type="dashed" icon={<PlusOutlined />} block onClick={(e) => handleOnClick(e)}>
      {label ?? 'Add Rule'}
    </Button>
  )
}

// Custom value selector with search functionality
function SearchableValueSelector(props: VersatileSelectorProps) {
  const { onChange, val } = useValueSelector(props)

  return (
    <Select
      showSearch
      filterOption={(input, option) =>
        (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
      }
      title={props.title}
      className={props.className}
      popupMatchSelectWidth={false}
      disabled={props.disabled}
      value={val}
      onChange={onChange}
      optionFilterProp="label"
      options={props.options}
    />
  )
}

/**
 * Static fields for ticket automation (Type options are loaded from `/api/tickets/lookup`).
 * Exported for tests; UI merges in Type after fetch.
 */
export const CONDITION_FIELDS: Field[] = [
  { name: 'subject', label: 'Subject (ticket title)' },
  { name: 'description', label: 'Description' },
  { name: 'priority', label: 'Priority', valueEditorType: 'select', values: [
    { name: 'urgent', label: 'Urgent' },
    { name: 'high', label: 'High' },
    { name: 'medium', label: 'Medium' },
    { name: 'low', label: 'Low' },
  ]},
  // { name: 'status', label: 'Status', valueEditorType: 'select', values: [
  //   { name: 'pending', label: 'Pending' },
  //   { name: 'open', label: 'Open' },
  //   { name: 'in_progress', label: 'In Progress' },
  //   { name: 'resolved', label: 'Resolved' },
  //   { name: 'closed', label: 'Closed' },
  // ]},
  { name: 'sender_domain', label: 'Sender Domain' },
  { name: 'sender_email', label: 'Sender Email' },
  // { name: 'assignee_id', label: 'Assignee ID' },
  { name: 'created_via', label: 'Created Via', valueEditorType: 'select', values: [
    { name: 'portal', label: 'Portal (Admin App)' },
    { name: 'email', label: 'Email' },
    { name: 'website', label: 'Website (Embed/Widget)' },
    { name: 'app', label: 'App (Mobile/External)' },
    { name: 'api', label: 'API' },
  ]},
  { name: 'ticket_type', label: 'Ticket classification (spam / trash)', valueEditorType: 'select', values: [
    { name: 'support', label: 'Support' },
    { name: 'spam', label: 'Spam' },
    { name: 'trash', label: 'Trash' },
  ]},
  { name: 'comment_visibility', label: 'Comment visibility (reply / note)', valueEditorType: 'select', values: [
    { name: 'reply', label: 'Reply (thread / email)' },
    { name: 'note', label: 'Internal note' },
  ]},
  { name: 'comment_author_type', label: 'Comment author', valueEditorType: 'select', values: [
    { name: 'agent', label: 'Agent / staff' },
    { name: 'customer', label: 'Customer' },
  ]},
]

interface ConditionBuilderProps {
  value?: OurConditionGroup | null
  /** Form.Item injects this; optional for type-check when used as `<ConditionBuilder />` only. */
  onChange?: (value: OurConditionGroup) => void
}

function fieldsWithTicketTypes(typeSlugs: { slug: string; title: string }[]): Field[] {
  const typeField: Field = {
    name: 'type',
    label: 'Type',
    valueEditorType: 'select',
    values: typeSlugs.map((t) => ({ name: t.slug, label: t.title })),
  }
  const priorityIdx = CONDITION_FIELDS.findIndex((f) => f.name === 'priority')
  const next = [...CONDITION_FIELDS]
  next.splice(priorityIdx + 1, 0, typeField)
  return next
}

export default function ConditionBuilder({ value, onChange = () => {} }: ConditionBuilderProps) {
  const [fields, setFields] = useState<Field[]>(() => CONDITION_FIELDS)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/tickets/lookup', { credentials: 'include' })
        if (!res.ok || cancelled) return
        const data = (await res.json()) as { ticketTypes?: { slug: string; title: string }[] }
        const types = Array.isArray(data.ticketTypes) ? data.ticketTypes : []
        if (!cancelled) setFields(fieldsWithTicketTypes(types))
      } catch {
        if (!cancelled) setFields(CONDITION_FIELDS)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const [query, setQuery] = useState<RuleGroupType>(() => {
    const v = value as OurConditionGroup | undefined
    return v?.conditions?.length
      ? (ourFormatToRQB(v) as RuleGroupType)
      : (defaultRQBQuery as RuleGroupType)
  })
  const isInternalChange = useRef(false)

  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false
      return
    }
    const v = value as OurConditionGroup | undefined
    const next = v?.conditions?.length
      ? (ourFormatToRQB(v) as RuleGroupType)
      : (defaultRQBQuery as RuleGroupType)
    setQuery(next)
  }, [value])

  const handleChange = (q: RuleGroupType) => {
    isInternalChange.current = true
    setQuery(q)
    if (q.rules && q.rules.length > 0) {
      const our = rqbToOurFormat(q as Parameters<typeof rqbToOurFormat>[0])
      onChange(our)
    } else {
      onChange({ operator: 'AND', conditions: [] })
    }
  }

  return (
    <div
      className="condition-builder-action-style"
      style={{
        padding: 16,
        background: 'var(--automation-builder-panel-bg)',
        borderRadius: 8,
        border: '1px solid var(--automation-builder-panel-border)',
      }}
    >
      <QueryBuilderAntD>
        <QueryBuilder
          fields={fields}
          query={query}
          onQueryChange={handleChange}
          addRuleToNewGroups
          showCombinatorsBetweenRules
          translations={{ addRule: { label: 'Add Rule' } }}
          controlElements={{
            addGroupAction: () => null,
            addRuleAction: AddRuleButton,
            valueSelector: SearchableValueSelector,
          }}
        />
      </QueryBuilderAntD>
    </div>
  )
}
