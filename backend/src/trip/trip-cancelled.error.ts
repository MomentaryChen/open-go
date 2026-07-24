/** Thrown when a trip job is aborted mid-pipeline (admin cancel or AbortSignal). */
export class TripCancelledError extends Error {
  constructor(message = 'Job cancelled') {
    super(message);
    this.name = 'TripCancelledError';
  }
}

export function isTripCancelledError(error: unknown): boolean {
  if (error instanceof TripCancelledError) return true;
  if (!(error instanceof Error)) return false;
  // DOMException AbortError from AbortSignal.throwIfAborted / fetch abort.
  return error.name === 'AbortError' || error.name === 'TripCancelledError';
}
