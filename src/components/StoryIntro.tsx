import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Cover } from './Cover';
import { colors, radius } from '../theme';
import { Story } from '../types';

/**
 * Top of every chat, like a series page: "Powered by AI", the cover, About Story, genres, and the characters.
 * The reader sees who is in the story before the first scene starts.
 */
export function StoryIntro({ story, myRole }: { story: Story; myRole?: string }) {
  const playing = myRole && myRole !== 'You' ? story.characters.find((c) => c.name === myRole) : undefined;
  return (
    <View style={s.wrap}>
      <Text style={s.powered}>Powered by AI</Text>
      <View style={s.card}>
        <Cover story={story} style={s.cover} iconSize={56} />
        <View style={s.body}>
          <Text style={s.heading}>About Story</Text>
          <Text style={s.title}>{story.title}</Text>
          <Text style={s.logline}>{story.logline}</Text>
          {story.genres.length ? (
            <View style={s.chips}>
              {story.genres.map((g) => <View key={g} style={s.chip}><Text style={s.chipText}>{g}</Text></View>)}
            </View>
          ) : null}
          {story.characters.length ? (
            <>
              <Text style={s.sub}>Characters</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.people}>
                {story.characters.map((c) => (
                  <View key={c.name} style={s.person}>
                    <View style={[s.dot, c.name === playing?.name && s.dotYou]}><Text style={s.initial}>{c.name.charAt(0).toUpperCase()}</Text></View>
                    <Text style={s.name} numberOfLines={1}>{c.name}</Text>
                    <Text style={s.role} numberOfLines={2}>{c.role}</Text>
                  </View>
                ))}
              </ScrollView>
            </>
          ) : null}
          {playing ? <Text style={s.you}>You play {playing.name}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { gap: 12, marginBottom: 6 },
  powered: { color: colors.sub, fontSize: 12, textAlign: 'center' },
  card: { borderRadius: radius.card, backgroundColor: colors.surface, overflow: 'hidden' },
  cover: { height: 170, width: '100%' },
  body: { padding: 16, gap: 8 },
  heading: { color: colors.sub, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { color: colors.text, fontSize: 20, fontWeight: '800' },
  logline: { color: colors.text, fontSize: 15, lineHeight: 22 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(254,244,244,0.08)' },
  chipText: { color: colors.sub, fontSize: 12, fontWeight: '600' },
  sub: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 8 },
  people: { gap: 14, paddingVertical: 4 },
  person: { width: 84, alignItems: 'center', gap: 4 },
  dot: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  dotYou: { backgroundColor: colors.accent },
  initial: { color: colors.text, fontSize: 20, fontWeight: '800' },
  name: { color: colors.text, fontSize: 13, fontWeight: '700' },
  role: { color: colors.sub, fontSize: 11, textAlign: 'center', lineHeight: 14 },
  you: { color: colors.accent, fontSize: 13, fontWeight: '700', marginTop: 4 },
});
