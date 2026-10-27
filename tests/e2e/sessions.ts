// The demo roles the end-to-end tests sign in as, and where each saved session is kept.
export const ROLES = ['coordinator', 'programs', 'accommodation', 'housekeeping', 'driver'] as const
export type Role = (typeof ROLES)[number]
export const sessionFile = (role: Role): string => `playwright/.auth/${role}.json`
