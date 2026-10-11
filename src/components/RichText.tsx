import React from 'react';
import { Text, TextStyle, View } from 'react-native';
import { colors } from '../theme';

/**
 * Story chat text. Every line is its own paragraph.
 * Narration is written between asterisks and shown in light gray italics.
 * Dialogue is white. A leading "Name:" is shown in bold.
 */
export function RichText({ text, style }: { text: string; style: TextStyle }) {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  const gap = Math.round((style.fontSize ?? 16) * 0.75);
  return (
    <View style={{ gap }}>
      {lines.map((line, i) => <Line key={i} line={line} style={style} />)}
    </View>
  );
}

function Line({ line, style }: { line: string; style: TextStyle }) {
  const parts = line.split(/(\*[^*]+\*)/g).filter(Boolean);
  return (
    <Text style={style}>
      {parts.map((p, i) => {
        if (p.length > 2 && p.startsWith('*') && p.endsWith('*')) {
          return <Text key={i} style={{ fontStyle: 'italic', color: colors.narration }}>{p.slice(1, -1).trim()}</Text>;
        }
        const clean = p.replace(/\*/g, '');
        const m = i === 0 ? clean.match(/^\s*([^:"\u201C\u201D\n]{1,30}):\s*([\s\S]*)$/) : null;
        if (m) return <Text key={i}><Text style={{ fontWeight: '700' }}>{m[1]}: </Text>{m[2]}</Text>;
        return <Text key={i}>{clean}</Text>;
      })}
    </Text>
  );
}
