// Who is calling? Reads the Better Auth session from the cookie or the Authorization header.
import 'server-only'
import { getAuth } from './auth'
import { type AppRole, isAppRole } from './roles'

export interface Actor {
  readonly id: string
  readonly email: string
  readonly fullName: string
  readonly role: AppRole
  readonly mustChangePassword: boolean
}

export type ActorResolution =
  | { readonly status: 'anonymous' }
  | { readonly status: 'inactive' }
  | { readonly status: 'active'; readonly actor: Actor }

interface SessionUser {
  readonly id: string
  readonly email: string
  readonly name: string
  readonly role?: string | null
  readonly banned?: boolean | null
  readonly mustChangePassword?: boolean | null
}

export function toActorResolution(user: SessionUser | null | undefined): ActorResolution {
  if (!user) {
    return { status: 'anonymous' }
  }
  if (user.banned || !isAppRole(user.role)) {
    return { status: 'inactive' }
  }
  return {
    status: 'active',
    actor: {
      id: user.id,
      email: user.email,
      fullName: user.name,
      role: user.role,
      mustChangePassword: user.mustChangePassword ?? false,
    },
  }
}

export async function resolveActor(headers: Headers): Promise<ActorResolution> {
  const session = await getAuth().api.getSession({ headers })
  return toActorResolution(session?.user)
}
