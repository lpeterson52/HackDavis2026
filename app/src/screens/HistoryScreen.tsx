import React, {useState} from 'react';
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
import {streamSummary} from '../api';
import {useAppContext} from '../context';

const URGENCY_COLOR: Record<string, string> = {
  RED: '#f44336',
  ORANGE: '#ff9800',
  YELLOW: '#ffc107',
  GREEN: '#4caf50',
};

export default function HistoryScreen() {
  const {messages, sessionState, currentUrgency, vitals, addVital} = useAppContext();

  const [vitalInput, setVitalInput] = useState('');
  const [summary, setSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');

  async function generateSummary() {
    if (!messages.length) return;
    setSummary('');
    setSummaryError('');
    setSummaryLoading(true);
    try {
      const history = messages.map(m => ({role: m.role, content: m.content}));
      await streamSummary(history, token => {
        setSummary(prev => prev + token);
      });
    } catch (e: any) {
      setSummaryError(e.message);
    } finally {
      setSummaryLoading(false);
    }
  }

  function logVital() {
    const note = vitalInput.trim();
    if (!note) return;
    addVital(note);
    setVitalInput('');
  }

  const urgencyColor = currentUrgency ? URGENCY_COLOR[currentUrgency] : null;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">

        {/* Header */}
        <Text style={styles.header}>Session Summary</Text>

        {/* Session status card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Current Session</Text>
          {currentUrgency ? (
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.urgencyDot,
                  {backgroundColor: urgencyColor ?? '#666'},
                ]}
              />
              <Text
                style={[styles.urgencyLabel, {color: urgencyColor ?? '#fff'}]}>
                {currentUrgency}
              </Text>
              {sessionState.matched_condition_id && (
                <Text style={styles.conditionLabel}>
                  · {sessionState.matched_condition_id.replace(/-/g, ' ')}
                </Text>
              )}
            </View>
          ) : (
            <Text style={styles.noSession}>No active session — start a chat first.</Text>
          )}
          <Text style={styles.metaText}>
            {messages.length} message{messages.length !== 1 ? 's' : ''} ·{' '}
            {sessionState.asked_question_ids.length} question
            {sessionState.asked_question_ids.length !== 1 ? 's' : ''} asked
          </Text>
        </View>

        {/* ER Summary */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>ER Handoff Summary</Text>
          <Text style={styles.cardSubtext}>
            Generate a concise summary to read to emergency personnel on arrival.
          </Text>
          <Pressable
            style={[
              styles.generateBtn,
              (!messages.length || summaryLoading) && styles.generateBtnDisabled,
            ]}
            onPress={generateSummary}
            disabled={!messages.length || summaryLoading}>
            {summaryLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.generateBtnText}>
                {summary ? 'Regenerate Summary' : 'Generate Summary'}
              </Text>
            )}
          </Pressable>

          {summaryError ? (
            <Text style={styles.errorText}>{summaryError}</Text>
          ) : null}

          {summary ? (
            <View style={styles.summaryBox}>
              <Markdown style={mdStyles}>{summary}</Markdown>
            </View>
          ) : null}

          {!messages.length && (
            <Text style={styles.emptyHint}>
              Complete a chat session to generate a summary.
            </Text>
          )}
        </View>

        {/* Vitals log */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Vitals Log</Text>
          <Text style={styles.cardSubtext}>
            Record observations over time (pulse, breathing, consciousness, etc.)
          </Text>

          <View style={styles.vitalInputRow}>
            <TextInput
              style={styles.vitalInput}
              value={vitalInput}
              onChangeText={setVitalInput}
              placeholder="e.g. HR ~100, alert, bleeding slowing"
              placeholderTextColor="#555"
              onSubmitEditing={logVital}
              returnKeyType="done"
              blurOnSubmit={false}
            />
            <Pressable
              style={[styles.logBtn, !vitalInput.trim() && styles.logBtnDisabled]}
              onPress={logVital}
              disabled={!vitalInput.trim()}>
              <Text style={styles.logBtnText}>Log</Text>
            </Pressable>
          </View>

          {vitals.length === 0 ? (
            <Text style={styles.emptyHint}>No vitals logged yet.</Text>
          ) : (
            <View style={styles.vitalsList}>
              {[...vitals].reverse().map(v => (
                <View key={v.id} style={styles.vitalRow}>
                  <Text style={styles.vitalTime}>{v.time}</Text>
                  <Text style={styles.vitalNote}>{v.note}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Disclaimer */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerText}>
            ⚠️ AI-generated content. This summary is for communication assistance only and does not constitute a medical record.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0f0f0f'},
  scroll: {flex: 1},
  content: {padding: 16, paddingBottom: 40},

  header: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 16,
  },

  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  cardLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  cardSubtext: {
    color: '#666',
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },

  statusRow: {flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6},
  urgencyDot: {width: 10, height: 10, borderRadius: 5},
  urgencyLabel: {fontSize: 15, fontWeight: '700'},
  conditionLabel: {color: '#888', fontSize: 14, textTransform: 'capitalize'},
  noSession: {color: '#555', fontSize: 14, fontStyle: 'italic', marginBottom: 6},
  metaText: {color: '#555', fontSize: 12},

  generateBtn: {
    backgroundColor: '#1565c0',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  generateBtnDisabled: {backgroundColor: '#1a2a3a'},
  generateBtnText: {color: '#fff', fontWeight: '700', fontSize: 15},

  summaryBox: {
    backgroundColor: '#0d1117',
    borderRadius: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    marginTop: 4,
  },

  errorText: {color: '#f44336', fontSize: 13, marginTop: 4},
  emptyHint: {color: '#555', fontSize: 13, fontStyle: 'italic', marginTop: 4},

  vitalInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  vitalInput: {
    flex: 1,
    backgroundColor: '#111',
    color: '#fff',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  logBtn: {
    backgroundColor: '#2e7d32',
    borderRadius: 10,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  logBtnDisabled: {backgroundColor: '#1a2a1a'},
  logBtnText: {color: '#fff', fontWeight: '700', fontSize: 14},

  vitalsList: {gap: 6},
  vitalRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a2a',
  },
  vitalTime: {color: '#2196f3', fontSize: 13, fontWeight: '600', minWidth: 48},
  vitalNote: {flex: 1, color: '#ccc', fontSize: 14},

  disclaimer: {
    marginTop: 8,
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  disclaimerText: {color: '#555', fontSize: 12, lineHeight: 18},
});

const mdStyles = StyleSheet.create({
  body: {color: '#ddd', fontSize: 14, lineHeight: 22},
  heading1: {color: '#fff', fontSize: 17, fontWeight: '700', marginVertical: 4},
  heading2: {color: '#fff', fontSize: 15, fontWeight: '700', marginVertical: 3},
  strong: {color: '#fff', fontWeight: '700'},
  bullet_list: {marginVertical: 3},
  ordered_list: {marginVertical: 3},
  list_item: {marginVertical: 1, color: '#ddd'},
  hr: {backgroundColor: '#333', height: 1, marginVertical: 8},
  paragraph: {marginBottom: 0},
});
