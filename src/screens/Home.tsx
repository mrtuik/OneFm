import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StoryCard } from '../components/StoryCard';
import { colors, poster, radius, space } from '../theme';
import { GENRES, Story } from '../types';
import { fetchStories } from '../firebase/db';
import { useSettings } from '../state/settings';

function Skeleton() {
  return (
    <View style={{ padding: space.screen, gap: space.section }}>
      <View style={[s.skel, { width: '100%', aspectRatio: poster.wideRatio }]} />
      <View style={{ flexDirection: 'row', gap: space.gap }}>
        <View style={[s.skel, { width: poster.tileWidth, height: poster.tileWidth + 100 }]} />
        <View style={[s.skel, { width: poster.tileWidth, height: poster.tileWidth + 100 }]} />
      </View>
    </View>
  );
}

export default function Home() {
  const nav = useNavigation<any>();
  const { s: st } = useSettings();
  const [stories, setStories] = useState<Story[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => setStories(await fetchStories()), []);
  useEffect(() => { load(); }, [load]);

  const { hero, rows } = useMemo(() => {
    if (!stories) return { hero: null as Story | null, rows: [] as { title: string; label?: string; items: Story[] }[] };
    const mine = (x: Story) => (x.language === st.language ? 0 : 1);
    const byPlays = [...stories].sort((a, b) => mine(a) - mine(b) || b.playCount - a.playCount);
    const rows = [
      { title: 'Top 10', label: 'Top 10', items: [...stories].sort((a, b) => b.likeCount - a.likeCount).slice(0, 10) },
      { title: 'New', label: 'New', items: [...stories].sort((a, b) => b.createdAt - a.createdAt) },
      ...GENRES.map((g) => ({ title: g, label: undefined, items: stories.filter((x) => x.genres.includes(g)) })),
    ].filter((r) => r.items.length > 0);
    return { hero: byPlays[0] ?? null, rows };
  }, [stories, st.language]);

  const open = (story: Story) => nav.navigate('StoryDetail', { story });

  if (!stories) return <View style={{ flex: 1, backgroundColor: colors.bg }}><Skeleton /></View>;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: space.section }}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.accent} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      {hero ? (
        <View style={{ padding: space.screen }}>
          <StoryCard story={hero} variant="hero" onPress={() => open(hero)} label="Hot" />
        </View>
      ) : null}
      {rows.map((r) => (
        <View key={r.title} style={{ marginTop: space.section - 8 }}>
          <Text style={s.rowTitle}>{r.title}</Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={r.items}
            keyExtractor={(i) => i.id}
            contentContainerStyle={{ paddingHorizontal: space.screen, gap: space.gap }}
            renderItem={({ item }) => <StoryCard story={item} variant="tile" onPress={() => open(item)} label={r.label} />}
          />
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  rowTitle: { color: colors.text, fontSize: 20, fontWeight: '800', paddingHorizontal: space.screen, marginBottom: space.gap },
  skel: { borderRadius: radius.card, backgroundColor: colors.surface },
});
