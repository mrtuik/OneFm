import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Logo } from './Logo';
import { colors } from '../theme';

export function AppHeader() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.bar, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={() => nav.navigate('Profile')} style={s.avatar} hitSlop={8}>
        <Ionicons name="person-outline" size={20} color={colors.text} />
      </Pressable>
      <View style={s.center}>
        <Logo size={20} />
        <Text style={s.title}>One Fm</Text>
      </View>
      <Pressable onPress={() => nav.navigate('Library')} style={s.lib} hitSlop={8}>
        <Ionicons name="library-outline" size={24} color={colors.text} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10, backgroundColor: colors.bg },
  avatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  lib: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  center: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: colors.text, fontSize: 18, fontWeight: '800', letterSpacing: 0.3 },
});
