import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Cover } from './Cover';
import { compact } from '../format';
import { colors, radius, space } from '../theme';
import { Story } from '../types';

/** Looks like a search field. Tapping it opens the Search tab. */
export function SearchBar({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.search} accessibilityRole="search" accessibilityLabel="Search stories">
      <Ionicons name="search" size={20} color={colors.sub} />
      <Text style={s.searchText} numberOfLines={1}>Search stories, genres, creators</Text>
    </Pressable>
  );
}

/** For You, Romance, Thriller... The active tab is white with a pink line under it. */
export function GenreTabs({ tabs, active, onPick }: { tabs: string[]; active: string; onPick: (t: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabs}>
      {tabs.map((t) => (
        <Pressable key={t} onPress={() => onPick(t)} style={s.tab} hitSlop={6}>
          <Text style={[s.tabText, active === t && s.tabTextOn]}>{t}</Text>
          <View style={[s.tabLine, active === t && { backgroundColor: colors.accent }]} />
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** Section title on the left, "See all" in pink on the right. An icon can sit before the title. */
export function SectionHeader({ title, onSeeAll, icon }: { title: string; onSeeAll?: () => void; icon?: React.ComponentProps<typeof Ionicons>['name'] }) {
  return (
    <View style={s.head}>
      <View style={s.headLeft}>
        {icon ? <Ionicons name={icon} size={20} color={colors.accent} /> : null}
        <Text style={s.headTitle} numberOfLines={1}>{title}</Text>
      </View>
      {onSeeAll ? (
        <Pressable onPress={onSeeAll} hitSlop={10} style={s.seeAll} accessibilityRole="button" accessibilityLabel={`See all ${title}`}>
          <Text style={s.seeAllText}>See all</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.accent} />
        </Pressable>
      ) : null}
    </View>
  );
}

const TILE = 128;

/** Small square story: cover, name and plays underneath. */
export function MiniTile({ story, onPress, badge, sub }: { story: Story; onPress: () => void; badge?: string; sub?: string }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ width: TILE, opacity: pressed ? 0.85 : 1 }]}>
      <Cover story={story} iconSize={36} style={{ width: TILE, height: TILE, borderRadius: radius.btn }}>
        {badge ? <View style={s.badge}><Text style={s.badgeText}>{badge}</Text></View> : null}
      </Cover>
      <Text style={s.tileTitle} numberOfLines={1}>{story.title}</Text>
      <Text style={s.tileSub} numberOfLines={1}>{sub ?? `${compact(story.playCount)} Plays`}</Text>
    </Pressable>
  );
}

/** Trending story with a big rank number (1, 2, 3...) behind the cover and the plays underneath. */
export function RankedTile({ story, rank, onPress }: { story: Story; rank: number; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.rank, { opacity: pressed ? 0.85 : 1 }]}>
      <Text style={s.rankNum} allowFontScaling={false}>{rank}</Text>
      <View style={{ marginLeft: 50 }}>
        <Cover story={story} iconSize={40} style={{ width: 124, height: 124, borderRadius: radius.btn }} />
        <Text style={s.tileTitle} numberOfLines={1}>{story.title}</Text>
        <View style={s.playsRow}>
          <Ionicons name="play" size={10} color={colors.sub} />
          <Text style={s.tileSub}>{compact(story.playCount)} Plays</Text>
        </View>
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 46, marginHorizontal: space.screen, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.surface },
  searchText: { flex: 1, color: colors.sub, fontSize: 15 },
  tabs: { paddingHorizontal: space.screen, gap: 22 },
  tab: { paddingTop: 10, gap: 8, alignItems: 'center' },
  tabText: { color: colors.sub, fontSize: 15, fontWeight: '600' },
  tabTextOn: { color: colors.text, fontWeight: '800' },
  tabLine: { height: 2, alignSelf: 'stretch', borderRadius: 1, backgroundColor: 'transparent' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.screen, marginBottom: space.gap },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  headTitle: { color: colors.text, fontSize: 18, fontWeight: '800', flexShrink: 1 },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 12 },
  seeAllText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  badge: { position: 'absolute', top: 8, left: 8, backgroundColor: colors.scrim, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.badge },
  badgeText: { color: colors.text, fontSize: 11, fontWeight: '700' },
  tileTitle: { color: colors.text, fontSize: 14, fontWeight: '600', marginTop: 8 },
  tileSub: { color: colors.sub, fontSize: 12, marginTop: 2 },
  rank: { width: 176, justifyContent: 'flex-end' },
  rankNum: { position: 'absolute', left: -4, bottom: 18, fontSize: 96, lineHeight: 104, fontWeight: '900', color: 'rgba(254,244,244,0.28)' },
  playsRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
});
