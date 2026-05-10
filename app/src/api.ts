const BASE = 'http://localhost:8000';

export interface SessionState {
  matched_condition_id: string | null;
  asked_question_ids: string[];
  urgency: string | null;
}

export interface ChatMeta {
  urgency: string;
  matched_condition_id: string | null;
  escalation_note: string | null;
  next_question_id: string | null;
}

export interface Slide {
  order: number;
  type: 'action' | 'decision' | 'completion';
  layout: string;
  title: string;
  content: string;
  warning?: string;
  tts_text?: string;
  decision?: Record<string, { next_slide: number; label: string }>;
  completion?: { message: string; next_protocol?: string };
}

export interface Protocol {
  id: string;
  title: string;
  source: string;
  slides: Slide[];
}

function ndjsonXhr<T>(
  method: 'GET' | 'POST',
  path: string,
  body: unknown | null,
  onLine: (parsed: T) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${BASE}${path}`, true);
    xhr.setRequestHeader('Content-Type', 'application/json');

    let cursor = 0;

    xhr.onreadystatechange = () => {
      if (xhr.readyState < 3) return;

      const chunk = xhr.responseText.slice(cursor);
      cursor = xhr.responseText.length;

      for (const line of chunk.split('\n')) {
        const t = line.trim();
        if (!t) continue;
        try {
          const parsed: T & { error?: string } = JSON.parse(t);
          if (parsed.error) {
            reject(new Error(parsed.error));
            return;
          }
          onLine(parsed);
        } catch {
          // incomplete line — wait for next chunk
        }
      }

      if (xhr.readyState === 4) resolve();
    };

    xhr.onerror = () => reject(new Error('Network error — is the server running?'));
    xhr.send(body != null ? JSON.stringify(body) : null);
  });
}

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function streamChat(
  message: string,
  sessionState: SessionState,
  history: HistoryMessage[],
  onToken: (token: string) => void,
): Promise<ChatMeta> {
  let meta: ChatMeta = {
    urgency: 'GREEN',
    matched_condition_id: null,
    escalation_note: null,
    next_question_id: null,
  };

  type Chunk = { token: string; done: boolean; urgency?: string; matched_condition_id?: string; escalation_note?: string; next_question_id?: string };

  return ndjsonXhr<Chunk>(
    'POST',
    '/chat',
    { message, session_state: sessionState, history },
    chunk => {
      if (chunk.done) {
        meta = {
          urgency: chunk.urgency ?? 'GREEN',
          matched_condition_id: chunk.matched_condition_id ?? null,
          escalation_note: chunk.escalation_note ?? null,
          next_question_id: chunk.next_question_id ?? null,
        };
      } else if (chunk.token) {
        onToken(chunk.token);
      }
    },
  ).then(() => meta);
}

export async function fetchProtocol(id: string): Promise<Protocol> {
  const res = await fetch(`${BASE}/protocols/${id}`);
  if (!res.ok) throw new Error(`Protocol '${id}' not found (${res.status})`);
  return res.json();
}

export function streamSummary(
  history: Array<{ role: string; content: string }>,
  onToken: (token: string) => void,
): Promise<void> {
  type Chunk = { token: string; done: boolean };
  return ndjsonXhr<Chunk>(
    'POST',
    '/summary',
    { history },
    chunk => { if (chunk.token) onToken(chunk.token); },
  );
}
