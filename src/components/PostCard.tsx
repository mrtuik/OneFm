import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Cover } from './Cover';
import { StoryTitle } from './StoryCard';
import { colors, poster, radius, space } from '../theme';
import { Post } from '../types';

export function timeAgo(t: number): string {
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d` : `${Math.round(d / 30)}mo`;
}

export function Avatar({ name, url, size }: { name: string; url?: string; size: number }) {
  if (url) return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surface }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.accent, fontSize: size * 0.42, fontWeight: '800' }}>{(name || '?').trim().charAt(0).toUpperCase()}</Text>
    </View>
  );
}

interface Props {
  post: Post;
  liked: boolean;
  onOpen: () => void;
  onOpenUser: () => void;
  onLike: () => void;
  onMenu: () => void;
}

/** One post in the Community feed: who posted, the cover, the story, like and play. */
export function PostCard({ post, liked, onOpen, onOpenUser, onLike, onMenu }: Props) {
  const st = post.story;
  return (
    <View style={s.card}>
      <View style={s.head}>
        <Pressable onPress={onOpenUser} style={s.who} hitSlop={6}>
          <Avatar name={post.creatorName} url={post.creatorAvatar} size={34} />
          <View style={{ flexShrink: 1 }}>
            <Text style={s.name} numberOfLines={1}>{post.creatorName}</Text>
            <Text style={s.time}>{timeAgo(post.createdAt)}{post.featured ? '  ·  on Home' : ''}</Text>
          </View>
        </Pressable>
        <Pressable onPress={onMenu} hitSlop={10} accessibilityLabel="Post options"><Ionicons name="ellipsis-horizontal" size={20} color={colors.sub} /></Pressable>
      </View>

      <Pressable onPress={onOpen}>
        <Cover story={st} iconSize={64} style={{ width: '100%', aspectRatio: poster.wideRatio }}>
          <View style={s.badges}>
            <View style={s.badge}><Text style={s.badgeText}>{st.genres[0]}</Text></View>
            {post.featured ? <View style={[s.badge, { backgroundColor: colors.accent }]}><Text style={[s.badgeText, { color: colors.onAccent }]}>Featured</Text></View> : null}
          </View>
        </Cover>
        <View style={s.body}>
          {post.caption ? <Text style={s.caption}>{post.caption}</Text> : null}
          <StoryTitle story={st} style={s.title} />
          <Text style={s.logline} numberOfLines={2}>{st.logline}</Text>
        </View>
      </Pressable>

      <View style={s.foot}>
        <Pressable onPress={onLike} style={s.like} hitSlop={8} accessibilityLabel={liked ? 'Unlike' : 'Like'}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={22} color={liked ? colors.accent : colors.text} />
          <Text style={s.likeText}>{post.likeCount}</Text>
        </Pressable>
        <Text style={s.meta} numberOfLines={1}>{st.episodes.length} ep  ·  {st.readMin} min</Text>
        <Pressable onPress={onOpen} style={s.play}>
          <Ionicons name="play" size={14} color={colors.onAccent} />
          <Text style={s.playText}>Play</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: radius.card, backgroundColor: colors.surface, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  name: { color: colors.text, fontSize: 14, fontWeight: '700' },
  time: { color: colors.sub, fontSize: 12 },
  badges: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  badge: { backgroundColor: colors.scrim, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.badge },
  badgeText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  body: { padding: space.card, paddingBottom: 6, gap: 6 },
  caption: { color: colors.text, fontSize: 14, lineHeight: 20 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  logline: { color: colors.sub, fontSize: 13, lineHeight: 18 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, paddingTop: 8 },
  like: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  likeText: { color: colors.text, fontSize: 14, fontWeight: '600', minWidth: 14 },
  meta: { flex: 1, color: colors.sub, fontSize: 12 },
  play: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.accent },
  playText: { color: colors.onAccent, fontSize: 14, fontWeight: '700' },
});
