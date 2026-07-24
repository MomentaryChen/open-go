import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Sse,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { TripEventsService } from './trip-events.service';
import { TripService } from './trip.service';
import { validateKeyword } from './keyword-validator';
import { normalizePreferences } from './trip-preferences';

type CreateTripDto = {
  keyword?: string;
  forceRefresh?: boolean;
  preferences?: unknown;
};

@Controller('trips')
export class TripController {
  constructor(
    private readonly tripService: TripService,
    private readonly events: TripEventsService,
  ) {}

  @Post()
  async create(@Body() body: CreateTripDto) {
    const check = validateKeyword(body?.keyword);
    if (!check.ok) {
      throw new BadRequestException({ code: check.code, message: check.message });
    }
    const keyword = (body.keyword as string).trim();

    const preferences = normalizePreferences(body?.preferences);
    const { job, cached } = await this.tripService.createJob(
      keyword,
      preferences,
      body?.forceRefresh === true,
    );
    return { jobId: job.id, status: job.status, cached };
  }

  // Declared before `:id` so "gallery" is not captured as a job id.
  @Get('gallery')
  gallery() {
    return this.tripService.listGallery();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.tripService.getJob(id);
  }

  @Get(':id/documents')
  documents(@Param('id') id: string) {
    return this.tripService.listDocuments(id);
  }

  @Sse(':id/stream')
  stream(@Param('id') id: string): Observable<MessageEvent> {
    return this.events
      .stream(id)
      .pipe(map((event) => ({ data: event }) as unknown as MessageEvent));
  }
}
