import React, {useEffect, useRef, useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import Voice, {
  SpeechErrorEvent,
  SpeechResultsEvent,
} from '@react-native-voice/voice';
import Tts from 'react-native-tts';
import {streamChat} from '../api';
import {ChatMessage, useAppContext} from '../context';

const URGENCY_COLOR: Record<string, string> = {
  RED: '#f44336',
  ORANGE: '#ff9800',
  YELLOW: '#ffc107',
  GREEN: '#4caf50',
};

const URGENCY_LABEL: Record<string, string> = {
  RED: '🚨 EMERGENCY',
  ORANGE: '⚠️ URGENT',
  YELLOW: '⚡ MONITOR',
  GREEN: '✓ OK',
};

export default function ChatScreen() {
  const {
    messages,
    sessionState,
    currentUrgency,
    appendUserMessage,
    startAssistantMessage,
    appendToMessage,
    finalizeMessage,
    clearSession,
  } = useAppContext();

  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const sendRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      const transcript = e.value?.[0] ?? '';
      if (transcript) {
        setInput(transcript);
      }
    };
    Voice.onSpeechEnd = () => {
      setIsListening(false);
      sendRef.current?.();
    };
    Voice.onSpeechError = (e: SpeechErrorEvent) => {
      setIsListening(false);
      setVoiceError(e.error?.message ?? 'Voice recognition failed');
    };
    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  async function toggleListening() {
    if (isListening) {
      await Voice.stop();
      setIsListening(false);
    } else {
      setVoiceError(null);
      try {
        await Voice.start('en-US');
        setIsListening(true);
      } catch {
        setVoiceError('Microphone unavailable — type instead');
      }
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;

    // Capture history BEFORE appending the new messages so the backend
    // receives all completed prior turns, not the in-progress ones.
    const history = messages.map(m => ({role: m.role as 'user' | 'assistant', content: m.content}));

    setInput('');
    setStreaming(true);
    appendUserMessage(text);
    const assistantId = startAssistantMessage();

    try {
      const meta = await streamChat(text, sessionState, history, token => {
        appendToMessage(assistantId, token);
        scrollRef.current?.scrollToEnd({animated: false});
      });
      finalizeMessage(assistantId, meta);
      if (meta.spoken_text) {
        Tts.stop(false);
        Tts.speak(meta.spoken_text);
      }
    } catch (e: any) {
      appendToMessage(assistantId, `_Error: ${e.message}_`);
    } finally {
      setStreaming(false);
      scrollRef.current?.scrollToEnd({animated: false});
    }
  }

  sendRef.current = send;

  const urgencyColor = currentUrgency ? URGENCY_COLOR[currentUrgency] : null;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Header */}
      <View style={[styles.header, urgencyColor ? {borderBottomColor: urgencyColor} : null]}>
        <Text style={styles.title}>MedField</Text>
        <View style={styles.headerRight}>
          {currentUrgency && (
            <View
              style={[
                styles.urgencyBadge,
                {backgroundColor: urgencyColor ?? '#666'},
              ]}>
              <Text style={styles.urgencyText}>
                {URGENCY_LABEL[currentUrgency] ?? currentUrgency}
              </Text>
            </View>
          )}
          {messages.length > 0 && !streaming && (
            <Pressable style={styles.newBtn} onPress={clearSession}>
              <Text style={styles.newBtnText}>New</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Message list */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled">
        {messages.length === 0 ? (
          <EmptyState />
        ) : (
          messages.map(msg => <MessageBubble key={msg.id} message={msg} />)
        )}
      </ScrollView>

      {/* Disclaimer */}
      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>
          ⚠️ AI guidance only — not a substitute for professional medical care
        </Text>
      </View>

      {/* Voice error banner */}
      {voiceError && (
        <View style={styles.voiceErrorBanner}>
          <Text style={styles.voiceErrorText}>{voiceError}</Text>
        </View>
      )}

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Describe symptoms…"
          placeholderTextColor="#555"
          multiline
          editable={!streaming}
          blurOnSubmit={false}
          onSubmitEditing={send}
        />
        <Pressable
          style={[styles.micBtn, isListening && styles.micBtnActive, streaming && styles.micBtnDisabled]}
          onPress={toggleListening}
          disabled={streaming}>
          <Text style={styles.micBtnText}>{isListening ? '🔴' : '🎙️'}</Text>
        </Pressable>
        <Pressable
          style={[styles.sendBtn, (streaming || !input.trim()) && styles.sendBtnDisabled]}
          onPress={send}
          disabled={streaming || !input.trim()}>
          {streaming ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.sendBtnText}>Send</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyIcon}>🏕️</Text>
      <Text style={styles.emptyTitle}>Wilderness First Aid</Text>
      <Text style={styles.emptyBody}>
        Describe the patient's symptoms and I'll help you assess and respond.
      </Text>
      <View style={styles.exampleWrap}>
        {[
          'My friend is bleeding heavily from her leg',
          'He collapsed and is not breathing',
          'She was stung by a bee and her throat is swelling',
        ].map(ex => (
          <View key={ex} style={styles.exampleChip}>
            <Text style={styles.exampleText}>{ex}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function MessageBubble({message}: {message: ChatMessage}) {
  if (message.role === 'user') {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{message.content}</Text>
        </View>
      </View>
    );
  }

  const urgencyColor = message.urgency ? URGENCY_COLOR[message.urgency] : null;
  const isEmpty = !message.content;

  return (
    <View style={styles.assistantRow}>
      {urgencyColor && (
        <View style={[styles.urgencyStrip, {backgroundColor: urgencyColor}]}>
          <Text style={styles.urgencyStripText}>
            {URGENCY_LABEL[message.urgency!] ?? message.urgency}
          </Text>
        </View>
      )}
      <View style={styles.assistantBubble}>
        {isEmpty ? (
          <ActivityIndicator size="small" color="#555" />
        ) : (
          <Markdown style={mdStyles}>{message.content}</Markdown>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0f0f0f', paddingTop: 45},

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: '#2a2a2a',
  },
  title: {color: '#fff', fontSize: 18, fontWeight: '700'},
  headerRight: {flexDirection: 'row', alignItems: 'center', gap: 8},

  urgencyBadge: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  urgencyText: {color: '#fff', fontSize: 12, fontWeight: '700'},

  newBtn: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#444',
  },
  newBtnText: {color: '#888', fontSize: 12},

  scroll: {flex: 1},
  scrollContent: {padding: 16, paddingBottom: 8, flexGrow: 1},

  emptyWrap: {flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 40},
  emptyIcon: {fontSize: 48, marginBottom: 16},
  emptyTitle: {color: '#fff', fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center'},
  emptyBody: {color: '#888', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 24},
  exampleWrap: {width: '100%', gap: 8},
  exampleChip: {backgroundColor: '#1a1a1a', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#2a2a2a'},
  exampleText: {color: '#aaa', fontSize: 14},

  userRow: {alignItems: 'flex-end', marginBottom: 12},
  userBubble: {
    backgroundColor: '#1565c0',
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '80%',
  },
  userText: {color: '#fff', fontSize: 15, lineHeight: 21},

  assistantRow: {marginBottom: 16},
  urgencyStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  urgencyStripText: {color: '#fff', fontSize: 11, fontWeight: '700'},
  assistantBubble: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    borderTopLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 36,
    justifyContent: 'center',
  },

  disclaimer: {
    backgroundColor: '#111',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2a2a2a',
  },
  disclaimerText: {color: '#555', fontSize: 11, textAlign: 'center'},

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2a2a2a',
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    backgroundColor: '#1a1a1a',
    color: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  sendBtn: {
    backgroundColor: '#1565c0',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 11,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 66,
  },
  sendBtnDisabled: {backgroundColor: '#1a2a3a'},
  sendBtnText: {color: '#fff', fontWeight: '700', fontSize: 15},

  micBtn: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a2a2a',
    minWidth: 46,
  },
  micBtnActive: {borderColor: '#f44336', backgroundColor: '#2a0a0a'},
  micBtnDisabled: {opacity: 0.4},
  micBtnText: {fontSize: 18},

  voiceErrorBanner: {
    backgroundColor: '#2a1500',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#3a2000',
  },
  voiceErrorText: {color: '#ff9800', fontSize: 12, textAlign: 'center'},
});

const mdStyles = StyleSheet.create({
  body: {color: '#ddd', fontSize: 15, lineHeight: 23},
  heading1: {color: '#fff', fontSize: 20, fontWeight: '700', marginVertical: 6},
  heading2: {color: '#fff', fontSize: 17, fontWeight: '700', marginVertical: 4},
  strong: {color: '#fff', fontWeight: '700'},
  em: {fontStyle: 'italic', color: '#bbb'},
  bullet_list: {marginVertical: 4},
  ordered_list: {marginVertical: 4},
  list_item: {marginVertical: 2, color: '#ddd'},
  hr: {backgroundColor: '#333', height: 1, marginVertical: 10},
  blockquote: {
    backgroundColor: '#111',
    borderLeftColor: '#f44336',
    borderLeftWidth: 3,
    paddingLeft: 12,
    marginVertical: 4,
  },
  code_inline: {
    backgroundColor: '#252525',
    color: '#ce9178',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    borderRadius: 4,
  },
  fence: {
    backgroundColor: '#252525',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
    color: '#ce9178',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
  },
  link: {color: '#64b5f6'},
});
