import React, { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsProvider, useSettings } from './state/settings';
import { useAuthUser } from './firebase/auth';
import { AgeScreen, LanguageScreen, LoginScreen } from './screens/Onboarding';
import Home from './screens/Home';
import Search from './screens/Search';
import StoryDetail from './screens/StoryDetail';
import Profile from './screens/Profile';
import { Library } from './screens/Stubs';
import Community from './screens/Community';
import CreatePost from './screens/CreatePost';
import UserProfile from './screens/UserProfile';
import Brain from './screens/Brain';
import { Chats } from './screens/Chats';
import Chat from './screens/Chat';
import { AppHeader } from './components/AppHeader';
import { TabBar } from './components/TabBar';
import { colors } from './theme';
import { warmVoice } from './voice/engine';
import { warmBrain, maybeStudy } from './brain/brain';
import { isAdmin } from './firebase/community';
import { getApiKey } from './ai/secure';
import type { User } from './firebase/auth';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, text: colors.text, border: colors.line, primary: colors.accent },
};

function Tabs({ user }: { user: User | null }) {
  return (
    <Tab.Navigator
      tabBar={(props) => <TabBar {...props} user={user} />}
      screenOptions={{ header: () => <AppHeader /> }}
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

  // Load the voice model while the app opens: it takes several seconds, so the first message does not wait for it.
  useEffect(() => { if (loaded && s.language) warmVoice(s.language, s.voices[s.language]); }, [loaded, s.language]);

  // Story lessons learned by the app (shared by everyone). Loaded from the phone cache first.
  useEffect(() => { warmBrain(); }, []);
  // Admin only: now and then the app studies a few pages of the saved novels, quietly, at most once every few hours.
  useEffect(() => {
    if (!loaded || !user) return;
    isAdmin(user.uid).then(async (a) => { if (a) maybeStudy(s.provider, await getApiKey()); });
  }, [loaded, user?.uid]);

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
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.bg }, headerShadowVisible: false, headerTintColor: colors.text, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="Tabs" options={{ headerShown: false }}>
          {() => <Tabs user={user} />}
        </Stack.Screen>
        <Stack.Screen name="StoryDetail" component={StoryDetail} options={{ headerShown: false }} />
        <Stack.Screen name="Chat" component={Chat} options={{ headerShown: false }} />
        <Stack.Screen name="Profile" component={Profile} />
        <Stack.Screen name="Library" component={Library} />
        <Stack.Screen name="CreatePost" component={CreatePost} options={{ title: 'Post a story' }} />
        <Stack.Screen name="UserProfile" component={UserProfile} options={{ title: 'Profile' }} />
        <Stack.Screen name="Brain" component={Brain} options={{ title: 'Story brain' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function Main() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SettingsProvider>
        <Root />
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
