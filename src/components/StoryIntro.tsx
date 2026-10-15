import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Cover } from './Cover';
import { colors, radius } from '../theme';
import { Story } from '../types';

const COVER = 116;
const TILE = 40;

/**
 * Top of every chat. Left: a small square cover. Right: the title, the creator's name and the characters
 * (small squares). Below both: the About text, genres and the role the reader plays.
 */
export function StoryIntro({ story, myRole }: { story: Story; myRole?: string }) {
  const playing = myRole && myRole !== 'You' ? story.characters.find((c) => c.name === myRole) : undefined;
  return (
    <View style={s.card}>
      <View style={s.top}>
        <Cover story={story} style={s.cover} iconSize={40} />
        <View style={s.side}>
          <Text style={s.title} numberOfLines={2}>{story.title}</Text>
          {story.creatorName ? <Text style={s.creator} numberOfLines={1}>by {story.creatorName}</Text> : null}
          {story.characters.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.people} style={s.peopleScroll}>
              {story.characters.map((c) => (
                <View key={c.name} style={s.person}>
                  <View style={[s.tile, c.name === playing?.name && s.tileYou]}>
                    <Text style={s.initial}>{c.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <Text style={s.name} numberOfLines={1}>{c.name}</Text>
                </View>
              ))}
            </ScrollView>
          ) : null}
        </View>
      </View>

      <View style={s.about}>
        <Text style={s.heading}>About</Text>
        <Text style={s.logline}>{story.logline}</Text>
        {story.genres.length ? (
          <View style={s.chips}>
            {story.genres.map((g) => <View key={g} style={s.chip}><Text style={s.chipText}>{g}</Text></View>)}
          </View>
        ) : null}
        {playing ? <Text style={s.you}>You play {playing.name}</Text> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: radius.card, backgroundColor: colors.surface, padding: 14, gap: 14, marginBottom: 6 },
  top: { flexDirection: 'row', gap: 14 },
  cover: { width: COVER, height: COVER, borderRadius: 14 },
  side: { flex: 1, minHeight: COVER, justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: 18, fontWeight: '800', lineHeight: 23 },
  creator: { color: colors.sub, fontSize: 12, marginTop: 2 },
  peopleScroll: { flexGrow: 0, marginTop: 8 },
  people: { gap: 8 },
  person: { width: TILE + 8, alignItems: 'center', gap: 3 },
  tile: { width: TILE, height: TILE, borderRadius: 10, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  tileYou: { backgroundColor: colors.accent },
  initial: { color: colors.text, fontSize: 16, fontWeight: '800' },
  name: { color: colors.sub, fontSize: 10, fontWeight: '600' },
  about: { gap: 6 },
  heading: { color: colors.sub, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  logline: { color: colors.text, fontSize: 15, lineHeight: 22 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: 'rgba(254,244,244,0.08)' },
  chipText: { color: colors.sub, fontSize: 12, fontWeight: '600' },
  you: { color: colors.accent, fontSize: 13, fontWeight: '700', marginTop: 2 },
});
