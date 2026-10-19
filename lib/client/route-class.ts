// The design's stylesheet varies the shell per screen with a `route-<name>` class on the app
// container (route-guests, route-profile, …). This maps a URL path to that name.

export function routeClass(pathname: string): string {
  const [first, second] = pathname.split('/').filter(Boolean)
  if (first === 'guests' && second) return 'profile'
  if (first === 'intake' && second) return 'review'
  if (first === 'rooms' && second === 'plan') return 'allocation'
  return first ?? 'dashboard'
}
