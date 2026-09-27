import { contextBridge, ipcRenderer } from 'electron'
import { IpcChannel, type GenfolioApi } from '@shared/genfolio-api'

const api: GenfolioApi = {
  getServiceHealth: () => ipcRenderer.invoke(IpcChannel.ServiceHealth)
}

contextBridge.exposeInMainWorld('genfolio', api)
