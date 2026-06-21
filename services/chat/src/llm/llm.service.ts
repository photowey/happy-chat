import {Injectable} from '@nestjs/common';
import {type BaseMessage, HumanMessage, SystemMessage,} from '@langchain/core/messages';
import {createChatModel} from './model.factory';
import {requirementPrompt} from './requirement.prompt-builder';
import {requirementChain} from './requirement.chain';

@Injectable()
export class LlmService {
  async invokeDemo(input: string): Promise<string> {
    const model = createChatModel();
    const systemMessage = new SystemMessage('你是一名需求结构化抽取助手');
    const humanMessage = new HumanMessage(
      `请从下面文本中抽取 action、constraints、entities：\n${input}`,
    );
    const messages: BaseMessage[] = [systemMessage, humanMessage];
    const response = await model.invoke(messages);
    return response.content.toString();
  }

  async streamDemo(input: string) {
    const model = createChatModel();
    return model.stream([
      new SystemMessage('你是一名需求结构化抽取助手'),
      new HumanMessage(`请逐步分析并输出结构化抽取结果：\n${input}`),
    ]);
  }

  async batchDemo(inputs: string[]) {
    const model = createChatModel();
    const messageGroups = inputs.map((input) => [
      new SystemMessage('你是一名需求结构化抽取助手'),
      new HumanMessage(`请抽取 action、constraints、entities：\n${input}`),
    ]);

    const responses = await model.batch(messageGroups);
    return responses.map((item) => item.content.toString());
  }

  async promptPreview(input: string) {
    const promptValue = await requirementPrompt.invoke({input});
    return {rendered: promptValue.toString()};
  }

  async promptToModel(input: string) {
    const messages = await requirementPrompt.formatMessages({input});
    const model = createChatModel();
    const response = await model.invoke(messages);
    return {result: response.content};
  }

  async chainInvoke(input: string) {
    const result = await requirementChain.invoke({input});
    return {result};
  }

  async chainStream(input: string) {
    return requirementChain.stream({input});
  }

  async chainBatch(inputs: string[]) {
    const results = await requirementChain.batch(
      inputs.map((input) => ({input}))
    );
    return results.map((result, i) => ({index: i + 1, result}));
  }
}
