/** Where states report one-line, user-facing outcomes (the notice bar). */
export interface NoticeSink {
  notify(message: string): void
}
