import React from 'react';
import { Text, TextStyle } from 'react-native';

/** Narration is written between asterisks and shown in italics. Dialogue is normal text. */
export function RichText({ text, style }: { text: string; style: TextStyle }) {
  const parts = text.split(/(\*[^*]+\*)/g).filter(Boolean);
  return (
    <Text style={style}>
      {parts.map((p, i) =>
        p.startsWith('*') && p.endsWith('*') && p.length > 2
          ? <Text key={i} style={{ fontStyle: 'italic', opacity: 0.85 }}>{p.slice(1, -1)}</Text>
          : <Text key={i}>{p}</Text>
      )}
    </Text>
  );
}
