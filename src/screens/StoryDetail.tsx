import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import { GENRE_ICON, StoryTitle } from '../components/StoryCard';
import { Chip, GradientButton } from '../components/Ui';
import { colors, radius } from '../theme';
import { LANG_LABEL, Story } from '../types';

export default function StoryDetail() {
  const { story } = useRoute<any>().params as { story: Story };
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[s.cover, { backgroundColor: story.cover[0] }]}>
        <Ionicons name={GENRE_ICON[story.genres[0]] ?? 'book'} size={84} color="rgba(255,255,255,0.28)" />
      </View>
      <View style={{ padding: 20, gap: 14 }}>
        <StoryTitle story={story} style={s.title} />
        <Text style={s.logline}>{story.logline}</Text>
        <View style={s.row}>
          {story.genres.map((g) => <Chip key={g} label={g} />)}
          <Chip label={LANG_LABEL[story.language]} />
        </View>
        <Text style={s.meta}>By {story.creatorName}. {story.episodes.length} episodes. {story.likeCount} likes, {story.playCount} plays.</Text>

        <Text style={s.h}>Characters</Text>
        {story.characters.map((c) => (
          <View key={c.name} style={s.char}>
            <Ionicons name="person-circle-outline" size={30} color={colors.sub} />
            <View style={{ flex: 1 }}>
              <Text style={s.charName}>{c.name}</Text>
              <Text style={s.charRole}>{c.role}</Text>
            </View>
          </View>
        ))}

        <Text style={s.h}>Episodes</Text>
        {story.episodes.map((e, i) => (
          <View key={i} style={s.char}>
            <Text style={s.epNum}>{i + 1}</Text>
            <Text style={s.ep}>{e.goal}</Text>
          </View>
        ))}

        <GradientButton title="Start chat (M2 te ashbe)" disabled onPress={() => {}} style={{ marginTop: 12 }} />
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  cover: { height: 220, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
  logline: { color: colors.text, fontSize: 16, lineHeight: 24, opacity: 0.9 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  meta: { color: colors.sub, fontSize: 13 },
  h: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 10 },
  char: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.card - 2, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  charName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  charRole: { color: colors.sub, fontSize: 13, marginTop: 2 },
  epNum: { color: colors.accent, fontSize: 16, fontWeight: '800', width: 22, textAlign: 'center' },
  ep: { color: colors.text, fontSize: 15, lineHeight: 22, flex: 1 },
});
