import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatIcon, HomeIcon, SearchIcon } from './Icons';
import { colors, TAB_BAR_HEIGHT } from '../theme';
import type { User } from '../firebase/auth';

const ICON = 26;

function Avatar({ user, focused }: { user: User | null; focused: boolean }) {
  const ring = focused ? colors.accent : 'transparent';
  const initial = (user?.displayName ?? user?.email ?? '').trim().charAt(0).toUpperCase();
  return (
    <View style={[s.avatarRing, { borderColor: ring }]}>
      {user?.photoURL ? (
        <Image source={{ uri: user.photoURL }} style={s.avatarImg} />
      ) : (
        <View style={[s.avatarImg, s.avatarFallback, focused && { backgroundColor: colors.accent }]}>
          {initial ? (
            <Text style={[s.initial, focused && { color: colors.onAccent }]}>{initial}</Text>
          ) : (
            <Ionicons name="person" size={16} color={focused ? colors.onAccent : colors.sub} />
          )}
        </View>
      )}
    </View>
  );
}

export function TabBar({ state, navigation, user }: BottomTabBarProps & { user: User | null }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.bar, { height: TAB_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const color = focused ? colors.accent : colors.sub;
        const onPress = () => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name as never);
        };
        let icon: React.ReactNode;
        if (route.name === 'Home') icon = <HomeIcon size={ICON} color={color} />;
        else if (route.name === 'Search') icon = <SearchIcon size={ICON} color={color} />;
        else if (route.name === 'Chats') icon = <ChatIcon size={ICON} color={color} />;
        else icon = <Avatar user={user} focused={focused} />;
        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={route.name}
            accessibilityState={{ selected: focused }}
            style={s.item}
          >
            <View style={[s.pill, focused && { backgroundColor: colors.accentSoft }]}>{icon}</View>
            <Text style={[s.label, { color }, focused && { fontWeight: '800' }]}>{route.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: colors.bg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 10 },
  item: { flex: 1, alignItems: 'center', gap: 4 },
  pill: { width: 60, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: '600' },
  avatarRing: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 26, height: 26, borderRadius: 13 },
  avatarFallback: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  initial: { color: colors.text, fontSize: 13, fontWeight: '800' },
});
