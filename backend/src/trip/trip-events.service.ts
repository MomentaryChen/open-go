import { Injectable } from '@nestjs/common';
import { ReplaySubject, Observable } from 'rxjs';
import { TripProgressEvent } from './trip.types';

/**
 * Per-job event bus backing the SSE endpoint. A ReplaySubject is used so a
 * client that connects slightly after `POST /trips` still receives the events
 * emitted in the meantime.
 */
@Injectable()
export class TripEventsService {
  private readonly streams = new Map<
    string,
    ReplaySubject<TripProgressEvent>
  >();

  emit(event: TripProgressEvent) {
    this.subject(event.jobId).next(event);
    if (event.status === 'done' || event.status === 'failed') {
      this.complete(event.jobId);
    }
  }

  stream(jobId: string): Observable<TripProgressEvent> {
    return this.subject(jobId).asObservable();
  }

  has(jobId: string) {
    return this.streams.has(jobId);
  }

  private complete(jobId: string) {
    const subject = this.streams.get(jobId);
    if (!subject) return;
    subject.complete();
    // Keep the buffer around briefly so late subscribers still see the result.
    setTimeout(() => this.streams.delete(jobId), 60_000).unref?.();
  }

  private subject(jobId: string) {
    let subject = this.streams.get(jobId);
    if (!subject) {
      subject = new ReplaySubject<TripProgressEvent>(50);
      this.streams.set(jobId, subject);
    }
    return subject;
  }
}
