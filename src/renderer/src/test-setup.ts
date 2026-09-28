// jsdom does not implement modal dialogs; model just the open state the components rely on.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
}

// jsdom has no ResizeObserver; the virtualizer and Svelte's dimension bindings expect one.
if (typeof globalThis.ResizeObserver === 'undefined') {
  const noop = (): void => undefined
  globalThis.ResizeObserver = class {
    observe = noop
    unobserve = noop
    disconnect = noop
  }
}
