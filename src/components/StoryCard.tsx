import React from 'react';
import { DimensionValue, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../theme';
import { Story } from '../types';
import { IconName } from './Ui';

export const GENRE_ICON: Record<string, IconName> = {
  Romance: 'heart', Thriller: 'eye', Horror: 'skull', Fantasy: 'sparkles', Campus: 'school',
};

export function StoryTitle({ story, style }: { story: Story; style?: object }) {
  const i = story.title.indexOf(story.highlight);
  if (i < 0 || !story.highlight) return <Text style={style}>{story.title}</Text>;
  return (
    <Text style={style}>
      {story.title.slice(0, i)}
      <Text style={{ color: colors.accent }}>{story.highlight}</Text>
      {story.title.slice(i + story.highlight.length)}
    </Text>
  );
}

interface Props { story: Story; onPress: () => void; width?: DimensionValue; height?: number; label?: string }

export function StoryCard({ story, onPress, width = 230, height = 290, label }: Props) {
  const large = height > 300;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, { width, height, opacity: pressed ? 0.9 : 1 }]}>
      <View style={[s.cover, { backgroundColor: story.cover[0] }]}>
        <Ionicons name={GENRE_ICON[story.genres[0]] ?? 'book'} size={large ? 72 : 48} color="rgba(255,255,255,0.28)" />
        <View style={s.badges}>
          <View style={s.badge}><Text style={s.badgeText}>{story.genres[0]}</Text></View>
          {label ? <View style={[s.badge, { backgroundColor: colors.accent }]}><Text style={[s.badgeText, { color: colors.onAccent }]}>{label}</Text></View> : null}
        </View>
      </View>
      <View style={s.body}>
        <StoryTitle story={story} style={[s.title, large && { fontSize: 22 }]} />
        <Text style={s.logline} numberOfLines={2}>{story.logline}</Text>
        <View style={s.bottom}>
          <Text style={s.meta} numberOfLines={1}>{story.episodes.length} episodes, {story.readMin} min each</Text>
          <View style={s.play}><Ionicons name="play" size={16} color={colors.onAccent} style={{ marginLeft: 2 }} /></View>
        </View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: radius.card, overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  cover: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  badges: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  badge: { backgroundColor: colors.scrim, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  badgeText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  body: { padding: 14, gap: 6 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  logline: { color: colors.sub, fontSize: 13, lineHeight: 18 },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  meta: { color: colors.sub, fontSize: 12, flex: 1, paddingRight: 8 },
  play: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
});
