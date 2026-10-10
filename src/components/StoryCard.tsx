import React from 'react';
import { DimensionValue, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradients, radius } from '../theme';
import { Story } from '../types';

export function StoryTitle({ story, style }: { story: Story; style?: object }) {
  const i = story.title.indexOf(story.highlight);
  if (i < 0 || !story.highlight) return <Text style={style}>{story.title}</Text>;
  return (
    <Text style={style}>
      {story.title.slice(0, i)}
      <Text style={{ color: colors.amber }}>{story.highlight}</Text>
      {story.title.slice(i + story.highlight.length)}
    </Text>
  );
}

interface Props { story: Story; onPress: () => void; width?: DimensionValue; height?: number; label?: string }

export function StoryCard({ story, onPress, width = 230, height = 290, label }: Props) {
  return (
    <Pressable onPress={onPress} style={{ width, height }}>
      <LinearGradient colors={gradients.border} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.border}>
        <View style={s.inner}>
          <LinearGradient colors={story.cover} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={['transparent', 'rgba(11,11,16,0.94)']} locations={[0.25, 1]} style={StyleSheet.absoluteFill} />
          <View style={s.content}>
            <View style={s.top}>
              <View style={s.glass}><Text style={s.glassText}>{story.genres[0]}</Text></View>
              {label ? <View style={[s.glass, { backgroundColor: colors.rose }]}><Text style={[s.glassText, { color: '#1A0B10' }]}>{label}</Text></View> : null}
            </View>
            <View>
              <StoryTitle story={story} style={s.title} />
              <Text style={s.logline} numberOfLines={1}>{story.logline}</Text>
              <View style={s.bottom}>
                <Text style={s.meta}>{story.episodes.length} episodes, about {story.readMin} min each</Text>
                <LinearGradient colors={gradients.primary} style={s.play}>
                  <Text style={s.playIcon}>{'\u25B6'}</Text>
                </LinearGradient>
              </View>
            </View>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const s = StyleSheet.create({
  border: { flex: 1, borderRadius: radius.card, padding: 1.5 },
  inner: { flex: 1, borderRadius: radius.card - 1.5, overflow: 'hidden', backgroundColor: colors.surface },
  content: { flex: 1, padding: 14, justifyContent: 'space-between' },
  top: { flexDirection: 'row', justifyContent: 'space-between' },
  glass: { backgroundColor: colors.glass, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  glassText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  title: { color: colors.text, fontSize: 22, fontWeight: '800', fontFamily: 'serif', marginBottom: 4 },
  logline: { color: 'rgba(242,242,247,0.8)', fontSize: 12 },
  bottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  meta: { color: colors.sub, fontSize: 11, flex: 1, paddingRight: 8 },
  play: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  playIcon: { color: '#1A0B10', fontSize: 14, marginLeft: 2 },
});
