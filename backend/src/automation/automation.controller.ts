import { Body, Controller, Post } from '@nestjs/common';
import { AutomationService } from './automation.service';

type DiscoverRegionBody = {
  query: string;
  countryCode?: string;
};

@Controller('automation')
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  @Post('discover-region')
  discoverRegion(@Body() body: DiscoverRegionBody) {
    return this.automationService.discoverRegionNow(body.query, body.countryCode);
  }
}
