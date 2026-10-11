import React from 'react';
import { View } from 'react-native';
import { colors } from '../theme';

const H = [0.35, 0.7, 1, 0.6, 0.85, 0.4];

/** Placeholder mark: a flat waveform. The logo is still an open decision in the PRD. */
export function Logo({ size = 28 }: { size?: number }) {
  const w = Math.max(3, size / 9);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: size, gap: w * 0.7 }}>
      {H.map((h, i) => (
        <View key={i} style={{ width: w, height: size * h, borderRadius: w, backgroundColor: colors.accent }} />
      ))}
    </View>
  );
}
