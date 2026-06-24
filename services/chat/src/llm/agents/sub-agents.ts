import { StringOutputParser } from '@langchain/core/output_parsers';
import { createChatModel } from '../model.factory';
import {
  extractPrompt,
  clarifyPrompt,
  analysisPrompt,
  riskPrompt,
  summaryPrompt,
} from '../prompts/requirement.prompts';

const model = createChatModel();
const parser = new StringOutputParser();

export const extractAgent = extractPrompt.pipe(model).pipe(parser);
export const clarifyAgent = clarifyPrompt.pipe(model).pipe(parser);
export const analysisAgent = analysisPrompt.pipe(model).pipe(parser);
export const riskAgent = riskPrompt.pipe(model).pipe(parser);
export const summaryAgent = summaryPrompt.pipe(model).pipe(parser);
