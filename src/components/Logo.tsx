import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { gradients } from '../theme';

const H = [0.35, 0.7, 1, 0.6, 0.85, 0.4];

/** Placeholder mark: a waveform. The logo is still an open decision in the PRD. */
export function Logo({ size = 28 }: { size?: number }) {
  const w = Math.max(3, size / 9);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', height: size, gap: w * 0.7 }}>
      {H.map((h, i) => (
        <LinearGradient key={i} colors={gradients.primary} style={{ width: w, height: size * h, borderRadius: w }} />
      ))}
    </View>
  );
}
