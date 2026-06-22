import { Injectable } from '@nestjs/common';
import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { createChatModel } from './model.factory';
import { requirementPrompt } from './requirement.prompt-builder';
import { requirementChain } from './requirement.chain';
import {
  checkConstraintValidityTool,
  lookupEntityDefinitionTool,
} from './tools/basic.tools';

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
    const promptValue = await requirementPrompt.invoke({ input });
    return { rendered: promptValue.toString() };
  }

  async promptToModel(input: string) {
    const messages = await requirementPrompt.formatMessages({ input });
    const model = createChatModel();
    const response = await model.invoke(messages);
    return { result: response.content };
  }

  async chainInvoke(input: string) {
    const result = await requirementChain.invoke({ input });
    return { result };
  }

  async chainStream(input: string) {
    return requirementChain.stream({ input });
  }

  async chainBatch(inputs: string[]) {
    const results = await requirementChain.batch(
      inputs.map((input) => ({ input })),
    );
    return results.map((result, i) => ({ index: i + 1, result }));
  }

  async toolBindDemo(input: string) {
    const model = createChatModel();
    const modelWithTools = model.bindTools([
      checkConstraintValidityTool,
      lookupEntityDefinitionTool,
    ]);

    const response = await modelWithTools.invoke([
      new SystemMessage('你可以按需要调用工具来校验约束和查询实体定义。'),
      new HumanMessage(`请分析下面需求：${input}`),
    ]);

    return {
      result: response.content.toString(),
      toolCalls: response.tool_calls,
    };
  }

  async toolLoopDemo(input: string) {
    const tools: StructuredToolInterface[] = [
      checkConstraintValidityTool,
      lookupEntityDefinitionTool,
    ];
    const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));
    const model = createChatModel();
    const modelWithTools = model.bindTools(tools);

    const messages: BaseMessage[] = [
      new SystemMessage('你可以调用工具来帮助完成需求抽取后的校验。'),
      new HumanMessage(
        `先抽取 action、constraints、entities，再按需要调用工具：${input}`
      ),
    ];

    const firstResponse = await modelWithTools.invoke(messages);
    messages.push(firstResponse);

    for (const toolCall of firstResponse.tool_calls ?? []) {
      const targetTool = toolMap[toolCall.name];
      if (!targetTool) continue;
      const toolResult = await targetTool.invoke(toolCall.args);
      messages.push(
        new ToolMessage({
          tool_call_id: toolCall.id ?? '',
          content: JSON.stringify(toolResult),
        })
      );
    }

    const finalResponse = await modelWithTools.invoke(messages);
    return { result: finalResponse.content };
  }
}
