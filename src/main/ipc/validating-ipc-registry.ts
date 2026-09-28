import type { IpcMain, IpcMainInvokeEvent } from 'electron'
import type { z } from 'zod'
import type { IpcChannel } from '@shared/genfolio-api'
import { describeIssues } from '@shared/validation'

/** An IPC call came from a frame other than the app's own renderer document. */
export class UntrustedSenderError extends Error {
  constructor(channel: IpcChannel) {
    super(`Rejected ${channel}: sender is not the app renderer`)
    this.name = 'UntrustedSenderError'
  }
}

/** IPC arguments did not match the channel's schema. */
export class InvalidRequestError extends Error {
  constructor(channel: IpcChannel, reason: string) {
    super(`Invalid ${channel} request: ${reason}`)
    this.name = 'InvalidRequestError'
  }
}

export type IpcRegistrar = Pick<IpcMain, 'handle'>

export interface IpcHandlerRegistry {
  /**
   * Registers `handler` for `channel`. The returned promise rejects with
   * {@link UntrustedSenderError} or {@link InvalidRequestError} before `handler` runs.
   */
  register<A extends unknown[], R>(
    channel: IpcChannel,
    argsSchema: z.ZodType<A>,
    handler: (...args: A) => R | Promise<R>
  ): void
}

/** Validates the sender frame and the arguments of every renderer→main call. */
export class ValidatingIpcRegistry implements IpcHandlerRegistry {
  constructor(
    private readonly ipc: IpcRegistrar,
    private readonly isTrustedSenderUrl: (url: string) => boolean
  ) {}

  register<A extends unknown[], R>(
    channel: IpcChannel,
    argsSchema: z.ZodType<A>,
    handler: (...args: A) => R | Promise<R>
  ): void {
    this.ipc.handle(channel, async (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      const senderUrl = event.senderFrame?.url
      if (senderUrl === undefined || !this.isTrustedSenderUrl(senderUrl)) {
        throw new UntrustedSenderError(channel)
      }
      const parsed = argsSchema.safeParse(args)
      if (!parsed.success) throw new InvalidRequestError(channel, describeIssues(parsed.error))
      return handler(...parsed.data)
    })
  }
}
