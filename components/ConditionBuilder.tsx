'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { QueryBuilder, type Field, type RuleGroupType } from 'react-querybuilder'
import { QueryBuilderAntD } from '@react-querybuilder/antd'
import 'react-querybuilder/dist/query-builder.css'
import { rqbToOurFormat, ourFormatToRQB, defaultRQBQuery, type OurConditionGroup } from '@/lib/condition-builder-utils'
import type { ActionProps } from 'react-querybuilder'

function AddRuleButton({ handleOnClick, label }: ActionProps) {
  return (
    <Button type="dashed" icon={<PlusOutlined />} block onClick={(e) => handleOnClick(e)}>
      {label ?? 'Add Rule'}
    </Button>
  )
}

/** Fields available for ticket automation conditions */
export const CONDITION_FIELDS: Field[] = [
  { name: 'subject', label: 'Subject' },
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
]

interface ConditionBuilderProps {
  value?: OurConditionGroup | null
  onChange: (value: OurConditionGroup) => void
}

export default function ConditionBuilder({ value, onChange }: ConditionBuilderProps) {
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
        background: '#fafafa',
        borderRadius: 8,
        border: '1px solid #f0f0f0',
      }}
    >
      <QueryBuilderAntD>
        <QueryBuilder
          fields={CONDITION_FIELDS}
          query={query}
          onQueryChange={handleChange}
          addRuleToNewGroups
          showCombinatorsBetweenRules
          translations={{ addRule: { label: 'Add Rule' } }}
          controlElements={{
            addGroupAction: () => null,
            addRuleAction: AddRuleButton,
          }}
        />
      </QueryBuilderAntD>
    </div>
  )
}
