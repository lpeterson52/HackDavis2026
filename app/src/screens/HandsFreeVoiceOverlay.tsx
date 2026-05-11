import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Markdown from 'react-native-markdown-display';
import Voice, {SpeechErrorEvent, SpeechResultsEvent} from '@react-native-voice/voice';
import Tts from 'react-native-tts';

export type HandsFreePhase = 'idle' | 'listening' | 'thinking' | 'speaking';

export type HandsFreeVoiceOverlayProps = {
  enabled: boolean;
  streaming: boolean;

  phase: HandsFreePhase;
  setPhase: (p: HandsFreePhase) => void;

  onExit: () => void;
  onSend: (text: string) => Promise<void>;

  onVoiceError?: (msg: string | null) => void;

  /** Called when the overlay transcript changes. */
  onTranscript?: (text: string) => void;

  /** The latest assistant text for the current streamed turn (shown in the overlay). */
  assistantText: string;
};

const HF_PHASE_CONFIG: Record<HandsFreePhase, {label: string; color: string; icon: string}> = {
  idle: {label: 'Hands-Free Off', color: '#333', icon: '🎙️'},
  listening: {label: 'Listening…', color: '#1565c0', icon: '👂'},
  thinking: {label: 'Thinking…', color: '#6a1b9a', icon: '🧠'},
  speaking: {label: 'Speaking…', color: '#2e7d32', icon: '🔊'},
};

