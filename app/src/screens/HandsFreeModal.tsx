import {useCallback, useEffect, useRef, useState} from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Voice, {
  SpeechEndEvent,
  SpeechErrorEvent,
  SpeechResultsEvent,
  SpeechStartEvent,
} from '@react-native-voice/voice';
import Tts from 'react-native-tts';
import {streamChat, ChatMeta} from '../api';
import {useAppContext} from '../context';

type HFState = 'LISTENING' | 'THINKING' | 'RESPONDING';

export interface HandsFreeModalProps {
  visible: boolean;
  onClose: () => void;
  onNewMessage?: (userText: string, meta: ChatMeta) => void;
}

const STATE_CORE: Record<HFState, string> = {
  LISTENING: '#c94b30',
  THINKING: '#5a9fb5',
  RESPONDING: '#7da43a',
};
const STATE_RING: Record<HFState, string> = {
  LISTENING: 'rgba(214,67,42,0.55)',
  THINKING: 'rgba(111,177,196,0.45)',
  RESPONDING: 'rgba(127,164,74,0.50)',
};
const STATE_HALO: Record<HFState, string> = {
  LISTENING: 'rgba(214,67,42,0.15)',
  THINKING: 'rgba(111,177,196,0.12)',
  RESPONDING: 'rgba(127,164,74,0.14)',
};
const STATE_VIGNETTE: Record<HFState, string> = {
  LISTENING: 'rgba(214,67,42,0.20)',
  THINKING: 'rgba(111,177,196,0.18)',
  RESPONDING: 'rgba(127,164,74,0.22)',
};
const STATE_LABEL_COLOR: Record<HFState, string> = {
  LISTENING: '#ee8068',
  THINKING: '#93c8d8',
  RESPONDING: '#a4c473',
};
const STATE_LABEL_BASE: Record<HFState, string> = {
  LISTENING: 'Listening',
  THINKING: 'Thinking',
  RESPONDING: 'Speaking',
};

// Pulse: amplitude and speed vary per state
const PULSE_CFG: Record<HFState, {min: number; max: number; ms: number}> = {
  LISTENING: {min: 0.88, max: 1.18, ms: 480},
  THINKING: {min: 0.97, max: 1.03, ms: 850},
  RESPONDING: {min: 0.84, max: 1.22, ms: 360},
};

const SILENCE_MS = 1200;

