import React, {createContext, ReactNode, useCallback, useContext, useState} from 'react';
import {ChatMeta, SessionState} from './api';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  urgency?: string;
}

export interface VitalEntry {
  id: string;
  time: string;
  note: string;
}

interface AppContextValue {
  messages: ChatMessage[];
  sessionState: SessionState;
  currentUrgency: string | null;
  appendUserMessage: (text: string) => void;
  startAssistantMessage: () => string;
  appendToMessage: (id: string, token: string) => void;
  finalizeMessage: (id: string, meta: ChatMeta) => void;
  clearSession: () => void;
  vitals: VitalEntry[];
  addVital: (note: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const EMPTY_SESSION: SessionState = {
  matched_condition_id: null,
  asked_question_ids: [],
  urgency: null,
  facts: {},
  symptoms: [],
  called_911: false,
};

export function AppProvider({children}: {children: ReactNode}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionState, setSessionState] = useState<SessionState>(EMPTY_SESSION);
  const [currentUrgency, setCurrentUrgency] = useState<string | null>(null);
  const [vitals, setVitals] = useState<VitalEntry[]>([]);

  const appendUserMessage = useCallback((text: string) => {
    setMessages(prev => [
      ...prev,
      {id: `u_${Date.now()}`, role: 'user', content: text},
    ]);
  }, []);

  const startAssistantMessage = useCallback(() => {
    const id = `a_${Date.now()}`;
    setMessages(prev => [...prev, {id, role: 'assistant', content: ''}]);
    return id;
  }, []);

  const appendToMessage = useCallback((id: string, token: string) => {
    setMessages(prev =>
      prev.map(m => (m.id === id ? {...m, content: m.content + token} : m)),
    );
  }, []);

  const finalizeMessage = useCallback((id: string, meta: ChatMeta) => {
    setMessages(prev =>
      prev.map(m => (m.id === id ? {...m, urgency: meta.urgency} : m)),
    );
    setCurrentUrgency(meta.urgency);
    setSessionState(prev => ({
      matched_condition_id:
        meta.matched_condition_id ?? prev.matched_condition_id,
      asked_question_ids: meta.next_question_id
        ? [...prev.asked_question_ids, meta.next_question_id]
        : prev.asked_question_ids,
      urgency: meta.urgency,
      facts: meta.new_facts ? {...prev.facts, ...meta.new_facts} : prev.facts,
      symptoms: meta.symptoms ?? prev.symptoms,
      called_911: meta.called_911 ?? prev.called_911,
    }));
  }, []);

  const clearSession = useCallback(() => {
    setMessages([]);
    setSessionState(EMPTY_SESSION);
    setCurrentUrgency(null);
  }, []);

  const addVital = useCallback((note: string) => {
    const now = new Date();
    const time = now.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    setVitals(prev => [...prev, {id: `v_${Date.now()}`, time, note}]);
  }, []);

  return (
    <AppContext.Provider
      value={{
        messages,
        sessionState,
        currentUrgency,
        appendUserMessage,
        startAssistantMessage,
        appendToMessage,
        finalizeMessage,
        clearSession,
        vitals,
        addVital,
      }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be inside AppProvider');
  return ctx;
}
