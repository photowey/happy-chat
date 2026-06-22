import { Body, Controller, Get, Post } from '@nestjs/common';
import { AppService } from '@chat/app.service';
import { RequirementService } from '@chat/llm/requirement.service';
import type { RequirementResult } from '@autix/contracts';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly requirementService: RequirementService,
  ) {}

  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }

  @Get('hello')
  getHello() {
    return this.appService.getHello();
  }

  @Post('/requirement/extract')
  async extract(@Body() body: { input: string }): Promise<RequirementResult> {
    return this.requirementService.extract(body.input);
  }
}
