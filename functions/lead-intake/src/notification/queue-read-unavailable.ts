// Storage-port failure: a read could not complete, but no queue state changed.
// Adapters must only use this for a positively identified transient failure.
export class QueueReadUnavailableError extends Error {
  public constructor(cause: unknown) {
    super('Notification queue read temporarily unavailable', { cause });
    this.name = 'QueueReadUnavailableError';
  }
}
