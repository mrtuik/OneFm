import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, poster, radius, space } from '../theme';
import { Story } from '../types';
import { Cover } from './Cover';
import { GENRE_ICON } from './genreIcon';
import { GradientView } from './GradientView';
import { ChatIcon } from './Icons';

export { GENRE_ICON };

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

/** Small round "chat with" button (the smile bubble from the Chats tab). Bottom right of every card. */
function ChatButton({ size = 34, style }: { size?: number; style?: object }) {
  return (
    <View style={[s.play, { width: size, height: size, borderRadius: size / 2 }, style]}>
      <ChatIcon size={Math.round(size * 0.5)} color={colors.onAccent} cut={colors.accent} />
    </View>
  );
}

/** hero = wide poster, tile = square poster in a horizontal row, row = small square poster in a list */
export type CardVariant = 'hero' | 'tile' | 'row';
interface Props { story: Story; onPress: () => void; onLongPress?: () => void; variant?: CardVariant; label?: string }

export function StoryCard({ story, onPress, onLongPress, variant = 'tile', label }: Props) {
  const meta = `${story.episodes.length} episodes, ${story.readMin} min each`;

  if (variant === 'row') {
    const tags = story.genres.slice(0, 2);
    return (
      <Pressable onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [s.card, s.rowCard, { opacity: pressed ? 0.9 : 1 }]}>
        {/* Cover sits on a plate tinted with the story's own colors. */}
        <GradientView from={story.cover[0]} to={story.cover[1]} fromOpacity={0.55} toOpacity={0.2} diagonal style={s.plate}>
          <Cover story={story} iconSize={30} style={s.rowCover} />
        </GradientView>
        <View style={s.rowBody}>
          <StoryTitle story={story} style={s.tileTitle} />
          <Text style={s.logline} numberOfLines={2}>{story.logline}</Text>
          <View style={s.bottom}>
            <Text style={s.meta} numberOfLines={1}>{meta}</Text>
            <ChatButton size={32} />
          </View>
        </View>
        {/* Tags are glued to the top right corner of the card. */}
        <View style={s.tags} pointerEvents="none">
          {tags.map((g, i) => (
            <View key={g} style={[s.tag, i === 0 ? s.tagMain : s.tagSub, i === tags.length - 1 && s.tagLast]}>
              <Text style={[s.tagText, i > 0 && { color: colors.text }]}>{g.toUpperCase()}</Text>
            </View>
          ))}
        </View>
      </Pressable>
    );
  }

  const hero = variant === 'hero';
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [s.card, hero ? { width: '100%' } : { width: poster.tileWidth }, { opacity: pressed ? 0.9 : 1 }]}>
      <Cover story={story} iconSize={hero ? 72 : 44} style={[s.cover, { aspectRatio: hero ? poster.wideRatio : 1 }]}>
        <View style={s.badges}>
          <View style={s.badge}><Text style={s.badgeText}>{story.genres[0]}</Text></View>
          {label ? <View style={[s.badge, { backgroundColor: colors.accent }]}><Text style={[s.badgeText, { color: colors.onAccent }]}>{label}</Text></View> : null}
        </View>
        {hero ? null : (
          <ChatButton size={32} style={s.playOnCover} />
        )}
      </Cover>
      <View style={s.body}>
        <StoryTitle story={story} style={hero ? s.heroTitle : s.tileTitle} />
        <Text style={s.logline} numberOfLines={2}>{story.logline}</Text>
        <View style={s.bottom}>
          <Text style={s.meta} numberOfLines={1}>{meta}</Text>
          {hero ? <ChatButton size={36} /> : null}
        </View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: radius.card, overflow: 'hidden', backgroundColor: colors.surface },
  cover: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  badges: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  badge: { backgroundColor: colors.scrim, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.badge },
  badgeText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  body: { padding: space.card, gap: 6 },
  heroTitle: { color: colors.text, fontSize: 22, fontWeight: '700' },
  tileTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  logline: { color: colors.sub, fontSize: 13, lineHeight: 18, minHeight: 36 },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 20 },
  meta: { color: colors.sub, fontSize: 12, flex: 1, paddingRight: 8 },
  play: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  playOnCover: { position: 'absolute', right: 12, bottom: 12, width: 32, height: 32, borderRadius: 16 },
  rowCard: { flexDirection: 'row', padding: 10, gap: space.gap, alignItems: 'stretch' },
  plate: { width: poster.rowPlate, height: poster.rowPlate, borderRadius: radius.inner, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  rowCover: { width: poster.rowPlate - 24, height: poster.rowPlate - 24, borderRadius: radius.inner },
  rowBody: { flex: 1, gap: 4, paddingTop: 22, paddingRight: 2, justifyContent: 'space-between' },
  tags: { position: 'absolute', top: 0, right: 0, flexDirection: 'row' },
  tag: { paddingHorizontal: 10, paddingVertical: 5 },
  tagMain: { backgroundColor: colors.accent },
  tagSub: { backgroundColor: '#2A2323' },
  tagLast: { borderTopRightRadius: radius.card, borderBottomLeftRadius: radius.inner + 2 },
  tagText: { color: colors.onAccent, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
});
