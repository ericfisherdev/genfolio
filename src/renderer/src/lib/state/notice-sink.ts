/** A button beside a notice, such as "Open logs". */
export interface NoticeAction {
  readonly label: string
  readonly run: () => void
}

/** Where states report one-line, user-facing outcomes (the notice bar). */
export interface NoticeSink {
  notify(message: string, action?: NoticeAction): void
}
