import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { getAuth } from '@react-native-firebase/auth';
import { PostCard } from '../components/PostCard';
import { Sheet, SheetDivider, SheetItem } from '../components/Sheet';
import { Empty } from '../components/Ui';
import { colors, space } from '../theme';
import { Post } from '../types';
import { SAMPLE_POSTS } from '../data/samplePosts';
import { deletePost, fetchPosts, isAdmin, myPostLikes, reportPost, setFeatured, setPostLiked } from '../firebase/community';

/** Community tab: stories posted by readers. The admin can put a story on the Home page from the post menu. */
export default function Community() {
  const nav = useNavigation<any>();
  const uid = getAuth().currentUser?.uid;
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [likes, setLikes] = useState<Record<string, boolean>>({});
  const [admin, setAdmin] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState<Post | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, l] = await Promise.all([fetchPosts(), myPostLikes()]);
      setPosts(p); setLikes(l); setError(null);
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setPosts((x) => x ?? []);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { isAdmin(uid).then(setAdmin); }, [uid]);

  const needSignIn = (what: string) => Alert.alert('Sign in required', `Sign in to ${what}.`);

  const toggleLike = async (p: Post) => {
    if (p.sample) { setLikes((l) => ({ ...l, [p.id]: !l[p.id] })); return; }
    if (!uid) return needSignIn('like posts');
    const next = !likes[p.id];
    const bump = (d: number) => setPosts((list) => (list ?? []).map((x) => (x.id === p.id ? { ...x, likeCount: Math.max(0, x.likeCount + d) } : x)));
    setLikes((l) => ({ ...l, [p.id]: next })); bump(next ? 1 : -1);
    try { await setPostLiked(p.id, next); }
    catch (e: any) { setLikes((l) => ({ ...l, [p.id]: !next })); bump(next ? -1 : 1); Alert.alert('Could not update', String(e?.message ?? e)); }
  };

  const open = (p: Post) => nav.navigate('StoryDetail', { story: { ...p.story, likeCount: p.likeCount }, postId: p.sample ? undefined : p.id });
  const run = async (fn: () => Promise<void>, ok?: string) => {
    try { await fn(); await load(); if (ok) Alert.alert('Done', ok); }
    catch (e: any) { Alert.alert('Failed', String(e?.message ?? e)); }
  };

  const m = menu;
  const mine = !!m && m.creatorUid === uid;
  const close = () => setMenu(null);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {posts === null ? (
        <View style={s.center}><ActivityIndicator color={colors.accent} /></View>
      ) : (
        <FlatList
          data={[...posts, ...SAMPLE_POSTS]}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ padding: space.screen, gap: space.gap, paddingBottom: 96, flexGrow: 1 }}
          refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.accent} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
          ListHeaderComponent={error ? <Text style={s.error}>Could not load the posts: {error}</Text> : null}
          ListEmptyComponent={<Empty icon="people-outline" title="No stories yet" body="Be the first. Tap + and share a story with the community." />}
          renderItem={({ item }) => (
            <PostCard
              post={item.sample && likes[item.id] ? { ...item, likeCount: item.likeCount + 1 } : item}
              liked={!!likes[item.id]}
              onOpen={() => open(item)}
              onOpenUser={() => { if (!item.sample) nav.navigate('UserProfile', { uid: item.creatorUid }); }}
              onLike={() => toggleLike(item)}
              onMenu={() => (item.sample ? Alert.alert('Sample post', 'Samples show how the feed looks. Real posts from readers appear above them.') : setMenu(item))}
            />
          )}
        />
      )}

      <Pressable onPress={() => (uid ? nav.navigate('CreatePost') : needSignIn('post a story'))} style={s.fab} accessibilityLabel="Post a story">
        <Ionicons name="add" size={30} color={colors.onAccent} />
      </Pressable>

      <Sheet visible={!!m} onClose={close} title="Post">
        {admin && m ? (
          <>
            <SheetItem
              icon={m.featured ? 'home' : 'home-outline'}
              label={m.featured ? 'Remove from Home' : 'Show on Home'}
              onPress={() => { close(); run(() => setFeatured(m, !m.featured), m.featured ? 'The story is off the Home page.' : 'The story is now on the Home page.'); }}
            />
            <SheetDivider />
          </>
        ) : null}
        <SheetItem icon="person-outline" label={`View ${m?.creatorName ?? 'profile'}`} onPress={() => { close(); if (m) nav.navigate('UserProfile', { uid: m.creatorUid }); }} />
        <SheetDivider />
        <SheetItem
          icon="flag-outline"
          label="Report"
          onPress={() => {
            close();
            if (!uid) return needSignIn('report a post');
            if (m) Alert.alert('Report this post?', 'Tell us if it is copied, sexual, abusive or breaks the rules.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Report', style: 'destructive', onPress: () => run(() => reportPost(m, 'reported from feed'), 'Thank you. We will look at it.') },
            ]);
          }}
        />
        {m && (mine || admin) ? (
          <>
            <SheetDivider />
            <SheetItem
              icon="trash-outline"
              label="Delete post"
              danger
              onPress={() => {
                close();
                Alert.alert('Delete this post?', 'The story is removed for everyone.', [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: () => run(() => deletePost(m)) },
                ]);
              }}
            />
          </>
        ) : null}
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: colors.accent, fontSize: 13, lineHeight: 18, marginBottom: 8 },
  fab: { position: 'absolute', right: 20, bottom: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', elevation: 6 },
});
