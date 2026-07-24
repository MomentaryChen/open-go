import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { TripEventsService } from './trip-events.service';
import { tripConfig } from './trip.config';

type QueueItem = {
  jobId: string;
  run: () => Promise<void>;
};

/** How many waiting jobs get a "you are Nth in line" message. */
const MAX_ANNOUNCED_POSITIONS = 25;

/**
 * Admission control for trip jobs.
 *
 * Each job drives a full pipeline: several LLM calls plus a bounded-concurrency
 * crawl through a shared browser. Starting one per request the moment it
 * arrives means N simultaneous users produce N times that load with nothing
 * pushing back. This caps how many run at once and holds the rest in a FIFO
 * backlog, so a traffic spike becomes a longer wait instead of a meltdown.
 *
 * The backlog is in-process and does not survive a restart — TripService
 * re-enqueues jobs still marked `pending` on boot.
 */
@Injectable()
export class TripQueueService {
  private readonly logger = new Logger(TripQueueService.name);

  private readonly backlog: QueueItem[] = [];
  private readonly running = new Set<string>();

  /** Guards against two concurrent pumps both admitting into the same slot. */
  private pumping = false;
  private pumpRequested = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly events: TripEventsService,
  ) {}

  /** Queues a job; it starts as soon as a slot is free. */
  enqueue(jobId: string, run: () => Promise<void>) {
    this.backlog.push({ jobId, run });
    void this.pump();
  }

  stats() {
    return { running: this.running.size, queued: this.backlog.length };
  }

  /**
   * Admits as many queued jobs as the concurrency limit allows. Re-entrant
   * calls set a flag instead of running in parallel: the limit is read
   * asynchronously, and two pumps awaiting it together would each see the same
   * stale `running.size` and overshoot.
   */
  private async pump(): Promise<void> {
    if (this.pumping) {
      this.pumpRequested = true;
      return;
    }
    this.pumping = true;

    try {
      do {
        this.pumpRequested = false;

        const limit = await this.resolveLimit();
        while (this.running.size < limit && this.backlog.length > 0) {
          this.start(this.backlog.shift()!);
        }
      } while (this.pumpRequested);
    } finally {
      this.pumping = false;
    }

    // Deliberately off the admission path and not awaited: annotating waiting
    // jobs is cosmetic and must never delay starting the next one.
    void this.publishQueuePositions();
  }

  private start(item: QueueItem) {
    this.running.add(item.jobId);
    void item
      .run()
      .catch((error) => {
        // TripService marks its own failures; this only catches a crash in
        // that handling, which must still free the slot.
        this.logger.error(`Trip job ${item.jobId} crashed`, error as Error);
      })
      .finally(() => {
        this.running.delete(item.jobId);
        void this.pump();
      });
  }

  /**
   * Tells still-queued jobs where they are in line, so a waiting user sees
   * "3rd in queue" rather than a progress bar that looks frozen.
   */
  private async publishQueuePositions() {
    // Capped: this runs on every completion, so annotating an unbounded
    // backlog would make writes grow quadratically with queue depth. Beyond
    // the first few dozen the exact position tells the user nothing anyway.
    await Promise.all(
      this.backlog.slice(0, MAX_ANNOUNCED_POSITIONS).map(async (item, index) => {
        const message = `佇列中，前面還有 ${index + this.running.size} 個任務`;
        this.events.emit({
          jobId: item.jobId,
          status: 'pending',
          progress: 0,
          message,
        });
        try {
          await this.prisma.tripJob.update({
            where: { id: item.jobId },
            data: { message },
          });
        } catch {
          // A deleted job is still in the backlog until it is dequeued;
          // failing to annotate it must not stall the pump.
        }
      }),
    );
  }

  private async resolveLimit(): Promise<number> {
    const limit = await this.settings.getNumber(
      'trip.maxConcurrentJobs',
      tripConfig.maxConcurrentJobs,
    );
    // A zero or negative limit would deadlock the queue permanently.
    return limit >= 1 ? Math.floor(limit) : 1;
  }
}
