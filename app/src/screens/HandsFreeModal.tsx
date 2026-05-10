import {useCallback, useEffect, useRef, useState} from 'react';
import {
  Animated,
  Modal,
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

const ORB_COLOR: Record<HFState, string> = {
  LISTENING: '#ef5350',
  THINKING: '#1565c0',
  RESPONDING: '#43a047',
};

const ORB_GLOW: Record<HFState, string> = {
  LISTENING: '#ef535044',
  THINKING: '#1565c022',
  RESPONDING: '#43a04733',
};

const STATE_LABEL: Record<HFState, string> = {
  LISTENING: 'Listening…',
  THINKING: 'Thinking…',
  RESPONDING: 'Responding…',
};

// Pulse: amplitude and speed vary per state
const PULSE_CFG: Record<HFState, {min: number; max: number; ms: number}> = {
  LISTENING: {min: 0.88, max: 1.18, ms: 480},
  THINKING: {min: 0.97, max: 1.03, ms: 850},
  RESPONDING: {min: 0.84, max: 1.22, ms: 360},
};

const SILENCE_MS = 1200;

export default function HandsFreeModal({
  visible,
  onClose,
  onNewMessage,
}: HandsFreeModalProps) {
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
  // Live transcript updates in real-time as the user speaks
  const [liveTranscript, setLiveTranscript] = useState('');

  // Refs — survive re-renders in event handlers without stale closures
  const stateRef = useRef<HFState>('LISTENING');
  const transcriptRef = useRef('');
  const ttsActiveRef = useRef(false);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesRef = useRef(messages);
  const sessionStateRef = useRef(sessionState);
  const ctxRef = useRef({
    appendUserMessage,
    startAssistantMessage,
    appendToMessage,
    finalizeMessage,
    onNewMessage,
  });

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { sessionStateRef.current = sessionState; }, [sessionState]);
  useEffect(() => {
    ctxRef.current = {appendUserMessage, startAssistantMessage, appendToMessage, finalizeMessage, onNewMessage};
  }, [appendUserMessage, startAssistantMessage, appendToMessage, finalizeMessage, onNewMessage]);

  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const captionOpacity = useRef(new Animated.Value(1)).current;

  const transition = useCallback((next: HFState) => {
    stateRef.current = next;
    setHfState(next);
  }, []);

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

  // Fade confirmed captions out on THINKING (exchange boundary), in otherwise
  useEffect(() => {
    Animated.timing(captionOpacity, {
      toValue: hfState === 'THINKING' ? 0 : 1,
      duration: hfState === 'THINKING' ? 200 : 350,
      useNativeDriver: true,
    }).start();
  }, [hfState, captionOpacity]);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const startListening = useCallback(async () => {
    transcriptRef.current = '';
    try {
      await Voice.start('en-US');
    } catch {}
  }, []);

  // Mirrors ChatScreen's send() — called when the user's speech is finalised
  const doSubmit = useCallback(
    async (text: string) => {
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

      // Snapshot history before appending the new user message
      const history = messagesRef.current.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

      addUser(text);
      const assistantId = startMsg();

      try {
        const meta = await streamChat(
          text,
          sessionStateRef.current,
          history,
          token => addToken(assistantId, token),
        );
        finalize(assistantId, meta);
        notify?.(text, meta);

        if (meta.spoken_text) {
          setAiCaption(meta.spoken_text);
          ttsActiveRef.current = true;
          transition('RESPONDING');
          // Voice is deliberately NOT started here — starting the mic before TTS
          // causes an AVAudioSession conflict on iOS that silences the speaker.
          // tts-finish (or tts-error) starts the next listening cycle instead.
          Tts.speak(meta.spoken_text);
        } else {
          transition('LISTENING');
          await startListening();
        }
      } catch {
        transition('LISTENING');
        await startListening();
      }
    },
    [transition, startListening, clearSilenceTimer],
  );

  // Stable ref so the Voice event handlers (registered once) always call latest doSubmit
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

    // Final results — update transcript ref (used by onSpeechEnd to submit)
    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      const t = e.value?.[0] ?? '';
      if (t) transcriptRef.current = t;
    };

    // Partial results — live transcription + 1.2 s silence detection
    Voice.onSpeechPartialResults = (e: SpeechResultsEvent) => {
      const t = e.value?.[0] ?? '';
      if (!t || stateRef.current !== 'LISTENING') return;

      transcriptRef.current = t;
      setLiveTranscript(t);

      // Reset the silence timer on every new word batch
      if (silenceTimerRef.current !== null) clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = setTimeout(() => {
        silenceTimerRef.current = null;
        if (stateRef.current === 'LISTENING') {
          // Clear live caption immediately so UI feels responsive
          setLiveTranscript('');
          // Soft-stop triggers onSpeechResults (final) then onSpeechEnd → submit
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

    // Speech session ended — submit whatever transcript was captured
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
          // Empty session (silence timeout, no speech) — restart
          setTimeout(() => {
            if (stateRef.current === 'LISTENING') Voice.start('en-US').catch(() => {});
          }, 400);
        }
      }
    };

    Voice.onSpeechError = (_e: SpeechErrorEvent) => {
      // iOS fires spurious errors; retry after a brief pause
      if (stateRef.current === 'LISTENING') {
        setTimeout(() => {
          if (stateRef.current === 'LISTENING') Voice.start('en-US').catch(() => {});
        }, 600);
      }
    };

    // Single handler for all TTS end conditions — finish, error, cancel
    const ttsEndHandler = () => {
      if (!ttsActiveRef.current) return; // guard: only handle once per speak()
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

  const orbColor = ORB_COLOR[hfState];
  const orbGlow = ORB_GLOW[hfState];

  // While the user is actively speaking show the live transcript in the user slot;
  // outside of LISTENING (THINKING / RESPONDING) show the confirmed caption
  const userDisplayText =
    hfState === 'LISTENING' && liveTranscript.trim()
      ? liveTranscript
      : userCaption;
  const userIsLive = hfState === 'LISTENING' && !!liveTranscript.trim();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleClose}>
      <View style={styles.overlay}>
        {/* Close */}
        <Pressable style={styles.closeBtn} onPress={handleClose} hitSlop={20}>
          <Text style={styles.closeBtnText}>✕</Text>
        </Pressable>

        {/* Captions — flex: 1, anchored to bottom of this area */}
        <Animated.View style={[styles.captionsArea, {opacity: captionOpacity}]}>
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
        </Animated.View>

        {/* Orb — lower center; tappable to dismiss */}
        <View style={styles.orbSection}>
          <Text style={styles.stateLabel}>{STATE_LABEL[hfState]}</Text>
          <Pressable onPress={handleClose} hitSlop={24}>
            <View style={styles.orbArea}>
              <Animated.View
                style={[
                  styles.orbGlow,
                  {backgroundColor: orbGlow, transform: [{scale: pulseAnim}]},
                ]}
              />
              <Animated.View
                style={[
                  styles.orb,
                  {backgroundColor: orbColor, transform: [{scale: pulseAnim}]},
                ]}
              />
            </View>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    flexDirection: 'column',
  },

  closeBtn: {
    position: 'absolute',
    top: 56,
    right: 24,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#222',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  closeBtnText: {color: '#aaa', fontSize: 16, fontWeight: '600'},

  // Takes all space above the orb; captions stack from the bottom
  captionsArea: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 100, // clear the close button
    paddingBottom: 20,
    justifyContent: 'flex-end',
    gap: 12,
  },

  aiCaptionRow: {alignItems: 'flex-start'},
  aiCaption: {
    color: '#ddd',
    fontSize: 15,
    lineHeight: 22,
    backgroundColor: '#1a1a1acc',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '90%',
  },

  userCaptionRow: {alignItems: 'flex-end'},
  userCaption: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 22,
    backgroundColor: '#1565c0cc',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '85%',
    textAlign: 'right',
  },
  // Live transcript: same bubble, slightly translucent to signal it's interim
  userCaptionLive: {
    backgroundColor: '#1565c088',
    color: '#cce',
  },

  // Fixed-height section at the bottom for the orb
  orbSection: {
    alignItems: 'center',
    paddingBottom: 64,
  },
  stateLabel: {
    color: '#bbb',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.4,
    marginBottom: 16,
  },
  orbArea: {
    width: 160,
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orb: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  orbGlow: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
  },
});
