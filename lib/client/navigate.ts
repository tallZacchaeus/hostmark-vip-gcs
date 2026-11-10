// A full page load (not a client-side route change): used when everything on screen must be read
// again, e.g. after switching event (P9). Its own module so tests can replace it.
export function navigateTo(path: string): void {
  window.location.assign(path)
}
