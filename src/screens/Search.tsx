import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { StoryCard } from '../components/StoryCard';
import { Chip, Empty } from '../components/Ui';
import { colors } from '../theme';
import { GENRES, LANGS, LANG_LABEL, Lang, Story } from '../types';
import { fetchStories } from '../firebase/db';

export default function Search() {
  const nav = useNavigation<any>();
  const [all, setAll] = useState<Story[]>([]);
  const [q, setQ] = useState('');
  const [genre, setGenre] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang | null>(null);
  useEffect(() => { fetchStories().then(setAll); }, []);

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    return all.filter((x) =>
      (!genre || x.genres.includes(genre)) &&
      (!lang || x.language === lang) &&
      (!t || x.title.toLowerCase().includes(t) || x.logline.toLowerCase().includes(t) || x.characters.some((c) => c.name.toLowerCase().includes(t)))
    );
  }, [all, q, genre, lang]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ padding: 16, gap: 12 }}>
        <TextInput style={s.input} placeholder="Story ba character khojo" placeholderTextColor={colors.sub} value={q} onChangeText={setQ} />
        <FlatList horizontal showsHorizontalScrollIndicator={false} data={GENRES} keyExtractor={(g) => g} contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => <Chip label={item} active={genre === item} onPress={() => setGenre(genre === item ? null : item)} />} />
        <FlatList horizontal showsHorizontalScrollIndicator={false} data={LANGS} keyExtractor={(g) => g} contentContainerStyle={{ gap: 8 }}
          renderItem={({ item }) => <Chip label={LANG_LABEL[item]} active={lang === item} onPress={() => setLang(lang === item ? null : item)} />} />
      </View>
      {results.length === 0 ? <Empty title="Kichu pawa jay ni" body="Onno kono shobdo ba filter diye dekho." /> : (
        <FlatList data={results} keyExtractor={(i) => i.id} contentContainerStyle={{ padding: 16, gap: 14 }}
          renderItem={({ item }) => <StoryCard story={item} width="100%" height={200} onPress={() => nav.navigate('StoryDetail', { story: item })} />} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  input: { height: 48, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, paddingHorizontal: 16, color: colors.text, fontSize: 16 },
});
