import { InferenceClient } from './InferenceClient';
import { GenerateOptions, TokenCallback } from './types';

// Update this to your Mac's LAN IP when testing on a physical device.
// On the simulator, localhost works fine.
const SERVER_URL = 'http://localhost:8000';

export class OllamaClient implements InferenceClient {
  async initialize(): Promise<void> {
    const res = await fetch(`${SERVER_URL}/health`);
    if (!res.ok) {
      throw new Error(`Inference server not reachable (${res.status})`);
    }
  }

  generate(prompt: string, options: GenerateOptions, onToken: TokenCallback): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${SERVER_URL}/generate`, true);
      xhr.setRequestHeader('Content-Type', 'application/json');

      let cursor = 0;

      xhr.onreadystatechange = () => {
        // readyState 3 = LOADING (streaming chunks arriving)
        // readyState 4 = DONE
        if (xhr.readyState < 3) return;

        const text = xhr.responseText;
        const newChunk = text.slice(cursor);
        cursor = text.length;

        const lines = newChunk.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const parsed: { token: string; done: boolean; error?: string } = JSON.parse(trimmed);
            if (parsed.error) {
              reject(new Error(parsed.error));
              return;
            }
            onToken(parsed.token, parsed.done);
            if (parsed.done) {
              resolve();
              return;
            }
          } catch {
            // incomplete JSON line — wait for next chunk
          }
        }

        if (xhr.readyState === 4) {
          resolve();
        }
      };

      xhr.onerror = () => reject(new Error('Network error reaching inference server'));

      xhr.send(
        JSON.stringify({
          prompt,
          system: options.system ?? '',
        }),
      );
    });
  }
}
