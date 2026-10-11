import React from 'react';
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
import { Chats, Community, Library } from './screens/Stubs';
import { AppHeader } from './components/AppHeader';
import { TabBar } from './components/TabBar';
import { BackButton } from './components/Ui';
import { colors } from './theme';
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
        <Stack.Screen
          name="StoryDetail"
          component={StoryDetail}
          options={({ navigation }) => ({
            title: '',
            presentation: 'modal',
            headerTransparent: true,
            headerShadowVisible: false,
            headerLeft: () => <BackButton onPress={() => navigation.goBack()} />,
          })}
        />
        <Stack.Screen name="Profile" component={Profile} />
        <Stack.Screen name="Library" component={Library} />
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
