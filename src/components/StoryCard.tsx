import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, poster, radius, space } from '../theme';
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

/** hero = wide poster, tile = square poster in a horizontal row, row = small square poster in a list */
export type CardVariant = 'hero' | 'tile' | 'row';
interface Props { story: Story; onPress: () => void; variant?: CardVariant; label?: string }

export function StoryCard({ story, onPress, variant = 'tile', label }: Props) {
  const icon = GENRE_ICON[story.genres[0]] ?? 'book';
  const meta = `${story.episodes.length} episodes, ${story.readMin} min each`;

  if (variant === 'row') {
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [s.card, s.rowCard, { opacity: pressed ? 0.9 : 1 }]}>
        <View style={[s.rowCover, { backgroundColor: story.cover[0] }]}>
          <Ionicons name={icon} size={36} color="rgba(255,255,255,0.3)" />
        </View>
        <View style={s.rowBody}>
          <Text style={s.genre}>{story.genres[0]}</Text>
          <StoryTitle story={story} style={s.tileTitle} />
          <Text style={s.logline} numberOfLines={2}>{story.logline}</Text>
          <Text style={s.meta} numberOfLines={1}>{meta}</Text>
        </View>
      </Pressable>
    );
  }

  const hero = variant === 'hero';
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, hero ? { width: '100%' } : { width: poster.tileWidth }, { opacity: pressed ? 0.9 : 1 }]}>
      <View style={[s.cover, { backgroundColor: story.cover[0], aspectRatio: hero ? poster.wideRatio : 1 }]}>
        <Ionicons name={icon} size={hero ? 72 : 44} color="rgba(255,255,255,0.3)" />
        <View style={s.badges}>
          <View style={s.badge}><Text style={s.badgeText}>{story.genres[0]}</Text></View>
          {label ? <View style={[s.badge, { backgroundColor: colors.accent }]}><Text style={[s.badgeText, { color: colors.onAccent }]}>{label}</Text></View> : null}
        </View>
        {hero ? null : (
          <View style={[s.play, s.playOnCover]}><Ionicons name="play" size={14} color={colors.onAccent} style={{ marginLeft: 2 }} /></View>
        )}
      </View>
      <View style={s.body}>
        <StoryTitle story={story} style={hero ? s.heroTitle : s.tileTitle} />
        <Text style={s.logline} numberOfLines={2}>{story.logline}</Text>
        <View style={s.bottom}>
          <Text style={s.meta} numberOfLines={1}>{meta}</Text>
          {hero ? <View style={s.play}><Ionicons name="play" size={16} color={colors.onAccent} style={{ marginLeft: 2 }} /></View> : null}
        </View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: radius.card, overflow: 'hidden', backgroundColor: colors.surface },
  cover: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  badges: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  badge: { backgroundColor: colors.scrim, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  badgeText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  body: { padding: space.card, gap: 6 },
  heroTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
  tileTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  logline: { color: colors.sub, fontSize: 13, lineHeight: 18, minHeight: 36 },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 20 },
  meta: { color: colors.sub, fontSize: 12, flex: 1, paddingRight: 8 },
  genre: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  play: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  playOnCover: { position: 'absolute', right: 12, bottom: 12, width: 32, height: 32, borderRadius: 16 },
  rowCard: { flexDirection: 'row', padding: 12, gap: space.gap, alignItems: 'center' },
  rowCover: { width: poster.rowSize, height: poster.rowSize, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, gap: 4 },
});
