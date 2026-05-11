import React from 'react';
import {AppProvider} from './context';
import ChatScreen from './screens/ChatScreen';

export default function App() {
  return (
    <AppProvider>
          <ChatScreen />
    </AppProvider>
  );
}
