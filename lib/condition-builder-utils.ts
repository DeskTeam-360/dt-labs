/**
 * Converts between react-querybuilder format and our automation_rules conditions format.
 * Our format: { operator: "AND"|"OR", conditions: [...] }
 * RQB format: { combinator: "and"|"or", rules: [...] }
 */

export type OurConditionLeaf = { field: string; operator: string; value: unknown }
export type OurConditionGroup = { operator: 'AND' | 'OR'; conditions: OurCondition[] }
export type OurCondition = OurConditionLeaf | OurConditionGroup

type RQBRule = { id?: string; field: string; operator: string; value?: unknown }
type RQBGroup = { id?: string; combinator: string; rules: (RQBRule | RQBGroup)[] }

function isRQBGroup(r: RQBRule | RQBGroup): r is RQBGroup {
  return 'combinator' in r && Array.isArray((r as RQBGroup).rules)
}

/** RQB format → our format */
export function rqbToOurFormat(rqb: RQBGroup): OurConditionGroup {
  const operator = (rqb.combinator?.toUpperCase() === 'OR' ? 'OR' : 'AND') as 'AND' | 'OR'
  const conditions: OurCondition[] = (rqb.rules || []).map((r) => {
    if (isRQBGroup(r)) {
      return rqbToOurFormat(r)
    }
    return {
      field: r.field || '',
      operator: r.operator || '=',
      value: r.value ?? '',
    }
  })
  return { operator, conditions }
}

/** Our format → RQB format (with stable ids to prevent input unfocus on typing) */
export function ourFormatToRQB(our: OurConditionGroup, idPrefix = 'g'): RQBGroup {
  const combinator = our.operator?.toLowerCase() === 'or' ? 'or' : 'and'
  const rules = (our.conditions || []).map((c, i) => {
    if ('conditions' in c) {
      return ourFormatToRQB(c as OurConditionGroup, `${idPrefix}-${i}`)
    }
    const leaf = c as OurConditionLeaf
    return {
      id: `r-${idPrefix}-${i}`,
      field: leaf.field,
      operator: leaf.operator,
      value: leaf.value,
    }
  })
  return { id: idPrefix, combinator, rules }
}

/** Empty default query for RQB */
export const defaultRQBQuery: RQBGroup = {
  id: 'root',
  combinator: 'and',
  rules: [],
}
