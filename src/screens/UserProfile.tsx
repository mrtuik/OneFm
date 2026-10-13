import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAuth } from '@react-native-firebase/auth';
import { Avatar } from '../components/PostCard';
import { StoryCard } from '../components/StoryCard';
import { Empty, OutlineButton } from '../components/Ui';
import { Sheet, SheetDivider, SheetItem } from '../components/Sheet';
import { compact } from '../format';
import { colors, space } from '../theme';
import { Post } from '../types';
import { PublicUser, deletePost, fetchMyPrivatePosts, fetchUser, fetchUserPosts, isAdmin, setPostVisibility } from '../firebase/community';

type Tab = 'public' | 'private';

/** Public profile: avatar, name, @username, bio, numbers and the stories this reader posted. On my own profile there is also a Private tab. */
export default function UserProfile() {
  const { uid } = useRoute<any>().params as { uid: string };
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const me = getAuth().currentUser?.uid;
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
  const shown = own && tab === 'private' ? priv : posts;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.screen, gap: space.gap, paddingBottom: insets.bottom + space.section }} keyboardShouldPersistTaps="handled">
      <View style={s.head}>
        <Avatar name={user.name} url={user.avatarUrl} size={88} />
        <Text style={s.name}>{user.name}</Text>
        {user.username ? <Text style={s.handle}>@{user.username}</Text> : null}
        {user.bio ? <Text style={s.bio}>{user.bio}</Text> : null}
      </View>

      <View style={s.stats}>
        <View style={s.stat}><Text style={s.statValue}>{posts.length}</Text><Text style={s.statLabel}>Stories</Text></View>
        <View style={s.sep} />
        <View style={s.stat}><Text style={s.statValue}>{compact(likes)}</Text><Text style={s.statLabel}>Likes</Text></View>
      </View>

      {own ? <OutlineButton title="Edit profile" icon="create-outline" onPress={() => nav.navigate('EditProfile')} /> : null}

      {own ? (
        <View style={s.tabs}>
          {(['public', 'private'] as Tab[]).map((k) => (
            <Pressable key={k} onPress={() => setTab(k)} style={s.tabBtn}>
              <Text style={[s.tabText, tab === k && { color: colors.text }]}>{k === 'public' ? `Public (${posts.length})` : `Private (${priv.length})`}</Text>
              <View style={[s.underline, tab === k && { backgroundColor: colors.accent }]} />
            </Pressable>
          ))}
        </View>
      ) : <Text style={s.h}>Stories</Text>}

      {own && tab === 'private' ? <Text style={s.tip}>Only you can see these. Nobody else, not even in Community.</Text> : null}

      {shown.length === 0 ? (
        <Empty
          icon={tab === 'private' && own ? 'lock-closed-outline' : 'book-outline'}
          title={tab === 'private' && own ? 'No private stories' : 'No stories yet'}
          body={own ? (tab === 'private' ? 'Choose Private when you post a story, or press and hold a public story and make it private.' : 'Post your first story from the Community tab.') : 'This reader has not posted a story yet.'}
        />
      ) : shown.map((p) => (
        <StoryCard
          key={p.id}
          story={{ ...p.story, likeCount: p.likeCount }}
          variant="row"
          label={p.visibility === 'private' ? 'Private' : p.featured ? 'Featured' : undefined}
          onPress={() => open(p)}
          onLongPress={own || admin ? () => onHold(p) : undefined}
        />
      ))}
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
  head: { alignItems: 'center', gap: 6, paddingVertical: space.gap },
  name: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 4 },
  handle: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  bio: { color: colors.sub, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  stats: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { color: colors.text, fontSize: 18, fontWeight: '800' },
  statLabel: { color: colors.sub, fontSize: 12 },
  sep: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: colors.line },
  h: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 8 },
  tabs: { flexDirection: 'row', marginTop: 4 },
  tabBtn: { flex: 1, alignItems: 'center', gap: 8, paddingTop: 8 },
  tabText: { color: colors.sub, fontSize: 15, fontWeight: '700' },
  underline: { height: 2, alignSelf: 'stretch', backgroundColor: colors.line },
  tip: { color: colors.sub, fontSize: 12, textAlign: 'center' },
});
