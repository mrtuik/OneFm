import React from 'react';
import { Image, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';
import type { User } from '../firebase/auth';

export function UserAvatar({ user, size, active }: { user: User | null; size: number; active?: boolean }) {
  const r = size / 2;
  if (user?.photoURL) {
    return <Image source={{ uri: user.photoURL }} style={{ width: size, height: size, borderRadius: r }} />;
  }
  const initial = (user?.displayName ?? user?.email ?? '').trim().charAt(0).toUpperCase();
  const fg = active ? colors.onAccent : colors.sub;
  return (
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: active ? colors.accent : colors.surface, alignItems: 'center', justifyContent: 'center' }}>
      {initial ? (
        <Text style={{ color: active ? colors.onAccent : colors.text, fontSize: size * 0.45, fontWeight: '800' }}>{initial}</Text>
      ) : (
        <Ionicons name="person" size={size * 0.55} color={fg} />
      )}
    </View>
  );
}
