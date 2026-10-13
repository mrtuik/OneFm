import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChatIcon, HomeIcon, SearchIcon } from './Icons';
import { UserAvatar } from './UserAvatar';
import { colors, TAB_BAR_HEIGHT } from '../theme';
import type { User } from '../firebase/auth';

const ICON = 26;

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
        else if (route.name === 'Chats') icon = <ChatIcon size={ICON} color={color} cut={colors.bg} />;
        else icon = (
          <View style={s.ring}>
            <UserAvatar user={user} size={26} active={focused} />
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
  bar: { flexDirection: 'row', backgroundColor: colors.bg, paddingTop: 14 },
  item: { flex: 1, alignItems: 'center' },
  iconBox: { height: 32, alignItems: 'center', justifyContent: 'center' },
  ring: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
