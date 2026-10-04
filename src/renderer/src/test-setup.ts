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

// jsdom has no matchMedia; Svelte's reactive window values (devicePixelRatio) listen on one.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  const noop = (): void => undefined
  window.matchMedia = (media: string): MediaQueryList =>
    ({
      media,
      matches: false,
      onchange: null,
      addEventListener: noop,
      removeEventListener: noop,
      addListener: noop,
      removeListener: noop,
      dispatchEvent: () => false
    }) as MediaQueryList
}

// jsdom images never decode; Chromium's decode() resolves once pixels are ready.
if (typeof HTMLImageElement !== 'undefined' && !HTMLImageElement.prototype.decode) {
  HTMLImageElement.prototype.decode = () => Promise.resolve()
}
