import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StoryCard } from '../components/StoryCard';
import { Chip, Empty } from '../components/Ui';
import { colors, radius, space } from '../theme';
import { GENRES, Story } from '../types';
import { fetchStories } from '../firebase/db';

export default function Search() {
  const nav = useNavigation<any>();
  const [all, setAll] = useState<Story[]>([]);
  const [q, setQ] = useState('');
  const [genre, setGenre] = useState<string | null>(null);
  useEffect(() => { fetchStories().then(setAll); }, []);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter((x) =>
      (!genre || x.genres.includes(genre)) &&
      (!t || x.title.toLowerCase().includes(t) || x.logline.toLowerCase().includes(t) || x.characters.some((c) => c.name.toLowerCase().includes(t)))
    );
  }, [all, q, genre]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: space.screen, gap: space.gap }}>
        <TextInput style={s.input} placeholder="Search stories or characters" placeholderTextColor={colors.sub} value={q} onChangeText={setQ} autoFocus returnKeyType="search" autoCorrect={false} />
        <FlatList horizontal showsHorizontalScrollIndicator={false} data={GENRES} keyExtractor={(g) => g} contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => <Chip label={item} active={genre === item} onPress={() => setGenre(genre === item ? null : item)} />} />
      </View>
      {results.length === 0 ? <Empty title="No results found" body="Try a different word or filter." /> : (
        <FlatList data={results} keyExtractor={(i) => i.id} contentContainerStyle={{ paddingHorizontal: space.screen, paddingBottom: space.section, gap: space.gap }}
          renderItem={({ item }) => <StoryCard story={item} variant="row" onPress={() => nav.navigate('StoryDetail', { story: item })} />} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  input: { height: 48, borderRadius: radius.btn, backgroundColor: colors.surface, paddingHorizontal: space.card, color: colors.text, fontSize: 16 },
});
