import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { SettingsProvider, useSettings } from './src/state/settings';
import { useAuthUser } from './src/firebase/auth';
import { AgeScreen, LanguageScreen, LoginScreen } from './src/screens/Onboarding';
import Home from './src/screens/Home';
import Search from './src/screens/Search';
import StoryDetail from './src/screens/StoryDetail';
import Profile from './src/screens/Profile';
import { Chats, Community, Library } from './src/screens/Stubs';
import { AppHeader } from './src/components/AppHeader';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, text: colors.text, border: 'rgba(255,255,255,0.08)', primary: colors.accent },
};

const tabIcon: Record<string, [any, any]> = {
  Home: ['home', 'home-outline'],
  Search: ['search', 'search-outline'],
  Chats: ['chatbubbles', 'chatbubbles-outline'],
  Community: ['people', 'people-outline'],
};

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        header: () => <AppHeader />,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.sub,
        tabBarStyle: { backgroundColor: colors.bg, borderTopColor: 'rgba(255,255,255,0.08)' },
        tabBarIcon: ({ color, focused, size }) => <Ionicons name={tabIcon[route.name][focused ? 0 : 1]} size={size} color={color} />,
      })}
    >
      <Tab.Screen name="Home" component={Home} />
      <Tab.Screen name="Search" component={Search} />
      <Tab.Screen name="Chats" component={Chats} />
      <Tab.Screen name="Community" component={Community} />
    </Tab.Navigator>
  );
}

function Root() {
  const { s, loaded } = useSettings();
  const { user, ready } = useAuthUser();

  if (!loaded || !ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!s.ageConfirmed) return <AgeScreen />;
  if (!user && !s.guest) return <LoginScreen />;
  if (!s.language) return <LanguageScreen />;

  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
        <Stack.Screen name="StoryDetail" component={StoryDetail} options={{ title: '', presentation: 'modal' }} />
        <Stack.Screen name="Profile" component={Profile} />
        <Stack.Screen name="Library" component={Library} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SettingsProvider>
        <Root />
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