export default function HandsFreeVoiceOverlay({
  enabled,
  streaming,
  phase,
  setPhase,
  onExit,
  onSend,
  onVoiceError,
  onTranscript,
  assistantText,
}: HandsFreeVoiceOverlayProps) {
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const [overlayVisible, setOverlayVisible] = useState(false);

  const [isListening, setIsListening] = useState(false);
  const [overlayTranscript, setOverlayTranscript] = useState('');

  // Mirrors enabled/streaming for callbacks that otherwise close over stale state.
  const enabledRef = useRef(false);
  const streamingRef = useRef(false);

  // Latest voice transcript — avoids stale-state race between onSpeechResults and onSpeechEnd.
  const transcriptRef = useRef('');

  const screen = Dimensions.get('window');
  const overlayRadius = useMemo(() => {
    const diagonal = Math.sqrt(screen.width * screen.width + screen.height * screen.height);
    return diagonal * 0.6;
  }, [screen.width, screen.height]);

  useEffect(() => {
    enabledRef.current = enabled;

    if (enabled) {
      setOverlayTranscript('');
      animateOverlay(true);
      startListening();
    } else {
      setPhase('idle');
      setOverlayTranscript('');
      animateOverlay(false);
      Voice.stop().catch(() => {});
      Tts.stop();
      setIsListening(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    streamingRef.current = streaming;
  }, [streaming]);

  useEffect(() => {
    Voice.onSpeechResults = (e: SpeechResultsEvent) => {
      const transcript = e.value?.[0] ?? '';
      transcriptRef.current = transcript;
      if (transcript) {
        setOverlayTranscript(transcript);
        onTranscript?.(transcript);
      }
    };

    Voice.onSpeechEnd = () => {
      setIsListening(false);
      setTimeout(() => {
        if (!enabledRef.current) return;
        const text = transcriptRef.current.trim();
        if (!text) {
          setPhase('listening');
          startListening();
          return;
        }
        void send(text);
      }, 80);
    };

    Voice.onSpeechError = (e: SpeechErrorEvent) => {
      setIsListening(false);
      if (enabledRef.current) {
        setTimeout(() => startListening(), 500);
      } else {
        onVoiceError?.(e.error?.message ?? 'Voice recognition failed');
      }
    };

    const ttsFinish = Tts.addEventListener('tts-finish', () => {
      if (enabledRef.current) {
        setPhase('listening');
        startListening();
      }
    });

    const ttsCancel = Tts.addEventListener('tts-cancel', () => {
      if (enabledRef.current) {
        setPhase('listening');
        startListening();
      }
    });

    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
      (ttsFinish as any)?.remove?.();
      (ttsCancel as any)?.remove?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function animateOverlay(open: boolean) {
    if (open) setOverlayVisible(true);
    Animated.timing(overlayAnim, {
      toValue: open ? 1 : 0,
      duration: open ? 280 : 220,
      useNativeDriver: true,
    }).start(({finished}) => {
      if (!open && finished) setOverlayVisible(false);
    });
  }

  async function startListening() {
    if (streamingRef.current) return;
    onVoiceError?.(null);
    transcriptRef.current = '';
    setOverlayTranscript('');

    try {
      await Voice.start('en-US');
      setIsListening(true);
      setPhase('listening');
    } catch {
      onVoiceError?.('Microphone unavailable — type instead');
    }
  }

  async function send(text: string) {
    if (!enabledRef.current || streamingRef.current) return;

    setPhase('thinking');
    setOverlayTranscript(text);
    transcriptRef.current = '';

    try {
      await onSend(text);
      // Parent might switch us to speaking; if not, re-arm shortly after.
      setTimeout(() => {
        if (!enabledRef.current) return;
        if (!streamingRef.current && phase !== 'speaking') {
          setPhase('listening');
          startListening();
        }
      }, 250);
    } catch {
      if (enabledRef.current) {
        setPhase('listening');
        startListening();
      }
    }
  }

  const overlayScale = overlayAnim.interpolate({inputRange: [0, 1], outputRange: [0.01, 1]});
  const overlayOpacity = overlayAnim.interpolate({inputRange: [0, 0.2, 1], outputRange: [0, 1, 1]});

  if (!overlayVisible) return null;

  return (
    <Animated.View
      pointerEvents={enabled ? 'auto' : 'none'}
      style={[voiceOverlayStyles.container, {opacity: overlayOpacity}]}
    >
      <Animated.View
        style={[
          voiceOverlayStyles.circle,
          {
            width: overlayRadius * 2,
            height: overlayRadius * 2,
            borderRadius: overlayRadius,
            transform: [{scale: overlayScale}],
          },
        ]}
      />

      <View style={voiceOverlayStyles.content}>
        <View style={voiceOverlayStyles.topRow}>
          <View style={voiceOverlayStyles.leftTopControls}>
            <Pressable
              onPress={onExit}
              style={voiceOverlayStyles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close voice mode"
            />
          </View>

          <View style={voiceOverlayStyles.transcriptWrap}>
            <Text style={voiceOverlayStyles.transcriptLabel}>You</Text>
            <Text style={voiceOverlayStyles.transcriptText} numberOfLines={3} ellipsizeMode="tail">
              {overlayTranscript || (phase === 'listening' ? 'Listening…' : ' ')}
            </Text>
          </View>
        </View>

        <View style={voiceOverlayStyles.responseWrap}>
          <Text style={voiceOverlayStyles.responseLabel}>MedField</Text>

          {assistantText ? (
            <Markdown style={voiceOverlayMdStyles}>{assistantText}</Markdown>
          ) : phase === 'thinking' || streaming ? (
            <View style={voiceOverlayStyles.thinkingRow}>
              <ActivityIndicator size="small" color="#bbb" />
              <Text style={voiceOverlayStyles.thinkingText}>Thinking…</Text>
            </View>
          ) : (
            <Text style={voiceOverlayStyles.hintText}>Ask a question to get guidance.</Text>
          )}
        </View>

        <View style={voiceOverlayStyles.bottomRow}>
          <Pressable
            style={[
              voiceOverlayStyles.micFab,
              isListening && voiceOverlayStyles.micFabActive,
              streaming && voiceOverlayStyles.micFabDisabled,
            ]}
            onPress={() => {
              if (streaming) return;
              if (isListening) {
                Voice.stop().catch(() => {});
                setIsListening(false);
              } else {
                startListening();
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={isListening ? 'Stop listening' : 'Start listening'}
          >
            <Text style={voiceOverlayStyles.micFabText}>{isListening ? '⏹️' : '🎤'}</Text>
          </Pressable>
        </View>

        {enabled && <HandsFreeBar phase={phase} onStop={onExit} />}
      </View>
    </Animated.View>
  );
}

function HandsFreeBar({phase, onStop}: {phase: HandsFreePhase; onStop: () => void}) {
  const cfg = HF_PHASE_CONFIG[phase];
  return (
    <View style={[hfBarStyles.bar, {borderTopColor: cfg.color}]}>
      <View style={hfBarStyles.left}>
        <View style={[hfBarStyles.dot, {backgroundColor: cfg.color}]} />
        <Text style={hfBarStyles.label}>
          {cfg.icon}  {cfg.label}
        </Text>
      </View>
      <Pressable style={hfBarStyles.stopBtn} onPress={onStop}>
        <Text style={hfBarStyles.stopText}>Exit</Text>
      </Pressable>
    </View>
  );
}

const hfBarStyles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#0d0d0d',
    borderTopWidth: 2,
  },
  left: {flexDirection: 'row', alignItems: 'center', gap: 8},
  dot: {width: 8, height: 8, borderRadius: 4},
  label: {color: '#ccc', fontSize: 14, fontWeight: '600'},
  stopBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#444',
  },
  stopText: {color: '#888', fontSize: 12},
});

const voiceOverlayStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 50,
    elevation: 50,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  circle: {
    position: 'absolute',
    left: '50%',
    bottom: -240,
    marginLeft: -500,
    backgroundColor: '#0d1a2a',
    borderWidth: 1,
    borderColor: '#1f3a56',
  },
  content: {
    flex: 1,
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  leftTopControls: {
    width: 46,
    alignItems: 'flex-start',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transcriptWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  transcriptLabel: {
    color: '#6fa8dc',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 4,
  },
  transcriptText: {
    color: '#e6f0ff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'right',
    lineHeight: 24,
  },
  responseWrap: {
    marginTop: 16,
    flex: 1,
  },
  responseLabel: {
    color: '#bbb',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  thinkingRow: {flexDirection: 'row', alignItems: 'center', gap: 10},
  thinkingText: {color: '#bbb', fontSize: 14},
  hintText: {color: '#777', fontSize: 14, lineHeight: 20},
  bottomRow: {
    alignItems: 'center',
    paddingTop: 12,
  },
  micFab: {
    width: 72,
    height: 72,
    borderRadius: 999,
    backgroundColor: '#1565c0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#1e88e5',
  },
  micFabText: {
    color: '#fff',
    fontSize: 28,
    lineHeight: 28,
  },
  micFabActive: {
    backgroundColor: '#c62828',
    borderColor: '#ef5350',
  },
  micFabDisabled: {
    opacity: 0.5,
  },
});

const voiceOverlayMdStyles = {
  body: {color: '#ddd', fontSize: 15, lineHeight: 23},
  heading1: {color: '#fff', fontSize: 20, fontWeight: '700' as const, marginVertical: 6},
  heading2: {color: '#fff', fontSize: 17, fontWeight: '700' as const, marginVertical: 4},
  strong: {color: '#fff', fontWeight: '700' as const},
  em: {fontStyle: 'italic' as const, color: '#bbb'},
  bullet_list: {marginVertical: 4},
  ordered_list: {marginVertical: 4},
  list_item: {marginVertical: 2, color: '#ddd'},
  hr: {backgroundColor: '#333', height: 1, marginVertical: 10},
  blockquote: {
    backgroundColor: '#111',
    borderLeftColor: '#1565c0',
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
};
