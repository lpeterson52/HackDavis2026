import { GenerateOptions, TokenCallback } from './types';

export interface InferenceClient {
  initialize(): Promise<void>;
  generate(prompt: string, options: GenerateOptions, onToken: TokenCallback): Promise<void>;
}
