import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StoryCard } from '../components/StoryCard';
import { colors } from '../theme';
import { GENRES, Story } from '../types';
import { fetchStories } from '../firebase/db';
import { useSettings } from '../state/settings';

function Skeleton() {
  return (
    <View style={{ padding: 16, gap: 24 }}>
      <View style={[s.skel, { height: 340 }]} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={[s.skel, { width: 230, height: 290 }]} />
        <View style={[s.skel, { width: 230, height: 290 }]} />
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
      contentContainerStyle={{ paddingBottom: 32 }}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.amber} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      {hero ? (
        <View style={{ padding: 16 }}>
          <StoryCard story={hero} onPress={() => open(hero)} width="100%" height={340} label="Hot" />
        </View>
      ) : null}
      {rows.map((r) => (
        <View key={r.title} style={{ marginTop: 16 }}>
          <Text style={s.rowTitle}>{r.title}</Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={r.items}
            keyExtractor={(i) => i.id}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
            renderItem={({ item }) => <StoryCard story={item} onPress={() => open(item)} label={r.label} />}
          />
        </View>
      ))}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  rowTitle: { color: colors.text, fontSize: 18, fontWeight: '800', paddingHorizontal: 16, marginBottom: 10 },
  skel: { borderRadius: 20, backgroundColor: colors.surface },
});
