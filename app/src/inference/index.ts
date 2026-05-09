// Swap this import to LiteRTClient when migrating to on-device inference.
export { OllamaClient as InferenceClientImpl } from './OllamaClient';

export type { InferenceClient } from './InferenceClient';
export type { GenerateOptions, TokenCallback } from './types';
