import { Injectable } from '@nestjs/common';
import {
  extractAgent,
  clarifyAgent,
  analysisAgent,
  riskAgent,
  summaryAgent,
} from './sub-agents';

function parseJsonLoose(raw: string): any {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

@Injectable()
export class OrchestratorService {
  async orchestrate(input: string) {
    try {
      const extractResult = await extractAgent.invoke({ input });

      const clarifyRaw = await clarifyAgent.invoke({ extractResult, input });
      let clarificationQuestions: string[] = [];
      try {
        const clarify = parseJsonLoose(clarifyRaw);
        if (clarify?.needsClarification && Array.isArray(clarify.questions)) {
          clarificationQuestions = clarify.questions;
        }
      } catch {
        // clarify parse failure, continue as no clarification needed
      }

      if (clarificationQuestions.length > 0) {
        return {
          mode: 'fixed_workflow',
          status: 'need_clarification',
          clarificationQuestions,
          usedAgents: ['extractAgent', 'clarifyAgent'],
          fallback: 'ask_user',
        };
      }

      const [analysisResult, riskResult] = await Promise.all([
        analysisAgent.invoke({ extractResult, input }),
        riskAgent.invoke({ extractResult, input }),
      ]);

      const report = await summaryAgent.invoke({
        input,
        extractResult,
        analysisResult,
        riskResult,
        retrievedContext: 'No reference documents available',
      });

      return {
        mode: 'fixed_workflow',
        status: 'completed',
        clarificationQuestions: [],
        usedAgents: [
          'extractAgent',
          'clarifyAgent',
          'analysisAgent',
          'riskAgent',
          'summaryAgent',
        ],
        fallback: null,
        steps: { extract: extractResult, analysis: analysisResult, risk: riskResult },
        report,
      };
    } catch (error) {
      return {
        mode: 'fixed_workflow',
        status: 'failed',
        clarificationQuestions: [],
        usedAgents: ['extractAgent'],
        fallback: 'manual_review',
        report: 'Analysis failed, please escalate to manual review.',
        error: String(error),
      };
    }
  }
}
