import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { GenreTabs, MiniTile, RankedTile, SearchBar, SectionHeader } from '../components/HomeParts';
import { Empty } from '../components/Ui';
import { colors, radius, space } from '../theme';
import { ChatState, GENRES, Story } from '../types';
import { listChats } from '../chat/store';
import { fetchStories } from '../firebase/db';
import { useSettings } from '../state/settings';

interface Row { title: string; icon?: React.ComponentProps<typeof Ionicons>['name']; items: Story[]; badges?: Record<string, string>; subs?: Record<string, string>; onSeeAll?: () => void }

const FOR_YOU = 'For You';
const TABS = [FOR_YOU, ...GENRES];

function Skeleton() {
  return (
    <View style={{ padding: space.screen, gap: space.section }}>
      <View style={{ flexDirection: 'row', gap: space.gap }}>
        <View style={[s.skel, { width: 176, height: 124 }]} />
        <View style={[s.skel, { width: 176, height: 124 }]} />
      </View>
      <View style={{ flexDirection: 'row', gap: space.gap }}>
        <View style={[s.skel, { width: 128, height: 128 }]} />
        <View style={[s.skel, { width: 128, height: 128 }]} />
        <View style={[s.skel, { width: 128, height: 128 }]} />
      </View>
    </View>
  );
}

export default function Home() {
  const nav = useNavigation<any>();
  const { s: st } = useSettings();
  const [stories, setStories] = useState<Story[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [chats, setChats] = useState<ChatState[]>([]);
  const [tab, setTab] = useState(FOR_YOU);

  const load = useCallback(async () => setStories(await fetchStories()), []);
  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { listChats().then(setChats); }, []));

  const open = (story: Story) => nav.navigate('StoryDetail', { story });
  const seeAll = (title: string, items: Story[], ranked?: boolean) => nav.navigate('SeeAll', { title, stories: items, ranked });

  const { trending, rows } = useMemo(() => {
    if (!stories) return { trending: [] as Story[], rows: [] as Row[] };
    const pool = tab === FOR_YOU ? stories : stories.filter((x) => x.genres.includes(tab));
    const mine = (x: Story) => (x.language === st.language ? 0 : 1);
    const trending = [...pool].sort((a, b) => mine(a) - mine(b) || b.playCount - a.playCount).slice(0, 10);

    const rows: Row[] = [];
    if (tab === FOR_YOU) {
      const cont = chats
        .map((c) => ({ c, story: stories.find((x) => x.id === c.storyId) }))
        .filter((x): x is { c: ChatState; story: Story } => !!x.story);
      if (cont.length) rows.push({
        title: 'Continue Chat', icon: 'play-circle-outline', items: cont.map((x) => x.story),
        subs: Object.fromEntries(cont.map((x) => [x.story.id, `Ep ${x.c.ep} of ${x.story.episodes.length}`])),
        onSeeAll: () => nav.navigate('Chats'),
      });
      rows.push({ title: 'From the community', items: stories.filter((x) => x.fromCommunity).sort((a, b) => b.createdAt - a.createdAt) });
    }
    rows.push({ title: 'Top Rated', items: [...pool].sort((a, b) => b.likeCount - a.likeCount).slice(0, 10) });
    rows.push({ title: 'New Stories', items: [...pool].sort((a, b) => b.createdAt - a.createdAt) });
    if (tab === FOR_YOU) GENRES.forEach((g) => rows.push({ title: g, items: stories.filter((x) => x.genres.includes(g)) }));
    return { trending, rows: rows.filter((r) => r.items.length > 0) };
  }, [stories, st.language, chats, tab]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SearchBar onPress={() => nav.navigate('Search')} />
      <View style={{ marginTop: 4, marginBottom: 6 }}>
        <GenreTabs tabs={TABS} active={tab} onPick={setTab} />
      </View>

      {!stories ? <Skeleton /> : (
        <ScrollView
          contentContainerStyle={{ paddingTop: space.gap, paddingBottom: space.section }}
          refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.accent} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        >
          {trending.length === 0 ? (
            <Empty icon="book-outline" title="No stories here yet" body={`There are no ${tab} stories yet. Try another tab.`} />
          ) : (
            <View>
              <SectionHeader title="Trending Now" icon="flame-outline" onSeeAll={() => seeAll('Trending Now', trending, true)} />
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={trending}
                keyExtractor={(i) => i.id}
                contentContainerStyle={{ paddingHorizontal: space.screen, gap: 18 }}
                renderItem={({ item, index }) => <RankedTile story={item} rank={index + 1} onPress={() => open(item)} />}
              />
            </View>
          )}

          {rows.map((r) => (
            <View key={r.title} style={{ marginTop: space.section }}>
              <SectionHeader title={r.title} icon={r.icon} onSeeAll={r.onSeeAll ?? (() => seeAll(r.title, r.items))} />
              <FlatList
                horizontal
                showsHorizontalScrollIndicator={false}
                data={r.items}
                keyExtractor={(i) => i.id}
                contentContainerStyle={{ paddingHorizontal: space.screen, gap: space.gap }}
                renderItem={({ item }) => <MiniTile story={item} onPress={() => open(item)} sub={r.subs?.[item.id]} />}
              />
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  skel: { borderRadius: radius.card, backgroundColor: colors.surface },
});
