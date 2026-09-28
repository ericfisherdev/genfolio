import { formatRoute, parseRoute, type Route } from './route'

/** The location hash, abstracted so tests do not need a real window. */
export interface HashLocation {
  read(): string
  /** Adds a history entry. */
  write(hash: string): void
  /** Replaces the current history entry. */
  replace(hash: string): void
  onChange(listener: () => void): () => void
}

export function windowHashLocation(target: Window): HashLocation {
  return {
    read: () => target.location.hash,
    write: (hash) => {
      target.location.hash = hash
    },
    // replaceState fires no hashchange; the router has already set the route itself.
    replace: (hash) => target.history.replaceState(target.history.state, '', hash),
    onChange: (listener) => {
      target.addEventListener('hashchange', listener)
      return () => target.removeEventListener('hashchange', listener)
    }
  }
}

/** Current route, kept in sync with the location hash in both directions. */
export class RouterState {
  // Raw: routes are replaced whole, never mutated, and their filters are sent over IPC,
  // which can't clone Svelte's deep-state proxies.
  route: Route = $state.raw(parseRoute(''))
  private readonly unsubscribe: () => void

  constructor(private readonly location: HashLocation) {
    this.route = parseRoute(location.read())
    this.unsubscribe = location.onChange(() => {
      this.route = parseRoute(location.read())
    })
  }

  navigate(route: Route): void {
    this.route = route
    this.location.write(formatRoute(route))
  }

  /** Like navigate, but without adding a history entry (for refinements such as typing). */
  replace(route: Route): void {
    this.route = route
    this.location.replace(formatRoute(route))
  }

  dispose(): void {
    this.unsubscribe()
  }
}
