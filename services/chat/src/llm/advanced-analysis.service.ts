import { Injectable } from '@nestjs/common';
import { OrchestratorService } from './agents/orchestrator.service';
import { FilesystemService } from './filesystem/filesystem.service';
import { RunnableMemoryService } from './memory/runnable-memory.service';

export type AnalyzeResult =
  | { needsClarification: true; questions: string[] }
  | { needsClarification: false; report: string; reportPath: string; usedAgents: string[] };

@Injectable()
export class AdvancedAnalysisService {
  constructor(
    private readonly orchestrator: OrchestratorService,
    private readonly filesystem: FilesystemService,
    private readonly memory: RunnableMemoryService,
  ) {}

  async analyze(sessionId: string, input: string): Promise<AnalyzeResult> {
    const result = await this.orchestrator.orchestrate(input);

    if (result.status === 'need_clarification') {
      return { needsClarification: true, questions: result.clarificationQuestions };
    }

    const report = result.report ?? 'No report generated';
    const reportPath = this.filesystem.writeReport(
      `reports/${sessionId}-${Date.now()}.md`,
      report,
    );
    await this.memory.appendMessage(sessionId, input, report);

    return { needsClarification: false, report, reportPath, usedAgents: result.usedAgents };
  }
}
