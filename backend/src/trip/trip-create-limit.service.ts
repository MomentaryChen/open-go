import { Injectable } from '@nestjs/common';
import { tripConfig } from './trip.config';
import { consumeCreateSlot, CreateLimitDecision } from './trip-create-limit';

/** Process-wide store for {@link consumeCreateSlot}. */
@Injectable()
export class TripCreateLimitService {
  private readonly hits = new Map<string, number[]>();

  consume(key: string): CreateLimitDecision {
    return consumeCreateSlot(this.hits, key, Date.now(), {
      publicCreate: tripConfig.publicCreate,
      limit: tripConfig.createLimit,
      windowMs: tripConfig.createWindowMs,
    });
  }
}
