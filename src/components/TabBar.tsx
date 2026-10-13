import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatIcon, HomeIcon } from './Icons';
import { UserAvatar } from './UserAvatar';
import { colors, TAB_BAR_HEIGHT } from '../theme';
import type { User } from '../firebase/auth';

const ICON = 26;
const BAR = '#141010';

/** Icons only, like Snapchat: a slightly lighter bar with a thin line on top. Home, Feed, Chats, Me (my profile). */
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
        else if (route.name === 'Feed') icon = <Ionicons name={focused ? 'newspaper' : 'newspaper-outline'} size={ICON - 2} color={color} />;
        else if (route.name === 'Chats') icon = <ChatIcon size={ICON - 4} color={color} cut={BAR} />;
        else icon = (
          <View style={[s.ring, focused && { borderColor: colors.accent }]}>
            <UserAvatar user={user} size={24} active={focused} />
          </View>
        );
        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            android_ripple={null}
            accessibilityRole="button"
            accessibilityLabel={route.name}
            accessibilityState={{ selected: focused }}
            style={s.item}
          >
            <View style={s.iconBox}>{icon}</View>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', backgroundColor: BAR, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  item: { flex: 1, alignItems: 'center' },
  iconBox: { height: 32, alignItems: 'center', justifyContent: 'center' },
  ring: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
});
