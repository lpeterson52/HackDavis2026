import React, {useRef, useState} from 'react';
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
import Tts from 'react-native-tts';
import {streamChat} from '../api';
import {ChatMessage, useAppContext} from '../context';
import HandsFreeModal from './HandsFreeModal';

const URGENCY_COLOR: Record<string, string> = {
  RED: '#d6432a',
  ORANGE: '#c46b1e',
  YELLOW: '#a88a2a',
  GREEN: '#5a843a',
};

const URGENCY_LABEL: Record<string, string> = {
  RED: 'EMERGENCY',
  ORANGE: 'URGENT',
  YELLOW: 'MONITOR',
  GREEN: 'STABLE',
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
  const [handsFreeVisible, setHandsFreeVisible] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;

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
        Tts.speak(meta.spoken_text);
      }
    } catch (e: any) {
      appendToMessage(assistantId, `_Error: ${e.message}_`);
    } finally {
      setStreaming(false);
      scrollRef.current?.scrollToEnd({animated: false});
    }
  }

  const urgencyColor = currentUrgency ? URGENCY_COLOR[currentUrgency] : null;

  return (
    <KeyboardAvoidingView
      style={[styles.root, urgencyColor ? {borderColor: urgencyColor} : null]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.brand}>
          <View style={styles.crossMark}>
            <View style={styles.crossH} />
            <View style={styles.crossV} />
          </View>
          <View>
            <Text style={styles.brandName}>MedField</Text>
            <Text style={styles.brandSub}>Wilderness Triage</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          {currentUrgency && urgencyColor && (
            <View style={[styles.urgencyPill, {borderColor: urgencyColor}]}>
              <View style={[styles.urgencyDot, {backgroundColor: urgencyColor}]} />
              <Text style={[styles.urgencyPillText, {color: urgencyColor}]}>
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

      {/* Urgency border accent */}
      {urgencyColor && (
        <View style={[styles.urgencyBorder, {backgroundColor: urgencyColor}]} />
      )}

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
          AI guidance only — not a substitute for professional medical care
        </Text>
      </View>

      {/* Input row */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Describe what happened…"
          placeholderTextColor="#4a4a52"
          multiline
          editable={!streaming}
          onSubmitEditing={send}
        />
        {/* Hands-free mic — primary CTA */}
        <Pressable
          style={[styles.micBtn, streaming && styles.micBtnDisabled]}
          onPress={() => setHandsFreeVisible(true)}
          disabled={streaming}>
          <Text style={styles.micBtnText}>🎙️</Text>
        </Pressable>
        <Pressable
          style={[styles.sendBtn, (streaming || !input.trim()) && styles.sendBtnDisabled]}
          onPress={send}
          disabled={streaming || !input.trim()}>
          {streaming ? (
            <ActivityIndicator color="#e8e2d4" size="small" />
          ) : (
            <Text style={styles.sendBtnText}>SEND</Text>
          )}
        </Pressable>
      </View>

      <HandsFreeModal
        visible={handsFreeVisible}
        onClose={() => setHandsFreeVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyIcon}>✚</Text>
      <Text style={styles.emptyTitle}>Take a breath.</Text>
      <Text style={styles.emptyTitle}>Tell me what happened.</Text>
      <Text style={styles.emptyBody}>
        Describe the patient's condition and I'll help you assess and respond.
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
      {urgencyColor && message.urgency && (
        <View style={[styles.urgencyTag, {borderColor: urgencyColor}]}>
          <View style={[styles.urgencyTagDot, {backgroundColor: urgencyColor}]} />
          <Text style={[styles.urgencyTagText, {color: urgencyColor}]}>
            {URGENCY_LABEL[message.urgency] ?? message.urgency}
          </Text>
        </View>
      )}
      <View style={styles.assistantBubble}>
        {isEmpty ? (
          <ActivityIndicator size="small" color="#5a5a62" />
        ) : (
          <Markdown style={mdStyles}>{message.content}</Markdown>
        )}
      </View>
    </View>
  );
}

const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0d0e11',
    paddingTop: 45,
    borderWidth: 0,
    borderColor: 'transparent',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1e1f24',
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  crossMark: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crossH: {
    position: 'absolute',
    width: 20,
    height: 7,
    backgroundColor: '#c94b30',
    borderRadius: 2,
  },
  crossV: {
    position: 'absolute',
    width: 7,
    height: 20,
    backgroundColor: '#c94b30',
    borderRadius: 2,
  },
  brandName: {
    color: '#e8e2d4',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  brandSub: {
    color: '#5a5a62',
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    fontFamily: MONO,
  },

  headerRight: {flexDirection: 'row', alignItems: 'center', gap: 8},

  urgencyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  urgencyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  urgencyPillText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    fontFamily: MONO,
  },

  newBtn: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#2a2a32',
  },
  newBtnText: {color: '#5a5a62', fontSize: 12, fontFamily: MONO},

  // Thin urgency accent line under header
  urgencyBorder: {
    height: 2,
    opacity: 0.6,
  },

  scroll: {flex: 1},
  scrollContent: {padding: 16, paddingBottom: 8, flexGrow: 1},

  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 36,
    color: '#c94b30',
    marginBottom: 20,
  },
  emptyTitle: {
    color: '#e8e2d4',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 30,
    textAlign: 'center',
  },
  emptyBody: {
    color: '#5a5a62',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 12,
    marginBottom: 28,
  },
  exampleWrap: {width: '100%', gap: 8},
  exampleChip: {
    backgroundColor: '#13141a',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#1e1f24',
  },
  exampleText: {color: '#5a5a62', fontSize: 13, lineHeight: 18},

  userRow: {alignItems: 'flex-end', marginBottom: 12},
  userBubble: {
    backgroundColor: '#2a1a12',
    borderWidth: 1,
    borderColor: '#4a2a1a',
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '80%',
  },
  userText: {color: '#e8c8a8', fontSize: 15, lineHeight: 21},

  assistantRow: {marginBottom: 16},
  urgencyTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  urgencyTagDot: {width: 5, height: 5, borderRadius: 2.5},
  urgencyTagText: {fontSize: 10, fontWeight: '700', letterSpacing: 0.8, fontFamily: MONO},

  assistantBubble: {
    backgroundColor: '#13141a',
    borderRadius: 16,
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#1e1f24',
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 36,
    justifyContent: 'center',
  },

  disclaimer: {
    backgroundColor: '#0d0e11',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1e1f24',
  },
  disclaimerText: {color: '#333340', fontSize: 11, textAlign: 'center', fontFamily: MONO},

  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#1e1f24',
    backgroundColor: '#0d0e11',
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    backgroundColor: '#13141a',
    color: '#e8e2d4',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#1e1f24',
  },

  // Orange gradient mic — primary action
  micBtn: {
    backgroundColor: '#c94b30',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 46,
  },
  micBtnDisabled: {opacity: 0.35},
  micBtnText: {fontSize: 18},

  sendBtn: {
    backgroundColor: '#1e1f24',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 66,
    borderWidth: 1,
    borderColor: '#2a2a32',
  },
  sendBtnDisabled: {opacity: 0.35},
  sendBtnText: {
    color: '#e8e2d4',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 1.2,
    fontFamily: MONO,
  },

});

const mdStyles = StyleSheet.create({
  body: {color: '#c8c2b4', fontSize: 15, lineHeight: 23},
  heading1: {color: '#e8e2d4', fontSize: 19, fontWeight: '700', marginVertical: 6},
  heading2: {color: '#e8e2d4', fontSize: 16, fontWeight: '700', marginVertical: 4},
  strong: {color: '#e8e2d4', fontWeight: '700'},
  em: {fontStyle: 'italic', color: '#8a8478'},
  bullet_list: {marginVertical: 4},
  ordered_list: {marginVertical: 4},
  list_item: {marginVertical: 2, color: '#c8c2b4'},
  hr: {backgroundColor: '#1e1f24', height: 1, marginVertical: 10},
  blockquote: {
    backgroundColor: '#0d0e11',
    borderLeftColor: '#d6432a',
    borderLeftWidth: 3,
    paddingLeft: 12,
    marginVertical: 4,
  },
  code_inline: {
    backgroundColor: '#1e1f24',
    color: '#a4c473',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
    borderRadius: 4,
  },
  fence: {
    backgroundColor: '#1e1f24',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
    color: '#a4c473',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 13,
  },
  link: {color: '#93c8d8'},
});
