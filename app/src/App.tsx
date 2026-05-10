import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {NavigationContainer} from '@react-navigation/native';
import React from 'react';
import {Text} from 'react-native';
import {AppProvider} from './context';
import ChatScreen from './screens/ChatScreen';
import GuidesScreen from './screens/GuidesScreen';
import HistoryScreen from './screens/HistoryScreen';

const Tab = createBottomTabNavigator();

function icon(label: string, focused: boolean) {
  const map: Record<string, [string, string]> = {
    Chat: ['💬', '🗨️'],
    Guides: ['📖', '📗'],
    Summary: ['📋', '📄'],
  };
  const [inactive, active] = map[label];
  return <Text style={{fontSize: 20}}>{focused ? active : inactive}</Text>;
}

export default function App() {
  return (
    <AppProvider>
      <NavigationContainer>
        <Tab.Navigator
          screenOptions={({route}) => ({
            headerShown: false,
            tabBarIcon: ({focused}) => icon(route.name, focused),
            tabBarStyle: {
              backgroundColor: '#0f0f0f',
              borderTopColor: '#2a2a2a',
            },
            tabBarActiveTintColor: '#2196f3',
            tabBarInactiveTintColor: '#555',
            tabBarLabelStyle: {fontSize: 12, marginBottom: 2},
          })}>
          <Tab.Screen name="Chat" component={ChatScreen} />
          <Tab.Screen name="Guides" component={GuidesScreen} />
          <Tab.Screen name="Summary" component={HistoryScreen} />
        </Tab.Navigator>
      </NavigationContainer>
    </AppProvider>
  );
}
