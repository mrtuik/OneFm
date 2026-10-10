import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRoute } from '@react-navigation/native';
import { StoryTitle } from '../components/StoryCard';
import { Chip, GradientButton } from '../components/Ui';
import { colors } from '../theme';
import { LANG_LABEL, Story } from '../types';

export default function StoryDetail() {
  const { story } = useRoute<any>().params as { story: Story };
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      <LinearGradient colors={story.cover} style={s.cover}>
        <LinearGradient colors={['transparent', colors.bg]} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 120 }} />
      </LinearGradient>
      <View style={{ padding: 20, gap: 14, marginTop: -40 }}>
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
            <Text style={s.charName}>{c.name}</Text>
            <Text style={s.charRole}>{c.role}</Text>
          </View>
        ))}

        <Text style={s.h}>Episodes</Text>
        {story.episodes.map((e, i) => (
          <Text key={i} style={s.ep}>Ep {i + 1}: {e.goal}</Text>
        ))}

        <GradientButton title="Start chat (M2 te ashbe)" disabled onPress={() => {}} style={{ marginTop: 12 }} />
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  cover: { height: 240 },
  title: { color: colors.text, fontSize: 32, fontWeight: '800', fontFamily: 'serif' },
  logline: { color: colors.text, fontSize: 16, lineHeight: 24, opacity: 0.9 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  meta: { color: colors.sub, fontSize: 13 },
  h: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 10 },
  char: { padding: 14, borderRadius: 16, backgroundColor: colors.surface },
  charName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  charRole: { color: colors.sub, fontSize: 13, marginTop: 2 },
  ep: { color: colors.text, fontSize: 15, lineHeight: 22 },
});
