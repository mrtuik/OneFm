import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';
import { Lang } from '../types';
import { estimateSeconds, hasVoice, openVoiceSettings, speak, stopSpeaking, subscribePlaying } from '../voice/engine';

const BARS = [6, 12, 8, 16, 10, 14, 6, 12, 18, 9, 13, 7, 15, 10, 6, 12, 17, 8, 11, 14, 7, 10, 16, 9];
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** Outlined voice message chip: play button, waveform, duration. Outline = the voice settings of the story world. */
export function VoiceChip({ id, text, lang, voiceId }: { id: string; text: string; lang: Lang; voiceId?: string }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [available, setAvailable] = useState<boolean | null>(null);
  const total = estimateSeconds(text);
  const started = useRef(0);

  useEffect(() => subscribePlaying((cur) => setPlaying(cur === id)), [id]);
  useEffect(() => { hasVoice(lang).then(setAvailable); }, [lang]);

  useEffect(() => {
    if (!playing) { setProgress(0); return; }
    started.current = Date.now();
    const t = setInterval(() => setProgress(Math.min(1, (Date.now() - started.current) / (total * 1000))), 120);
    return () => clearInterval(t);
  }, [playing, total]);

  if (available === false) {
    return (
      <Pressable onPress={openVoiceSettings} style={s.chip}>
        <Ionicons name="download-outline" size={18} color={colors.sub} />
        <Text style={s.missing}>Install a {lang === 'bn' ? 'Bangla' : 'Hindi'} voice to hear this</Text>
      </Pressable>
    );
  }

  const onPress = () => (playing ? stopSpeaking() : speak(id, text, lang, voiceId));
  const upto = Math.round(progress * BARS.length);

  return (
    <Pressable onPress={onPress} style={s.chip} accessibilityRole="button" accessibilityLabel={playing ? 'Stop voice' : 'Play voice'}>
      <View style={s.play}><Ionicons name={playing ? 'pause' : 'play'} size={14} color={colors.onAccent} style={playing ? undefined : { marginLeft: 1 }} /></View>
      <View style={s.wave}>
        {BARS.map((h, i) => <View key={i} style={{ width: 3, height: h, borderRadius: 2, backgroundColor: playing && i < upto ? colors.accent : colors.line }} />)}
      </View>
      <Text style={s.time}>{fmt(playing ? Math.round(progress * total) : total)}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'flex-start', paddingVertical: 8, paddingLeft: 8, paddingRight: 14, borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.line },
  play: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  wave: { flexDirection: 'row', alignItems: 'center', gap: 2.5, height: 20 },
  time: { color: colors.sub, fontSize: 12, fontVariant: ['tabular-nums'] },
  missing: { color: colors.sub, fontSize: 13 },
});
