import {ChatOpenAI} from '@langchain/openai';
import {getApiKeys, loadLangChainConfig,} from '@chat/config/load-langchain-config';

export function createChatModel(overrides?: {
  temperature?: number;
  maxTokens?: number;
}): ChatOpenAI {
  const config = loadLangChainConfig();
  const {openaiApiKey, openaiBaseUrl, openaiModel} = getApiKeys();

  return new ChatOpenAI({
    model: openaiModel,
    temperature: overrides?.temperature ?? config.llm.temperature,
    maxTokens: overrides?.maxTokens ?? config.llm.maxTokens,
    apiKey: openaiApiKey,
    useResponsesApi: false,
    configuration: {
      baseURL: openaiBaseUrl,
    },
  });
}