export default function HandsFreeModal({visible, onClose, onNewMessage}: HandsFreeModalProps) {
  const {
    messages,
    sessionState,
    appendUserMessage,
    startAssistantMessage,
    appendToMessage,
    finalizeMessage,
  } = useAppContext();

  const [hfState, setHfState] = useState<HFState>('LISTENING');
  const [userCaption, setUserCaption] = useState('');
  const [aiCaption, setAiCaption] = useState('');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [dotCount, setDotCount] = useState(1);

  const stateRef = useRef<HFState>('LISTENING');
  const transcriptRef = useRef('');
  const ttsActiveRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesRef = useRef(messages);
  const sessionStateRef = useRef(sessionState);
  const ctxRef = useRef({appendUserMessage, startAssistantMessage, appendToMessage, finalizeMessage, onNewMessage});

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { sessionStateRef.current = sessionState; }, [sessionState]);
  useEffect(() => {
    ctxRef.current = {appendUserMessage, startAssistantMessage, appendToMessage, finalizeMessage, onNewMessage};
  }, [appendUserMessage, startAssistantMessage, appendToMessage, finalizeMessage, onNewMessage]);

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const openAnim = useRef(new Animated.Value(0)).current;

  // Animated dots for state label
  useEffect(() => {
    const timer = setInterval(() => {
      setDotCount(d => (d % 3) + 1);
    }, 500);
    return () => clearInterval(timer);
  }, []);

  const transition = useCallback((next: HFState) => {
    stateRef.current = next;
    setHfState(next);
  }, []);

  // Diagonal zoom open/close — from mic button origin (bottom-right)
  useEffect(() => {
    if (visible) {
      Animated.spring(openAnim, {
        toValue: 1,
        tension: 120,
        friction: 14,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(openAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, openAnim]);

  // Pulse — don't reset to 1 on cleanup so there's no jump when state changes
  useEffect(() => {
    const {min, max, ms} = PULSE_CFG[hfState];
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {toValue: max, duration: ms, useNativeDriver: true}),
        Animated.timing(pulseAnim, {toValue: min, duration: ms, useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [hfState, pulseAnim]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const startListening = useCallback(async () => {
    transcriptRef.current = '';
    try { await Voice.start('en-US'); } catch {}
  }, []);

  const doSubmit = useCallback(async (text: string) => {
    clearSilenceTimer();
    if (!text.trim()) {
      transition('LISTENING');
      await startListening();
      return;
    }

    transition('THINKING');
    setLiveTranscript('');
    setUserCaption(text);
    setAiCaption('');

    const {
      appendUserMessage: addUser,
      startAssistantMessage: startMsg,
      appendToMessage: addToken,
      finalizeMessage: finalize,
      onNewMessage: notify,
    } = ctxRef.current;

    const history = messagesRef.current.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    addUser(text);
    const assistantId = startMsg();

    try {
      const meta = await streamChat(text, sessionStateRef.current, history, token => addToken(assistantId, token));
      finalize(assistantId, meta);
      notify?.(text, meta);

      if (meta.spoken_text) {
        setAiCaption(meta.spoken_text);
        ttsActiveRef.current = true;
        transition('RESPONDING');
        // Voice is deliberately NOT started here — starting the mic before TTS
        // causes an AVAudioSession conflict on iOS that silences the speaker.
        Tts.speak(meta.spoken_text);
      } else {
        transition('LISTENING');
        await startListening();
      }
    } catch {
      transition('LISTENING');
      await startListening();
    }
  }, [transition, startListening, clearSilenceTimer]);

  const doSubmitRef = useRef(doSubmit);
  useEffect(() => { doSubmitRef.current = doSubmit; }, [doSubmit]);

  // Wire Voice + TTS when modal becomes visible; tear down on hide
  useEffect(() => {
    if (!visible) return;

    stateRef.current = 'LISTENING';
    setHfState('LISTENING');
    setUserCaption('');
    setAiCaption('');
    setLiveTranscript('');
    transcriptRef.current = '';
    ttsActiveRef.current = false;

    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      const t = e.value?.[0] ?? '';
      if (t) transcriptRef.current = t;
    };

    Voice.onSpeechPartialResults = (e: SpeechResultsEvent) => {
      const t = e.value?.[0] ?? '';
      if (!t || stateRef.current !== 'LISTENING') return;
      transcriptRef.current = t;
      setLiveTranscript(t);
      if (silenceTimerRef.current !== null) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        silenceTimerRef.current = null;
        if (stateRef.current === 'LISTENING') {
          setLiveTranscript('');
          Voice.stop().catch(() => {});
        }
      }, SILENCE_MS);
    };

    // Barge-in: user speaks while TTS is responding
    Voice.onSpeechStart = (_e: SpeechStartEvent) => {
      if (stateRef.current === 'RESPONDING' && ttsActiveRef.current) {
        Tts.stop().catch(() => {});
        ttsActiveRef.current = false;
        transition('LISTENING');
      }
    };

    Voice.onSpeechEnd = (_e: SpeechEndEvent) => {
      if (silenceTimerRef.current !== null) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (stateRef.current === 'LISTENING') {
        const t = transcriptRef.current.trim();
        if (t) {
          doSubmitRef.current(t);
        } else {
          setTimeout(() => {
            if (stateRef.current === 'LISTENING') Voice.start('en-US').catch(() => {});
          }, 400);
        }
      }
    };

    Voice.onSpeechError = (_e: SpeechErrorEvent) => {
      if (stateRef.current === 'LISTENING') {
        setTimeout(() => {
          if (stateRef.current === 'LISTENING') Voice.start('en-US').catch(() => {});
        }, 600);
      }
    };

    const ttsEndHandler = () => {
      if (!ttsActiveRef.current) return;
      ttsActiveRef.current = false;
      if (stateRef.current === 'RESPONDING') {
        transition('LISTENING');
        Voice.start('en-US').catch(() => {});
      }
    };
    Tts.addEventListener('tts-finish', ttsEndHandler);
    Tts.addEventListener('tts-error', ttsEndHandler);
    Tts.addEventListener('tts-cancel', ttsEndHandler);

    Voice.start('en-US').catch(() => {});

    return () => {
      if (silenceTimerRef.current !== null) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      Voice.stop().catch(() => {});
      Voice.removeAllListeners();
      if (ttsActiveRef.current) {
        Tts.stop().catch(() => {});
        ttsActiveRef.current = false;
      }
      Tts.removeEventListener('tts-finish', ttsEndHandler);
      Tts.removeEventListener('tts-error', ttsEndHandler);
      Tts.removeEventListener('tts-cancel', ttsEndHandler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function handleClose() {
    clearSilenceTimer();
    Voice.stop().catch(() => {});
    if (ttsActiveRef.current) {
      Tts.stop().catch(() => {});
      ttsActiveRef.current = false;
    }
    onClose();
  }

  const userDisplayText =
    hfState === 'LISTENING' && liveTranscript.trim() ? liveTranscript : userCaption;
  const userIsLive = hfState === 'LISTENING' && !!liveTranscript.trim();

  const dots = '.'.repeat(dotCount);

  const openScale = openAnim.interpolate({inputRange: [0, 1], outputRange: [0.4, 1]});
  const openTranslateX = openAnim.interpolate({inputRange: [0, 1], outputRange: [60, 0]});
  const openTranslateY = openAnim.interpolate({inputRange: [0, 1], outputRange: [220, 0]});

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleClose}>
      <Animated.View
        style={[
          styles.overlay,
          {
            transform: [
              {scale: openScale},
              {translateX: openTranslateX},
              {translateY: openTranslateY},
            ],
          },
        ]}>
        {/* State vignette — full-bleed color wash */}
        <View
          style={[StyleSheet.absoluteFill, {backgroundColor: STATE_VIGNETTE[hfState]}]}
          pointerEvents="none"
        />

        {/* Close */}
        <Pressable style={styles.closeBtn} onPress={handleClose} hitSlop={20}>
          <Text style={styles.closeBtnText}>✕</Text>
        </Pressable>

        {/* Captions — flex:1, anchored to bottom of this area */}
        <View style={styles.captionsArea}>
          {userDisplayText ? (
            <View style={styles.userCaptionRow}>
              <Text
                style={[styles.userCaption, userIsLive && styles.userCaptionLive]}
                numberOfLines={3}>
                {userDisplayText}
              </Text>
            </View>
          ) : null}
          {aiCaption ? (
            <View style={styles.aiCaptionRow}>
              <Text style={styles.aiCaption} numberOfLines={4}>
                {aiCaption}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Orb — lower center; tappable to dismiss */}
        <View style={styles.orbSection}>
          <Text style={[styles.stateLabel, {color: STATE_LABEL_COLOR[hfState]}]}>
            {STATE_LABEL_BASE[hfState]}{dots}
          </Text>
          <Pressable onPress={handleClose} hitSlop={24}>
            <View style={styles.orbArea}>
              {/* Halo — outer diffuse glow */}
              <Animated.View
                style={[
                  styles.orbHalo,
                  {backgroundColor: STATE_HALO[hfState], transform: [{scale: pulseAnim}]},
                ]}
              />
              {/* Ring — 1px border circle */}
              <Animated.View
                style={[
                  styles.orbRing,
                  {borderColor: STATE_RING[hfState], transform: [{scale: pulseAnim}]},
                ]}
              />
              {/* Core — solid sphere */}
              <Animated.View
                style={[
                  styles.orbCore,
                  {backgroundColor: STATE_CORE[hfState], transform: [{scale: pulseAnim}]},
                ]}
              />
            </View>
          </Pressable>
        </View>
      </Animated.View>
    </Modal>
  );
}

const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#07080a',
    flexDirection: 'column',
  },

  closeBtn: {
    position: 'absolute',
    top: 56,
    right: 24,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  closeBtnText: {color: 'rgba(255,255,255,0.45)', fontSize: 14, fontWeight: '600'},

  captionsArea: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 108,
    paddingBottom: 20,
    justifyContent: 'flex-end',
    gap: 10,
  },

  userCaptionRow: {alignItems: 'flex-end'},
  userCaption: {
    color: 'rgba(255,255,255,0.90)',
    fontSize: 16,
    lineHeight: 23,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '85%',
    textAlign: 'right',
  },
  userCaptionLive: {
    color: 'rgba(255,255,255,0.45)',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },

  aiCaptionRow: {alignItems: 'flex-start'},
  aiCaption: {
    color: '#a4c473',
    fontSize: 15,
    lineHeight: 22,
    backgroundColor: 'rgba(127,164,74,0.10)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '90%',
  },

  orbSection: {
    alignItems: 'center',
    paddingBottom: 72,
    gap: 20,
  },
  stateLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    fontFamily: MONO,
  },

  orbArea: {
    width: 220,
    height: 220,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbHalo: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
  },
  orbRing: {
    position: 'absolute',
    width: 156,
    height: 156,
    borderRadius: 78,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  orbCore: {
    position: 'absolute',
    width: 92,
    height: 92,
    borderRadius: 46,
  },
});
