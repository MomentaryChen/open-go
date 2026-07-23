import { Controller, Get, Param, Query } from '@nestjs/common';
import { RegionsService } from './regions.service';

@Controller('regions')
export class RegionsController {
  constructor(private readonly regionsService: RegionsService) {}

  @Get('search')
  search(@Query('q') query?: string) {
    return this.regionsService.search(query);
  }

  @Get(':id/pois')
  listPois(@Param('id') regionId: string) {
    return this.regionsService.listPois(regionId);
  }

  @Get(':id/recommendations')
  listRecommendations(@Param('id') regionId: string) {
    return this.regionsService.listRecommendations(regionId);
  }

  @Get(':id/categories')
  listCategoryStats(@Param('id') regionId: string) {
    return this.regionsService.listCategoryStats(regionId);
  }
}
