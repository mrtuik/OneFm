import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsProvider, useSettings } from './state/settings';
import { useAuthUser } from './firebase/auth';
import { AgeScreen, GenderScreen, LanguageScreen, LoginScreen } from './screens/Onboarding';
import Home from './screens/Home';
import Search from './screens/Search';
import StoryDetail from './screens/StoryDetail';
import Profile from './screens/Profile';
import { Library } from './screens/Stubs';
import Community from './screens/Community';
import CreatePost from './screens/CreatePost';
import UserProfile from './screens/UserProfile';
import EditProfile from './screens/EditProfile';
import EditStory from './screens/EditStory';
import SeeAll from './screens/SeeAll';
import Brain from './screens/Brain';
import { Chats } from './screens/Chats';
import Chat from './screens/Chat';
import { AppHeader } from './components/AppHeader';
import { TabBar } from './components/TabBar';
import { colors } from './theme';
import { Empty, GradientButton } from './components/Ui';
import { warmVoice } from './voice/engine';
import { warmBrain, maybeStudy } from './brain/brain';
import { fetchUser, isAdmin } from './firebase/community';
import { getApiKey } from './ai/secure';
import type { User } from './firebase/auth';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: colors.bg, card: colors.bg, text: colors.text, border: colors.line, primary: colors.accent },
};

/** The Me tab: my own profile. Guests are asked to sign in. */
function Me({ user }: { user: User | null }) {
  const { update } = useSettings();
  if (user) return <UserProfile />;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: 'center', gap: 16 }}>
      <Empty icon="person-circle-outline" title="Sign in to see your profile" body="Your stories, likes and username live here." />
      <GradientButton title="Sign in" onPress={() => update({ guest: false })} />
    </View>
  );
}

function Tabs({ user }: { user: User | null }) {
  return (
    <Tab.Navigator
      tabBar={(props) => <TabBar {...props} user={user} />}
      screenOptions={{ header: () => <AppHeader /> }}
    >
      <Tab.Screen name="Home" component={Home} />
      <Tab.Screen name="Feed" component={Community} />
      <Tab.Screen name="Chats" component={Chats} />
      <Tab.Screen name="Me">{() => <Me user={user} />}</Tab.Screen>
    </Tab.Navigator>
  );
}

function Root() {
  const { s, loaded, update } = useSettings();
  const { user, ready } = useAuthUser();

  // A signed-in reader who already chose a gender on another phone does not have to choose again.
  const [genderChecked, setGenderChecked] = useState(false);
  useEffect(() => {
    if (!loaded || !ready) return;
    if (!user || s.gender) { setGenderChecked(true); return; }
    let live = true;
    fetchUser(user.uid).then((u) => { if (!live) return; if (u.gender) update({ gender: u.gender }); setGenderChecked(true); });
    return () => { live = false; };
  }, [loaded, ready, user?.uid, s.gender]);

  // Load the voice model while the app opens: it takes several seconds, so the first message does not wait for it.
  useEffect(() => { if (loaded && s.language) warmVoice(s.language, s.voices[s.language]); }, [loaded, s.language]);

  // Story lessons learned by the app (shared by everyone). Loaded from the phone cache first.
  useEffect(() => { warmBrain(); }, []);
  // Admin only: now and then the app studies a few pages of the saved novels, quietly, at most once every few hours.
  useEffect(() => {
    if (!loaded || !user) return;
    isAdmin(user.uid).then(async (a) => { if (a && s.provider.preset !== 'local') maybeStudy(s.provider, await getApiKey()); });
  }, [loaded, user?.uid]);

  if (!loaded || !ready || (!!user && !s.gender && !genderChecked)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!s.ageConfirmed) return <AgeScreen />;
  if (!user && !s.guest) return <LoginScreen />;
  if (!s.language) return <LanguageScreen />;
  if (!s.gender) return <GenderScreen />;

  return (
    <NavigationContainer theme={theme}>
      <Stack.Navigator screenOptions={{ headerStyle: { backgroundColor: colors.bg }, headerShadowVisible: false, headerTintColor: colors.text, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="Tabs" options={{ headerShown: false }}>
          {() => <Tabs user={user} />}
        </Stack.Screen>
        <Stack.Screen name="Search" component={Search} options={{ title: 'Search' }} />
        <Stack.Screen name="StoryDetail" component={StoryDetail} options={{ headerShown: false }} />
        <Stack.Screen name="Chat" component={Chat} options={{ headerShown: false }} />
        <Stack.Screen name="Profile" component={Profile} options={{ title: 'Settings' }} />
        <Stack.Screen name="Library" component={Library} />
        <Stack.Screen name="CreatePost" component={CreatePost} options={{ title: 'Post a story' }} />
        <Stack.Screen name="UserProfile" component={UserProfile} options={{ title: 'Profile' }} />
        <Stack.Screen name="SeeAll" component={SeeAll} options={({ route }: any) => ({ title: route.params?.title ?? 'Stories' })} />
        <Stack.Screen name="EditProfile" component={EditProfile} options={{ title: 'Edit profile' }} />
        <Stack.Screen name="EditStory" component={EditStory} options={{ title: 'Edit story' }} />
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
