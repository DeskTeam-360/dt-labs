/**
 * Department & position options for user forms (create/edit users, profile, user detail).
 * Spelling preserved to match existing DB values (e.g. "Designer").
 */
export const USER_DEPARTMENTS = ['Management', 'Account Manager', 'Production'] as const

export const USER_POSITIONS = [
  'Frontend',
  'Designer',
  'Backend',
  'Account Specialist',
  'HR',
  'CEO',
  'Production Director',
  'Project Director',
  'Project Manager',
  'Video Specialist',
  'Intake Person',
] as const

/** Distinct accent colors for department chips / select indicators (hex). */
export const USER_DEPARTMENT_ACCENTS: { readonly [K in (typeof USER_DEPARTMENTS)[number]]: string } = {
  Management: '#722ed1',
  'Account Manager': '#1677ff',
  Production: '#389e0d',
}

/** Distinct accent colors for position chips / select indicators (hex). */
export const USER_POSITION_ACCENTS: { readonly [K in (typeof USER_POSITIONS)[number]]: string } = {
  Frontend: '#1677ff',
  Designer: '#c41d7f',
  Backend: '#531dab',
  'Account Specialist': '#d46b08',
  HR: '#237804',
  CEO: '#0958d9',
  'Production Director': '#006d75',
  'Project Director': '#10239e',
  'Project Manager': '#096dd9',
  'Video Specialist': '#fa541c',
  'Intake Person': '#595959',
}

export function getUserDepartmentAccentColor(name: string | null | undefined): string | undefined {
  if (!name) return undefined
  return (USER_DEPARTMENT_ACCENTS as Record<string, string | undefined>)[name]
}

export function getUserPositionAccentColor(name: string | null | undefined): string | undefined {
  if (!name) return undefined
  return (USER_POSITION_ACCENTS as Record<string, string | undefined>)[name]
}
