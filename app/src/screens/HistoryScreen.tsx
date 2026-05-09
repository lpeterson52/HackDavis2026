import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

export default function HistoryScreen() {
  return (
    <View style={styles.root}>
      <Text style={styles.text}>History</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#0f0f0f', alignItems: 'center', justifyContent: 'center'},
  text: {color: '#555', fontSize: 16},
});
