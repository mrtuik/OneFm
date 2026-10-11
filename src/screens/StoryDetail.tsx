import React from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GENRE_ICON, StoryTitle } from '../components/StoryCard';
import { Chip, GradientButton } from '../components/Ui';
import { colors, poster, radius, space } from '../theme';
import { LANG_LABEL, Story } from '../types';

const HEADER_HEIGHT = 56;

export default function StoryDetail() {
  const { story } = useRoute<any>().params as { story: Story };
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // The header floats over the poster, so the poster extends under it and the visible part keeps the shared 16:10 size.
  const top = insets.top + HEADER_HEIGHT;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingBottom: insets.bottom + space.section }}>
      <View style={[s.cover, { height: width / poster.wideRatio + top, paddingTop: top, backgroundColor: story.cover[0] }]}>
        <Ionicons name={GENRE_ICON[story.genres[0]] ?? 'book'} size={72} color="rgba(255,255,255,0.3)" />
      </View>

      <View style={s.content}>
        <View style={s.block}>
          <StoryTitle story={story} style={s.title} />
          <Text style={s.logline}>{story.logline}</Text>
          <View style={s.row}>
            {story.genres.map((g) => <Chip key={g} label={g} />)}
            <Chip label={LANG_LABEL[story.language]} />
          </View>
          <Text style={s.meta}>
            By {story.creatorName}  ·  {story.episodes.length} episodes  ·  {story.likeCount} likes  ·  {story.playCount} plays
          </Text>
        </View>

        <View style={s.block}>
          <Text style={s.h}>Characters</Text>
          {story.characters.map((c) => (
            <View key={c.name} style={s.item}>
              <Ionicons name="person-circle-outline" size={32} color={colors.sub} />
              <View style={{ flex: 1 }}>
                <Text style={s.itemTitle}>{c.name}</Text>
                <Text style={s.itemSub}>{c.role}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={s.block}>
          <Text style={s.h}>Episodes</Text>
          {story.episodes.map((e, i) => (
            <View key={i} style={s.item}>
              <View style={s.epNum}><Text style={s.epNumText}>{i + 1}</Text></View>
              <Text style={s.ep}>{e.goal}</Text>
            </View>
          ))}
        </View>

        <View style={{ gap: 8 }}>
          <GradientButton title="Start chat" disabled onPress={() => {}} />
          <Text style={s.hint}>Chat is coming soon.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  cover: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  content: { padding: space.screen, gap: space.section },
  block: { gap: space.gap },
  title: { color: colors.text, fontSize: 28, fontWeight: '800' },
  logline: { color: colors.text, fontSize: 16, lineHeight: 24, opacity: 0.9 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  meta: { color: colors.sub, fontSize: 13, lineHeight: 20 },
  h: { color: colors.text, fontSize: 20, fontWeight: '800' },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.gap, padding: space.card, borderRadius: radius.card, backgroundColor: colors.surface },
  itemTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  itemSub: { color: colors.sub, fontSize: 13, marginTop: 2 },
  epNum: { width: 32, height: 32, borderRadius: radius.inner, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  epNumText: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  ep: { color: colors.text, fontSize: 15, lineHeight: 22, flex: 1 },
  hint: { color: colors.sub, fontSize: 12, textAlign: 'center' },
});
