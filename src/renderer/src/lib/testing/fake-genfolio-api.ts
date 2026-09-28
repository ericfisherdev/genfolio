import type { GenfolioApi } from '@shared/genfolio-api'

const unexpected = (name: string) => (): never => {
  throw new Error(`Unexpected GenfolioApi.${name} call in test`)
}

/** A GenfolioApi whose methods throw unless overridden, so tests state what they use. */
export function fakeGenfolioApi(overrides: Partial<GenfolioApi> = {}): GenfolioApi {
  return {
    getServiceHealth: unexpected('getServiceHealth'),
    listRoots: unexpected('listRoots'),
    addRootViaDialog: unexpected('addRootViaDialog'),
    removeRoot: unexpected('removeRoot'),
    rescanRoot: unexpected('rescanRoot'),
    getImageLayout: unexpected('getImageLayout'),
    getImages: unexpected('getImages'),
    getDirectoryTree: unexpected('getDirectoryTree'),
    onScanEvent: () => () => undefined,
    ...overrides
  }
}
