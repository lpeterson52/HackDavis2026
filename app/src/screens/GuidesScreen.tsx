import React, {useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {fetchProtocol, Protocol, Slide} from '../api';

const CONDITIONS = [
  {id: 'severe-bleeding', name: 'Severe Bleeding', icon: '🩸', urgency: 'RED'},
  {id: 'cpr', name: 'CPR / Cardiac Arrest', icon: '❤️', urgency: 'RED'},
  {id: 'choking', name: 'Choking', icon: '🫁', urgency: 'RED'},
  {id: 'anaphylaxis', name: 'Anaphylaxis', icon: '⚠️', urgency: 'RED'},
  {id: 'seizure', name: 'Seizure', icon: '🧠', urgency: 'ORANGE'},
  {id: 'burns', name: 'Burns', icon: '🔥', urgency: 'YELLOW'},
];

const URGENCY_COLOR: Record<string, string> = {
  RED: '#f44336',
  ORANGE: '#ff9800',
  YELLOW: '#ffc107',
  GREEN: '#4caf50',
};

export default function GuidesScreen() {
  const [protocol, setProtocol] = useState<Protocol | null>(null);
  const [slideIdx, setSlideIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function open(id: string) {
    setLoading(true);
    setError('');
    try {
      const p = await fetchProtocol(id);
      const sorted = [...p.slides].sort((a, b) => a.order - b.order);
      setProtocol({...p, slides: sorted});
      setSlideIdx(0);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function close() {
    setProtocol(null);
    setSlideIdx(0);
  }

  function goToSlideByOrder(order: number) {
    if (!protocol) return;
    const idx = protocol.slides.findIndex(s => s.order === order);
    if (idx >= 0) setSlideIdx(idx);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2196f3" />
        <Text style={styles.loadingText}>Loading protocol…</Text>
      </View>
    );
  }

  if (protocol) {
    const slide = protocol.slides[slideIdx];
    return (
      <SlideView
        protocol={protocol}
        slide={slide}
        slideIdx={slideIdx}
        total={protocol.slides.length}
        onPrev={() => setSlideIdx(i => Math.max(0, i - 1))}
        onNext={() => setSlideIdx(i => Math.min(protocol.slides.length - 1, i + 1))}
        onDecision={goToSlideByOrder}
        onClose={close}
      />
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.listContent}>
      <Text style={styles.header}>First Aid Guides</Text>
      <Text style={styles.subheader}>
        Hardcoded protocols — Red Cross / AHA / WMS
      </Text>

      {CONDITIONS.map(c => (
        <Pressable
          key={c.id}
          style={({pressed}) => [styles.card, pressed && styles.cardPressed]}
          onPress={() => open(c.id)}>
          <View
            style={[
              styles.cardAccent,
              {backgroundColor: URGENCY_COLOR[c.urgency] ?? '#666'},
            ]}
          />
          <Text style={styles.cardIcon}>{c.icon}</Text>
          <View style={styles.cardBody}>
            <Text style={styles.cardName}>{c.name}</Text>
            <Text
              style={[
                styles.cardUrgency,
                {color: URGENCY_COLOR[c.urgency] ?? '#666'},
              ]}>
              {c.urgency}
            </Text>
          </View>
          <Text style={styles.cardArrow}>›</Text>
        </Pressable>
      ))}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.disclaimer}>
        <Text style={styles.disclaimerText}>
          ⚠️ These protocols are for emergency use by trained or untrained bystanders. Seek professional medical care as soon as possible.
        </Text>
      </View>
    </ScrollView>
  );
}

interface SlideViewProps {
  protocol: Protocol;
  slide: Slide;
  slideIdx: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onDecision: (order: number) => void;
  onClose: () => void;
}

function SlideView({
  protocol,
  slide,
  slideIdx,
  total,
  onPrev,
  onNext,
  onDecision,
  onClose,
}: SlideViewProps) {
  const isFirst = slideIdx === 0;
  const isLast = slideIdx === total - 1;
  const isDecision = slide.type === 'decision';
  const isCompletion = slide.type === 'completion';

  return (
    <View style={styles.slideRoot}>
      {/* Slide header */}
      <View style={styles.slideHeader}>
        <Pressable onPress={onClose} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </Pressable>
        <Text style={styles.slideTitle} numberOfLines={1}>
          {protocol.title}
        </Text>
        <Text style={styles.slideCounter}>
          {slideIdx + 1}/{total}
        </Text>
      </View>

      <ScrollView style={styles.slideScroll} contentContainerStyle={styles.slideContent}>
        {/* Step badge */}
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>
            {isCompletion ? 'DONE' : isDecision ? 'DECIDE' : `STEP ${slideIdx + 1}`}
          </Text>
        </View>

        {/* Slide title */}
        <Text style={styles.slideStepTitle}>{slide.title}</Text>

        {/* Content */}
        <Text style={styles.slideBody}>{slide.content}</Text>

        {/* Warning */}
        {slide.warning ? (
          <View style={styles.warningBox}>
            <Text style={styles.warningLabel}>⚠️ WARNING</Text>
            <Text style={styles.warningText}>{slide.warning}</Text>
          </View>
        ) : null}

        {/* Completion message */}
        {isCompletion && slide.completion?.message ? (
          <View style={styles.completionBox}>
            <Text style={styles.completionText}>{slide.completion.message}</Text>
          </View>
        ) : null}

        {/* Decision branches */}
        {isDecision && slide.decision ? (
          <View style={styles.decisionWrap}>
            <Text style={styles.decisionLabel}>Select the situation:</Text>
            {Object.entries(slide.decision).map(([key, branch]) => (
              <Pressable
                key={key}
                style={({pressed}) => [
                  styles.decisionBtn,
                  pressed && styles.decisionBtnPressed,
                ]}
                onPress={() => onDecision(branch.next_slide)}>
                <Text style={styles.decisionBtnText}>{branch.label}</Text>
                <Text style={styles.decisionArrow}>›</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Source attribution */}
        {isCompletion || isLast ? (
          <Text style={styles.sourceText}>Source: {protocol.source}</Text>
        ) : null}
      </ScrollView>

      {/* Navigation */}
      {!isDecision && (
        <View style={styles.navRow}>
          <Pressable
            style={[styles.navBtn, isFirst && styles.navBtnDisabled]}
            onPress={onPrev}
            disabled={isFirst}>
            <Text style={[styles.navBtnText, isFirst && styles.navBtnTextDisabled]}>
              ← Prev
            </Text>
          </Pressable>

          {isCompletion ? (
            <Pressable style={[styles.navBtn, styles.navBtnDone]} onPress={onClose}>
              <Text style={styles.navBtnDoneText}>✓ Done</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.navBtn, styles.navBtnNext, isLast && styles.navBtnDisabled]}
              onPress={onNext}
              disabled={isLast}>
              <Text style={[styles.navBtnNextText, isLast && styles.navBtnTextDisabled]}>
                Next →
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0f0f0f'},
  listContent: {padding: 16, paddingBottom: 32},
  centered: {flex: 1, backgroundColor: '#0f0f0f', alignItems: 'center', justifyContent: 'center'},
  loadingText: {color: '#888', marginTop: 12, fontSize: 15},

  header: {color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 4},
  subheader: {color: '#555', fontSize: 13, marginBottom: 20},

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  cardPressed: {backgroundColor: '#222'},
  cardAccent: {width: 5, alignSelf: 'stretch'},
  cardIcon: {fontSize: 28, paddingHorizontal: 14, paddingVertical: 16},
  cardBody: {flex: 1},
  cardName: {color: '#fff', fontSize: 16, fontWeight: '600'},
  cardUrgency: {fontSize: 12, fontWeight: '700', marginTop: 2},
  cardArrow: {color: '#555', fontSize: 24, paddingRight: 14},

  errorText: {color: '#f44336', fontSize: 14, marginTop: 12, textAlign: 'center'},

  disclaimer: {
    marginTop: 24,
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  disclaimerText: {color: '#666', fontSize: 12, lineHeight: 18},

  // Slide view
  slideRoot: {flex: 1, backgroundColor: '#0f0f0f'},
  slideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2a2a2a',
    gap: 12,
  },
  backBtn: {paddingVertical: 4},
  backBtnText: {color: '#2196f3', fontSize: 15},
  slideTitle: {flex: 1, color: '#fff', fontSize: 15, fontWeight: '600'},
  slideCounter: {color: '#555', fontSize: 13},

  slideScroll: {flex: 1},
  slideContent: {padding: 20, paddingBottom: 32},

  stepBadge: {
    backgroundColor: '#1565c0',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  stepBadgeText: {color: '#fff', fontSize: 11, fontWeight: '700'},

  slideStepTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 14,
    lineHeight: 28,
  },
  slideBody: {color: '#ccc', fontSize: 16, lineHeight: 26, marginBottom: 16},

  warningBox: {
    backgroundColor: '#1a0f00',
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
  },
  warningLabel: {color: '#ff9800', fontSize: 12, fontWeight: '700', marginBottom: 4},
  warningText: {color: '#e0a060', fontSize: 14, lineHeight: 20},

  completionBox: {
    backgroundColor: '#0a1f0a',
    borderRadius: 10,
    padding: 16,
    borderWidth: 1,
    borderColor: '#2e7d32',
    marginBottom: 16,
  },
  completionText: {color: '#81c784', fontSize: 15, lineHeight: 22, fontWeight: '600'},

  decisionWrap: {marginTop: 8},
  decisionLabel: {color: '#888', fontSize: 13, marginBottom: 10, fontWeight: '600'},
  decisionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  decisionBtnPressed: {backgroundColor: '#252525'},
  decisionBtnText: {flex: 1, color: '#fff', fontSize: 15, fontWeight: '600'},
  decisionArrow: {color: '#2196f3', fontSize: 20},

  sourceText: {color: '#444', fontSize: 12, marginTop: 16, fontStyle: 'italic'},

  navRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#2a2a2a',
  },
  navBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  navBtnNext: {backgroundColor: '#1565c0', borderColor: '#1565c0'},
  navBtnDone: {backgroundColor: '#2e7d32', borderColor: '#2e7d32'},
  navBtnDisabled: {opacity: 0.35},
  navBtnText: {color: '#aaa', fontSize: 15, fontWeight: '600'},
  navBtnNextText: {color: '#fff', fontSize: 15, fontWeight: '600'},
  navBtnDoneText: {color: '#fff', fontSize: 15, fontWeight: '700'},
  navBtnTextDisabled: {color: '#555'},
});
