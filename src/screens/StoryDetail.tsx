import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GradientView } from '../components/GradientView';
import { GENRE_ICON, StoryTitle } from '../components/StoryCard';
import { Chip } from '../components/Ui';
import { compact } from '../format';
import { colors, poster, radius, space } from '../theme';
import { ChatState, LANG_LABEL, Story } from '../types';
import { loadChat } from '../chat/store';
import { isLiked, setLiked } from '../firebase/db';
import { getAuth } from '@react-native-firebase/auth';

type Tab = 'episodes' | 'details';

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

export default function StoryDetail() {
  const { story } = useRoute<any>().params as { story: Story };
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('episodes');
  const [chat, setChat] = useState<ChatState | null>(null);
  const [liked, setLikedState] = useState(false);
  const [likes, setLikes] = useState(story.likeCount);

  useFocusEffect(useCallback(() => { loadChat(story.id).then(setChat); }, [story.id]));
  useEffect(() => { isLiked(story.id).then(setLikedState); }, [story.id]);

  const started = !!chat && chat.messages.length > 0;
  const currentEp = started ? chat!.ep : 1;
  const play = () => nav.navigate('Chat', { story });

  const toggleLike = async () => {
    if (!getAuth().currentUser) { Alert.alert('Sign in required', 'Sign in to like stories.'); return; }
    const next = !liked;
    setLikedState(next);
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)));
    try { await setLiked(story.id, next); }
    catch (e: any) {
      setLikedState(!next);
      setLikes((n) => Math.max(0, n + (next ? -1 : 1)));
      Alert.alert('Could not update', String(e?.message ?? e));
    }
  };

  const share = () => Share.share({ message: `${story.title} on One Fm: ${story.logline}` }).catch(() => {});

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + space.section }}>
        <GradientView from={story.cover[0]} to={colors.bg} style={[s.top, { paddingTop: insets.top + 64 }]}>
          <View style={s.poster}>
            <GradientView from={story.cover[0]} to={story.cover[1]} fromOpacity={1} toOpacity={0.85} diagonal style={StyleSheet.absoluteFill} />
            <Ionicons name={GENRE_ICON[story.genres[0]] ?? 'book'} size={84} color="rgba(255,255,255,0.3)" />
            <View style={s.ribbon}><Text style={s.ribbonText}>{compact(story.playCount)} PLAYS</Text></View>
          </View>
          <View style={s.actions}>
            <Pressable onPress={toggleLike} style={[s.btn, s.btnLight]} accessibilityLabel={liked ? 'Unlike' : 'Like'}>
              <Ionicons name={liked ? 'heart' : 'heart-outline'} size={18} color={liked ? colors.accent : '#1A0F0F'} />
              <Text style={s.btnLightText}>{liked ? 'Liked' : 'Like'}</Text>
            </Pressable>
            <Pressable onPress={play} style={[s.btn, { backgroundColor: colors.accent }]}>
              <Ionicons name="play" size={16} color={colors.onAccent} />
              <Text style={s.btnText}>{started ? `Continue Ep ${currentEp}` : 'Play Now'}</Text>
            </Pressable>
          </View>
        </GradientView>

        <View style={s.content}>
          <StoryTitle story={story} style={s.title} />

          <View style={s.stats}>
            <Stat value={compact(story.playCount)} label="Plays" />
            <View style={s.sep} />
            <Stat value={compact(likes)} label="Likes" />
            <View style={s.sep} />
            <Stat value={String(story.episodes.length)} label="Episodes" />
            <View style={s.sep} />
            <Stat value="18+" label="Rated" />
          </View>

          <Text style={s.logline}>{story.logline}</Text>

          <View style={s.creator}>
            <View style={s.creatorAvatar}><Text style={s.creatorInitial}>{story.creatorName.charAt(0).toUpperCase()}</Text></View>
            <View>
              <Text style={s.creatorName}>{story.creatorName}</Text>
              <Text style={s.creatorSub}>Creator</Text>
            </View>
          </View>
        </View>

        <View style={s.tabs}>
          {(['episodes', 'details'] as Tab[]).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={s.tab}>
              <Text style={[s.tabText, tab === t && { color: colors.text, fontWeight: '800' }]}>
                {t === 'episodes' ? `Episodes (${story.episodes.length})` : 'Details'}
              </Text>
              <View style={[s.underline, tab === t && { backgroundColor: colors.accent }]} />
            </Pressable>
          ))}
        </View>

        <View style={s.content}>
          {tab === 'episodes' ? (
            <>
              <View style={s.epHead}>
                <Pressable onPress={play} style={s.resume}>
                  <Ionicons name="play" size={12} color={colors.text} />
                  <Text style={s.resumeText}>{started ? `Resume EP ${currentEp}` : 'Start EP 1'}</Text>
                </Pressable>
                <Text style={s.epCount}>All {story.episodes.length} episodes</Text>
              </View>
              {story.episodes.map((e, i) => {
                const n = i + 1;
                const done = started && n < currentEp;
                const current = n === currentEp;
                return (
                  <Pressable key={i} onPress={play} style={[s.item, !done && !current && { opacity: 0.75 }]}>
                    <View style={[s.epNum, current && { backgroundColor: colors.accent }]}>
                      <Text style={[s.epNumText, current && { color: colors.onAccent }]}>{n}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.itemTitle}>Episode {n}</Text>
                      <Text style={s.itemSub}>{e.goal}</Text>
                    </View>
                    <Ionicons name={done ? 'checkmark-circle' : current ? 'play-circle' : 'play-circle-outline'} size={26} color={done || current ? colors.accent : colors.sub} />
                  </Pressable>
                );
              })}
            </>
          ) : (
            <>
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
              <Text style={[s.h, { marginTop: space.gap }]}>About</Text>
              <View style={s.row}>
                {story.genres.map((g) => <Chip key={g} label={g} />)}
                <Chip label={LANG_LABEL[story.language]} />
                <Chip label={`${story.readMin} min each`} />
              </View>
            </>
          )}
        </View>
      </ScrollView>

      <View style={[s.topBar, { top: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable onPress={() => nav.goBack()} style={s.round} hitSlop={8} accessibilityLabel="Back"><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
        <Pressable onPress={share} style={s.round} hitSlop={8} accessibilityLabel="Share"><Ionicons name="share-outline" size={22} color={colors.text} /></Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  top: { alignItems: 'center', gap: 20, paddingBottom: space.section },
  poster: { width: poster.detailSize, height: poster.detailSize, borderRadius: radius.card, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  ribbon: { position: 'absolute', top: 12, right: 0, backgroundColor: colors.accent, paddingHorizontal: 8, paddingVertical: 4, borderTopLeftRadius: radius.badge, borderBottomLeftRadius: radius.badge },
  ribbonText: { color: colors.onAccent, fontSize: 11, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: space.gap },
  btn: { height: 44, minWidth: 136, paddingHorizontal: 16, borderRadius: radius.btn, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  btnLight: { backgroundColor: colors.text },
  btnLightText: { color: '#1A0F0F', fontSize: 15, fontWeight: '800' },
  btnText: { color: colors.onAccent, fontSize: 15, fontWeight: '800' },
  content: { padding: space.screen, gap: space.gap },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  stats: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { color: colors.text, fontSize: 16, fontWeight: '800' },
  statLabel: { color: colors.sub, fontSize: 11 },
  sep: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: colors.line },
  logline: { color: colors.sub, fontSize: 14, lineHeight: 21 },
  creator: { flexDirection: 'row', alignItems: 'center', gap: space.gap, marginTop: 4 },
  creatorAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  creatorInitial: { color: colors.text, fontSize: 15, fontWeight: '800' },
  creatorName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  creatorSub: { color: colors.sub, fontSize: 12 },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, marginTop: 8 },
  tab: { flex: 1, alignItems: 'center', paddingTop: 12, gap: 10 },
  tabText: { color: colors.sub, fontSize: 15, fontWeight: '600' },
  underline: { width: 36, height: 3, borderRadius: 2, backgroundColor: 'transparent' },
  epHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resume: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.chip, backgroundColor: colors.surface },
  resumeText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  epCount: { color: colors.sub, fontSize: 13 },
  h: { color: colors.text, fontSize: 18, fontWeight: '800' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.gap, padding: space.card, borderRadius: radius.card, backgroundColor: colors.surface },
  itemTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  itemSub: { color: colors.sub, fontSize: 13, lineHeight: 18, marginTop: 2 },
  epNum: { width: 32, height: 32, borderRadius: radius.inner, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  epNumText: { color: colors.accent, fontSize: 15, fontWeight: '800' },
  topBar: { position: 'absolute', left: space.screen, right: space.screen, flexDirection: 'row', justifyContent: 'space-between' },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center' },
});
