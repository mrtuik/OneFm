import React, { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Empty, Screen } from '../components/Ui';
import { Cover } from '../components/Cover';
import { colors, poster, radius, space } from '../theme';
import { ChatState, Story } from '../types';
import { deleteChat, listChats } from '../chat/store';
import { fetchStories } from '../firebase/db';

function preview(c: ChatState): string {
  const m = [...c.messages].reverse().find((x) => x.role !== 'episode_end');
  if (!m) return '';
  const t = m.text.replace(/\*/g, '');
  return m.role === 'user' ? `You: ${t}` : t;
}

/** A story-like object for a chat whose story is not in the list (for example a community story): its colour and genre icon. */
const chatStory = (c: ChatState): Story => ({ id: c.storyId, title: c.title, genres: [c.genre], cover: [c.cover, c.cover] } as Story);

export function Chats() {
  const nav = useNavigation<any>();
  const [chats, setChats] = useState<ChatState[] | null>(null);
  const [stories, setStories] = useState<Story[]>([]);

  const load = useCallback(() => { listChats().then(setChats); fetchStories().then(setStories); }, []);
  useFocusEffect(load);

  const open = (c: ChatState) => {
    const story = stories.find((x) => x.id === c.storyId);
    if (story) nav.navigate('Chat', { story });
  };
  const remove = (c: ChatState) =>
    Alert.alert('Delete this chat?', `${c.title}: the messages and story memory will be removed from this phone (for this account).`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteChat(c.storyId); load(); } },
    ]);

  if (chats && chats.length === 0) {
    return <Screen><Empty icon="chatbubbles-outline" title="No chats yet" body="Start a story and your chats will show up here." /></Screen>;
  }
  return (
    <Screen>
      <FlatList
        data={chats ?? []}
        keyExtractor={(c) => c.storyId}
        contentContainerStyle={{ padding: space.screen, gap: space.gap }}
        renderItem={({ item }) => (
          <Pressable onPress={() => open(item)} onLongPress={() => remove(item)} style={({ pressed }) => [s.row, { opacity: pressed ? 0.9 : 1 }]}>
            <Cover story={stories.find((x) => x.id === item.storyId) ?? chatStory(item)} iconSize={28} style={s.cover} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={s.title} numberOfLines={1}>{item.title}</Text>
              <Text style={s.preview} numberOfLines={2}>{preview(item)}</Text>
            </View>
            <View style={s.ep}><Text style={s.epText}>Ep {item.ep}</Text></View>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.gap, padding: 12, borderRadius: radius.card, backgroundColor: colors.surface },
  cover: { width: 64, height: 64, borderRadius: radius.inner },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  preview: { color: colors.sub, fontSize: 13, lineHeight: 18 },
  ep: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: radius.badge, backgroundColor: colors.accentSoft },
  epText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
});
