import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAuth } from '@react-native-firebase/auth';
import { Avatar } from '../components/PostCard';
import { Cover } from '../components/Cover';
import { GradientView } from '../components/GradientView';
import { Empty } from '../components/Ui';
import { Sheet, SheetDivider, SheetItem } from '../components/Sheet';
import { compact } from '../format';
import { colors, radius, space } from '../theme';
import { Post } from '../types';
import { PublicUser, deletePost, fetchMyPrivatePosts, fetchUser, fetchUserPosts, isAdmin, setPostVisibility } from '../firebase/community';

type Tab = 'public' | 'private';

const GAP = 2;
const CELL = Math.floor((Dimensions.get('window').width - space.screen * 2 - GAP * 2) / 3);

/** Profile: a card with banner, avatar, name, @username, numbers and one big button, then a grid of stories (Instagram style). My own profile also has a Private tab and the Edit profile button. */
export default function UserProfile() {
  // Opened from the Me tab there are no params: it is my own profile.
  const me = getAuth().currentUser?.uid;
  const uid = ((useRoute<any>().params as { uid?: string } | undefined)?.uid ?? me) as string;
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const own = me === uid;
  const [user, setUser] = useState<PublicUser | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [priv, setPriv] = useState<Post[]>([]);
  const [tab, setTab] = useState<Tab>('public');
  const [admin, setAdmin] = useState(false);
  const [menu, setMenu] = useState<Post | null>(null);

  const load = useCallback(async () => {
    const [u, p, pr] = await Promise.all([
      fetchUser(uid),
      fetchUserPosts(uid).catch(() => [] as Post[]),
      own ? fetchMyPrivatePosts().catch(() => [] as Post[]) : Promise.resolve([] as Post[]),
    ]);
    setUser(u); setPosts(p); setPriv(pr);
    isAdmin(me).then(setAdmin);
  }, [uid, me, own]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const run = async (fn: () => Promise<void>) => {
    try { await fn(); await load(); } catch (e: any) { Alert.alert('Failed', String(e?.message ?? e)); }
  };

  const confirmDelete = (p: Post) => {
    Alert.alert('Delete this post?', `"${p.story.title}" is removed${p.visibility === 'private' ? '' : ' for everyone'}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => run(() => deletePost(p)) },
    ]);
  };

  const open = (p: Post) => nav.navigate('StoryDetail', { story: { ...p.story, likeCount: p.likeCount }, postId: p.visibility === 'private' ? undefined : p.id, isPrivate: p.visibility === 'private' });
  const onHold = (p: Post) => { if (own) setMenu(p); else if (admin) confirmDelete(p); };

  if (!user || !posts) return <View style={s.center}><ActivityIndicator color={colors.accent} /></View>;
  const likes = posts.reduce((n, p) => n + p.likeCount, 0);
  const plays = posts.reduce((n, p) => n + (p.story.playCount ?? 0), 0);
  const shown = own && tab === 'private' ? priv : posts;
  const share = () => Share.share({ message: `${user.name}${user.username ? ` (@${user.username})` : ''} on One Fm` }).catch(() => {});

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.screen, gap: space.gap, paddingBottom: insets.bottom + space.section }} keyboardShouldPersistTaps="handled">
      <View style={s.card}>
        <GradientView from="#2A0E1E" to="#E31A4E" fromOpacity={1} toOpacity={0.75} diagonal style={s.banner} />

        <View style={s.idRow}>
          <View style={s.avatarWrap}><Avatar name={user.name} url={user.avatarUrl} size={84} /></View>
          {own ? (
            <View style={s.actions}>
              <Pressable onPress={() => nav.navigate('EditProfile')} style={s.pill} accessibilityRole="button"><Text style={s.pillText}>Edit profile</Text></Pressable>
              <Pressable onPress={() => nav.navigate('Profile')} style={s.round} accessibilityLabel="Settings"><Ionicons name="settings-outline" size={18} color={colors.text} /></Pressable>
            </View>
          ) : null}
        </View>

        <View style={s.who}>
          <Text style={s.name} numberOfLines={1}>{user.name}</Text>
          {user.username ? <Text style={s.handle}>@{user.username}</Text> : null}
          {user.bio ? <Text style={s.bio}>{user.bio}</Text> : null}
        </View>

        <View style={s.divider} />
        <View style={s.stats}>
          <View style={s.stat}><View style={s.statTop}><Ionicons name="document-text" size={18} color={colors.text} /><Text style={s.statValue}>{posts.length}</Text></View><Text style={s.statLabel}>Stories</Text></View>
          <View style={s.stat}><View style={s.statTop}><Ionicons name="heart" size={18} color={colors.text} /><Text style={s.statValue}>{compact(likes)}</Text></View><Text style={s.statLabel}>Likes</Text></View>
          <View style={s.stat}><View style={s.statTop}><Ionicons name="play" size={16} color={colors.text} /><Text style={s.statValue}>{compact(plays)}</Text></View><Text style={s.statLabel}>Plays</Text></View>
        </View>

        <Pressable onPress={own ? () => nav.navigate('CreatePost') : share} style={s.cta} accessibilityRole="button">
          <GradientView from="#000000" to="#5A4A4A" diagonal style={StyleSheet.absoluteFill} />
          <View style={s.ctaCircle}><Ionicons name="arrow-forward" size={22} color="#0A0A0A" /></View>
          <Text style={s.ctaText}>{own ? 'Post a story' : 'Share profile'}</Text>
        </Pressable>
      </View>

      {own ? (
        <View style={s.tabs}>
          {(['public', 'private'] as Tab[]).map((k) => (
            <Pressable key={k} onPress={() => setTab(k)} style={s.tabBtn} accessibilityLabel={k === 'public' ? 'Public stories' : 'Private stories'}>
              <View style={s.tabInner}>
                <Ionicons name={k === 'public' ? 'grid-outline' : 'lock-closed-outline'} size={20} color={tab === k ? colors.text : colors.sub} />
                <Text style={[s.tabText, tab === k && { color: colors.text }]}>{k === 'public' ? posts.length : priv.length}</Text>
              </View>
              <View style={[s.underline, tab === k && { backgroundColor: colors.accent }]} />
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={s.tabs}>
          <View style={s.tabBtn}>
            <View style={s.tabInner}><Ionicons name="grid-outline" size={20} color={colors.text} /><Text style={[s.tabText, { color: colors.text }]}>{posts.length}</Text></View>
            <View style={[s.underline, { backgroundColor: colors.accent }]} />
          </View>
        </View>
      )}

      {own && tab === 'private' ? <Text style={s.tip}>Only you can see these. Nobody else, not even in Community.</Text> : null}

      {shown.length === 0 ? (
        <Empty
          icon={tab === 'private' && own ? 'lock-closed-outline' : 'book-outline'}
          title={tab === 'private' && own ? 'No private stories' : 'No stories yet'}
          body={own ? (tab === 'private' ? 'Choose Private when you post a story, or press and hold a public story and make it private.' : 'Post your first story from the Community tab.') : 'This reader has not posted a story yet.'}
        />
      ) : (
        <View style={s.grid}>
          {shown.map((p) => (
            <Pressable key={p.id} onPress={() => open(p)} onLongPress={own || admin ? () => onHold(p) : undefined} style={({ pressed }) => [{ width: CELL, height: CELL, opacity: pressed ? 0.85 : 1 }]}>
              <Cover story={p.story} iconSize={28} style={{ width: CELL, height: CELL }}>
                <GradientView from="#000000" to="#000000" fromOpacity={0} toOpacity={0.75} style={s.cellShade} />
                <Text style={s.cellTitle} numberOfLines={2}>{p.story.title}</Text>
                {p.visibility === 'private' ? <View style={s.cellLock}><Ionicons name="lock-closed" size={11} color={colors.text} /></View> : p.featured ? <View style={s.cellLock}><Ionicons name="home" size={11} color={colors.text} /></View> : null}
              </Cover>
            </Pressable>
          ))}
        </View>
      )}
      {(own || admin) && shown.length ? <Text style={s.tip}>Press and hold a story for options.</Text> : null}

      <Sheet visible={!!menu} onClose={() => setMenu(null)} title={menu?.story.title}>
        {menu ? (
          <>
            <SheetItem
              icon={menu.visibility === 'private' ? 'earth-outline' : 'lock-closed-outline'}
              label={menu.visibility === 'private' ? 'Make public' : 'Make private'}
              onPress={() => { const m = menu; setMenu(null); run(() => setPostVisibility(m, m.visibility === 'private' ? 'public' : 'private')); }}
            />
            <SheetDivider />
            <SheetItem icon="trash-outline" label="Delete post" danger onPress={() => { const m = menu; setMenu(null); confirmDelete(m); }} />
          </>
        ) : null}
      </Sheet>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: 24, backgroundColor: colors.surface, padding: 12, paddingBottom: 14 },
  banner: { height: 120, borderRadius: 16, overflow: 'hidden' },
  idRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: -44, paddingHorizontal: 6 },
  avatarWrap: { padding: 4, borderRadius: 50, backgroundColor: colors.surface },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  pill: { height: 36, paddingHorizontal: 18, borderRadius: 18, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  pillText: { color: '#0A0A0A', fontSize: 14, fontWeight: '800' },
  round: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#2A2323', alignItems: 'center', justifyContent: 'center' },
  who: { paddingHorizontal: 6, paddingTop: 8, gap: 2 },
  name: { color: colors.text, fontSize: 22, fontWeight: '800' },
  handle: { color: colors.sub, fontSize: 14 },
  bio: { color: colors.text, fontSize: 14, lineHeight: 20, marginTop: 6 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.line, marginTop: 14, marginHorizontal: 6 },
  stats: { flexDirection: 'row', paddingVertical: 14 },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statValue: { color: colors.text, fontSize: 20, fontWeight: '800' },
  statLabel: { color: colors.sub, fontSize: 13 },
  cta: { height: 56, borderRadius: 28, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  ctaCircle: { position: 'absolute', left: 8, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: colors.text, fontSize: 16, fontWeight: '700' },
  tabs: { flexDirection: 'row', marginTop: 4 },
  tabBtn: { flex: 1, alignItems: 'center', gap: 10, paddingTop: 6 },
  tabInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tabText: { color: colors.sub, fontSize: 15, fontWeight: '700' },
  underline: { height: 2, alignSelf: 'stretch', backgroundColor: colors.line },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, borderRadius: radius.inner, overflow: 'hidden' },
  cellShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' },
  cellTitle: { position: 'absolute', left: 6, right: 6, bottom: 6, color: colors.text, fontSize: 11, fontWeight: '700', lineHeight: 14 },
  cellLock: { position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center' },
  tip: { color: colors.sub, fontSize: 12, textAlign: 'center' },
});
