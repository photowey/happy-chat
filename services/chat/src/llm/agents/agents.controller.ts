import { Controller, Post, Body } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service';

@Controller('api/agents')
export class AgentsController {
  constructor(private readonly orchestratorService: OrchestratorService) {}

  @Post('orchestrate')
  async orchestrate(@Body() body: { input: string }) {
    return this.orchestratorService.orchestrate(body.input);
  }
}
