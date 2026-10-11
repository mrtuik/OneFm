import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

let n = 0;
/** Simple linear gradient drawn with SVG. `from` and `to` are CSS colors; opacity applies to each end. */
export function GradientView({ from, to, fromOpacity = 1, toOpacity = 1, diagonal, style, children }: {
  from: string; to: string; fromOpacity?: number; toOpacity?: number; diagonal?: boolean; style?: StyleProp<ViewStyle>; children?: React.ReactNode;
}) {
  const id = React.useRef(`g${n++}`).current;
  return (
    <View style={style}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2={diagonal ? '1' : '0'} y2="1">
            <Stop offset="0" stopColor={from} stopOpacity={fromOpacity} />
            <Stop offset="1" stopColor={to} stopOpacity={toOpacity} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      {children}
    </View>
  );
}
