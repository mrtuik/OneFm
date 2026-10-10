import React, { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius } from '../theme';

export function GradientButton({ title, onPress, disabled, style }: { title: string; onPress: () => void; disabled?: boolean; style?: ViewStyle }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[{ opacity: disabled ? 0.4 : 1 }, style]}>
      <LinearGradient colors={gradients.primary} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.btn}>
        <Text style={s.btnText}>{title}</Text>
      </LinearGradient>
    </Pressable>
  );
}

/** Outline = you. Anything that belongs to the user is drawn as an outline. */
export function OutlineButton({ title, onPress, style }: { title: string; onPress: () => void; style?: ViewStyle }) {
  return (
    <Pressable onPress={onPress} style={[s.outline, style]}>
      <Text style={s.outlineText}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && { borderColor: colors.amber }]}>
      <Text style={[s.chipText, active && { color: colors.amber }]}>{label}</Text>
    </Pressable>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptyBody}>{body}</Text>
    </View>
  );
}

export function Screen({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>{children}</View>;
}

const s = StyleSheet.create({
  btn: { height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#1A0B10', fontSize: 16, fontWeight: '700' },
  outline: { height: 52, borderRadius: 26, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  outlineText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.chip, borderWidth: 1.5, borderColor: colors.line },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptyBody: { color: colors.sub, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
