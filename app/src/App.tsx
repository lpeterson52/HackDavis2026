import React, {useRef, useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {InferenceClientImpl} from './inference';

type Status = 'idle' | 'connecting' | 'streaming' | 'error';

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');
  const clientRef = useRef<InstanceType<typeof InferenceClientImpl> | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  async function send() {
    const text = prompt.trim();
    if (!text || status === 'streaming') return;

    setPrompt('');
    setResponse('');
    setError('');
    setStatus('connecting');

    try {
      if (!clientRef.current) {
        clientRef.current = new InferenceClientImpl();
        await clientRef.current.initialize();
      }

      setStatus('streaming');
      await clientRef.current.generate(text, {}, (token, done) => {
        if (!done) {
          setResponse(prev => prev + token);
          scrollRef.current?.scrollToEnd({animated: false});
        } else {
          setStatus('idle');
        }
      });
    } catch (e: any) {
      setError(e.message ?? 'Unknown error');
      setStatus('error');
      clientRef.current = null;
    }
  }

  const busy = status === 'connecting' || status === 'streaming';

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <Text style={styles.title}>Inference Test</Text>
          <StatusBadge status={status} />
        </View>

        <ScrollView
          ref={scrollRef}
          style={styles.responseArea}
          contentContainerStyle={styles.responseContent}>
          {response ? (
            <Text style={styles.responseText}>{response}</Text>
          ) : (
            <Text style={styles.placeholder}>
              {status === 'connecting'
                ? 'Connecting to server…'
                : 'Response will appear here.'}
            </Text>
          )}
          {status === 'error' && <Text style={styles.errorText}>{error}</Text>}
        </ScrollView>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={prompt}
            onChangeText={setPrompt}
            placeholder="Enter a prompt…"
            placeholderTextColor="#888"
            multiline
            editable={!busy}
            onSubmitEditing={send}
          />
          <Pressable
            style={[styles.sendBtn, busy && styles.sendBtnDisabled]}
            onPress={send}
            disabled={busy}>
            {busy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendBtnText}>Send</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function StatusBadge({status}: {status: Status}) {
  const label: Record<Status, string> = {
    idle: 'Ready',
    connecting: 'Connecting',
    streaming: 'Streaming',
    error: 'Error',
  };
  const color: Record<Status, string> = {
    idle: '#4caf50',
    connecting: '#ff9800',
    streaming: '#2196f3',
    error: '#f44336',
  };
  return (
    <View style={[styles.badge, {backgroundColor: color[status]}]}>
      <Text style={styles.badgeText}>{label[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0f0f0f'},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#333',
  },
  title: {color: '#fff', fontSize: 17, fontWeight: '600'},
  badge: {borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3},
  badgeText: {color: '#fff', fontSize: 12, fontWeight: '500'},
  responseArea: {flex: 1, paddingHorizontal: 16},
  responseContent: {paddingVertical: 16, flexGrow: 1},
  responseText: {color: '#e0e0e0', fontSize: 15, lineHeight: 22},
  placeholder: {color: '#555', fontSize: 15, fontStyle: 'italic'},
  errorText: {color: '#f44336', fontSize: 14, marginTop: 8},
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333',
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    backgroundColor: '#1e1e1e',
    color: '#fff',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  sendBtn: {
    backgroundColor: '#2196f3',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 66,
  },
  sendBtnDisabled: {backgroundColor: '#1a4a6e'},
  sendBtnText: {color: '#fff', fontWeight: '600', fontSize: 15},
});
