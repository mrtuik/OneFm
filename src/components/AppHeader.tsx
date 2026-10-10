import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
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
        <Text style={s.glyph}>{'\u263A'}</Text>
      </Pressable>
      <View style={s.center}>
        <Logo size={22} />
        <Text style={s.title}>One Fm</Text>
      </View>
      <Pressable onPress={() => nav.navigate('Library')} style={s.lib} hitSlop={8}>
        <Text style={s.glyph}>{'\u2630'}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10, backgroundColor: colors.bg },
  avatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  lib: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  glyph: { color: colors.text, fontSize: 18 },
  center: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { color: colors.text, fontSize: 18, fontWeight: '800', fontFamily: 'serif' },
});
