import React from 'react';
import { Dimensions, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Cover } from '../components/Cover';
import { compact } from '../format';
import { colors, radius, space } from '../theme';
import { Story } from '../types';

const GAP = 12;
const W = Math.floor((Dimensions.get('window').width - space.screen * 2 - GAP) / 2);

/** Every story of a Home section as a two column grid of square covers. Trending shows the rank on each cover. */
export default function SeeAll() {
  const { stories, ranked } = useRoute<any>().params as { title: string; stories: Story[]; ranked?: boolean };
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  return (
    <FlatList
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: space.screen, gap: space.section - 4, paddingBottom: insets.bottom + space.section }}
      columnWrapperStyle={{ gap: GAP }}
      numColumns={2}
      data={stories}
      keyExtractor={(i) => i.id}
      ListHeaderComponent={<Text style={s.count}>{stories.length} {stories.length === 1 ? 'story' : 'stories'}</Text>}
      renderItem={({ item, index }) => (
        <Pressable onPress={() => nav.navigate('StoryDetail', { story: item })} style={({ pressed }) => [{ width: W, opacity: pressed ? 0.85 : 1 }]}>
          <Cover story={item} iconSize={44} style={{ width: W, height: W, borderRadius: radius.card }}>
            <View style={s.genre}><Text style={s.genreText}>{item.genres[0]}</Text></View>
            {ranked ? <View style={s.rank}><Text style={s.rankText}>#{index + 1}</Text></View> : null}
          </Cover>
          <Text style={s.title} numberOfLines={2}>{item.title}</Text>
          <View style={s.meta}>
            <Ionicons name="play" size={10} color={colors.sub} />
            <Text style={s.metaText} numberOfLines={1}>{compact(item.playCount)} Plays  ·  {item.episodes.length} ep</Text>
          </View>
        </Pressable>
      )}
    />
  );
}

const s = StyleSheet.create({
  count: { color: colors.sub, fontSize: 13, marginBottom: 4 },
  genre: { position: 'absolute', left: 10, bottom: 10, backgroundColor: colors.scrim, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.badge },
  genreText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  rank: { position: 'absolute', left: 10, top: 10, minWidth: 34, alignItems: 'center', backgroundColor: colors.accent, paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.badge },
  rankText: { color: colors.onAccent, fontSize: 13, fontWeight: '800' },
  title: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 10, lineHeight: 20 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  metaText: { color: colors.sub, fontSize: 12, flexShrink: 1 },
});
