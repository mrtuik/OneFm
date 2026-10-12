import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAuth } from '@react-native-firebase/auth';
import { Avatar } from '../components/PostCard';
import { StoryCard } from '../components/StoryCard';
import { Empty, GradientButton, OutlineButton } from '../components/Ui';
import { compact } from '../format';
import { colors, radius, space } from '../theme';
import { Post } from '../types';
import { PublicUser, deletePost, fetchUser, fetchUserPosts, isAdmin, saveMyProfile } from '../firebase/community';

/** Public profile: avatar, name, bio, numbers and every story this reader posted. */
export default function UserProfile() {
  const { uid } = useRoute<any>().params as { uid: string };
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const me = getAuth().currentUser?.uid;
  const own = me === uid;
  const [user, setUser] = useState<PublicUser | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [admin, setAdmin] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [u, p] = await Promise.all([fetchUser(uid), fetchUserPosts(uid).catch(() => [] as Post[])]);
    setUser(u); setPosts(p); setName(u.name); setBio(u.bio ?? '');
    isAdmin(me).then(setAdmin);
  }, [uid, me]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const save = async () => {
    setSaving(true);
    try { await saveMyProfile(name, bio); setEditing(false); await load(); }
    catch (e: any) { Alert.alert('Could not save', String(e?.message ?? e)); }
    finally { setSaving(false); }
  };

  const confirmDelete = (p: Post) => {
    if (!own && !admin) return;
    Alert.alert('Delete this post?', `"${p.story.title}" is removed for everyone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { try { await deletePost(p); await load(); } catch (e: any) { Alert.alert('Failed', String(e?.message ?? e)); } } },
    ]);
  };

  if (!user || !posts) return <View style={s.center}><ActivityIndicator color={colors.accent} /></View>;
  const likes = posts.reduce((n, p) => n + p.likeCount, 0);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.screen, gap: space.gap, paddingBottom: insets.bottom + space.section }} keyboardShouldPersistTaps="handled">
      <View style={s.head}>
        <Avatar name={user.name} url={user.avatarUrl} size={88} />
        {editing ? (
          <View style={{ alignSelf: 'stretch', gap: 8 }}>
            <TextInput style={s.input} value={name} onChangeText={setName} maxLength={40} placeholder="Name" placeholderTextColor={colors.sub} />
            <TextInput style={[s.input, { minHeight: 80, paddingTop: 12 }]} value={bio} onChangeText={setBio} maxLength={160} multiline textAlignVertical="top" placeholder="A line about you" placeholderTextColor={colors.sub} />
            {saving ? <ActivityIndicator color={colors.accent} /> : <GradientButton title="Save" onPress={save} />}
            <OutlineButton title="Cancel" onPress={() => { setEditing(false); setName(user.name); setBio(user.bio ?? ''); }} />
          </View>
        ) : (
          <>
            <Text style={s.name}>{user.name}</Text>
            {user.bio ? <Text style={s.bio}>{user.bio}</Text> : null}
          </>
        )}
      </View>

      <View style={s.stats}>
        <View style={s.stat}><Text style={s.statValue}>{posts.length}</Text><Text style={s.statLabel}>Stories</Text></View>
        <View style={s.sep} />
        <View style={s.stat}><Text style={s.statValue}>{compact(likes)}</Text><Text style={s.statLabel}>Likes</Text></View>
      </View>

      {own && !editing ? <OutlineButton title="Edit profile" icon="create-outline" onPress={() => setEditing(true)} /> : null}

      <Text style={s.h}>Stories</Text>
      {posts.length === 0 ? (
        <Empty icon="book-outline" title="No stories yet" body={own ? 'Post your first story from the Community tab.' : 'This reader has not posted a story yet.'} />
      ) : posts.map((p) => (
        <StoryCard
          key={p.id}
          story={{ ...p.story, likeCount: p.likeCount }}
          variant="row"
          label={p.featured ? 'Featured' : undefined}
          onPress={() => nav.navigate('StoryDetail', { story: { ...p.story, likeCount: p.likeCount }, postId: p.id })}
          onLongPress={own || admin ? () => confirmDelete(p) : undefined}
        />
      ))}
      {(own || admin) && posts.length ? <Text style={s.tip}>Press and hold a story to delete it.</Text> : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  head: { alignItems: 'center', gap: 8, paddingVertical: space.gap },
  name: { color: colors.text, fontSize: 22, fontWeight: '800', marginTop: 4 },
  bio: { color: colors.sub, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  stats: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { color: colors.text, fontSize: 18, fontWeight: '800' },
  statLabel: { color: colors.sub, fontSize: 12 },
  sep: { width: StyleSheet.hairlineWidth, height: 28, backgroundColor: colors.line },
  h: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 8 },
  input: { minHeight: 46, borderRadius: radius.btn, backgroundColor: colors.surface, paddingHorizontal: 14, color: colors.text, fontSize: 15 },
  tip: { color: colors.sub, fontSize: 12, textAlign: 'center' },
});
