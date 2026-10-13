import React, { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';
import { Logo } from './Logo';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function GradientButton({ title, onPress, disabled, style, logo }: { title: string; onPress: () => void; disabled?: boolean; style?: ViewStyle; logo?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s.btn, disabled ? s.btnDisabled : { opacity: pressed ? 0.85 : 1 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {logo ? <Logo size={20} /> : null}
        <Text style={[s.btnText, disabled && { color: colors.sub }]}>{title}</Text>
      </View>
    </Pressable>
  );
}

/** Soft filled button (no outline). */
export function OutlineButton({ title, onPress, style, icon, logo }: { title: string; onPress: () => void; style?: ViewStyle; icon?: IconName; logo?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.outline, pressed && { backgroundColor: '#1F1A1A' }, style]}>
      {logo ? <Logo size={20} /> : icon ? <Ionicons name={icon} size={20} color={colors.text} /> : null}
      <Text style={s.outlineText}>{title}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && { backgroundColor: colors.accentSoft }]}>
      <Text style={[s.chipText, active && { color: colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

export function Empty({ title, body, icon }: { title: string; body: string; icon?: IconName }) {
  return (
    <View style={s.empty}>
      {icon ? <Ionicons name={icon} size={40} color={colors.sub} style={{ marginBottom: 12 }} /> : null}
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptyBody}>{body}</Text>
    </View>
  );
}

export function BackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={s.back} accessibilityRole="button" accessibilityLabel="Back">
      <Ionicons name="arrow-back" size={22} color={colors.text} />
    </Pressable>
  );
}

export function Screen({ children }: { children: ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: colors.bg }}>{children}</View>;
}

const s = StyleSheet.create({
  btn: { height: 52, borderRadius: radius.btn, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  btnDisabled: { backgroundColor: colors.surface },
  btnText: { color: colors.onAccent, fontSize: 16, fontWeight: '700' },
  outline: { height: 52, borderRadius: radius.btn, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  outlineText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  chip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.chip, backgroundColor: colors.surface },
  chipText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  back: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  emptyBody: { color: colors.sub, fontSize: 14, lineHeight: 20, textAlign: 'center' },
});
