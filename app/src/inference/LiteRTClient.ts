/**
 * Phase 2: on-device inference via react-native-litert-lm.
 *
 * To activate:
 *   1. pnpm add react-native-litert-lm
 *   2. Download gemma-4-E2B-it-litert-lm.litertlm from
 *      https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm
 *      and add it to app assets.
 *   3. Uncomment the import and implement the body below.
 *   4. Swap the export in index.ts.
 */

// import { createLLM } from 'react-native-litert-lm';
import { InferenceClient } from './InferenceClient';
import { GenerateOptions, TokenCallback } from './types';

export class LiteRTClient implements InferenceClient {
  // private llm: Awaited<ReturnType<typeof createLLM>> | null = null;

  async initialize(): Promise<void> {
    // this.llm = await createLLM();
    // await this.llm.loadModel('<path-to-assets>/gemma-4-E2B-it-litert-lm.litertlm');
    throw new Error('LiteRTClient not yet implemented — use OllamaClient for development');
  }

  async generate(_prompt: string, _options: GenerateOptions, _onToken: TokenCallback): Promise<void> {
    // await this.llm!.sendMessageAsync(_prompt, (token: string, done: boolean) => {
    //   _onToken(token, done);
    // });
    throw new Error('LiteRTClient not yet implemented');
  }
}
