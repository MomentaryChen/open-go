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

type CreateTripDto = { keyword?: string; forceRefresh?: boolean };

@Controller('trips')
export class TripController {
  constructor(
    private readonly tripService: TripService,
    private readonly events: TripEventsService,
  ) {}

  @Post()
  async create(@Body() body: CreateTripDto) {
    const keyword = body?.keyword?.trim();
    if (!keyword) {
      throw new BadRequestException('keyword is required');
    }
    if (keyword.length > 200) {
      throw new BadRequestException('keyword must be 200 characters or fewer');
    }

    const { job, cached } = await this.tripService.createJob(
      keyword,
      body?.forceRefresh === true,
    );
    return { jobId: job.id, status: job.status, cached };
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
