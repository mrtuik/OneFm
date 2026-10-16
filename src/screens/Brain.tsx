import React, { ReactNode, useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FS from 'expo-file-system/legacy';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chip, GradientButton, OutlineButton } from '../components/Ui';
import { colors, radius, space } from '../theme';
import { LANGS, LANG_LABEL, Lang } from '../types';
import { useSettings } from '../state/settings';
import { getAiKey } from '../ai/secure';
import { Lesson, Source, addLesson, addSource, deleteLesson, deleteSource, fetchLessons, listSources, splitPages, studyOnce } from '../brain/brain';

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={s.card}>
      <View style={{ gap: 2 }}>
        <Text style={s.cardTitle}>{title}</Text>
        {hint ? <Text style={s.hint}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/** Admin screen: the novels the app learns from, and the lessons it has learned so far. */
export default function Brain() {
  const insets = useSafeAreaInsets();
  const { s: st } = useSettings();
  const [sources, setSources] = useState<Source[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [lang, setLang] = useState<Lang>(st.language ?? 'bn');
  const [paste, setPaste] = useState('');
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [mine, setMine] = useState('');
  const [mineScope, setMineScope] = useState<'all' | Lang>('all');

  const reload = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([listSources(), fetchLessons()]);
      setSources(a); setLessons(b);
    } catch (e: any) {
      Alert.alert('Could not load', String(e?.message ?? e));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  const text = file?.text ?? paste;
  const pages = text.trim() ? splitPages(text).length : 0;

  const pickFile = async () => {
    try {
      // @ts-ignore: expo-document-picker is added in package.json, require keeps the app starting if it is missing
      const DP = require('expo-document-picker');
      const res = await DP.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      setBusy('Reading the file...');
      const t = await FS.readAsStringAsync(a.uri);
      setFile({ name: a.name ?? 'file', text: t });
      if (!title.trim()) setTitle(String(a.name ?? '').replace(/\.[^.]+$/, ''));
    } catch (e: any) {
      Alert.alert('Could not read the file', `Use a plain text file (.txt or .md). A PDF must be converted to text first.\n\n${String(e?.message ?? e)}`);
    } finally { setBusy(null); }
  };

  const fetchLink = async () => {
    const u = link.trim();
    if (!/^https?:\/\//i.test(u)) { Alert.alert('Link needed', 'Paste a link to a plain text file (for example a GitHub raw link).'); return; }
    setBusy('Downloading...');
    try {
      const r = await fetch(u);
      if (!r.ok) throw new Error(`The link answered ${r.status}.`);
      setFile({ name: u.split('/').pop() || 'link', text: await r.text() });
    } catch (e: any) {
      Alert.alert('Could not download', String(e?.message ?? e));
    } finally { setBusy(null); }
  };

  const save = async () => {
    if (!title.trim()) { Alert.alert('Title needed', 'Give the novel a name.'); return; }
    if (pages < 2) { Alert.alert('Text needed', 'Paste or load the novel text first.'); return; }
    setBusy('Saving 0%');
    try {
      await addSource({ title, language: lang, text }, (d, t) => setBusy(`Saving ${Math.round((d / t) * 100)}%`));
      setTitle(''); setPaste(''); setFile(null); setLink('');
      await reload();
      Alert.alert('Saved', 'The novel is in the database. The app will study a few pages of it now and then.');
    } catch (e: any) {
      Alert.alert('Saving failed', String(e?.message ?? e));
    } finally { setBusy(null); }
  };

  const saveMine = async () => {
    try {
      const l = await addLesson(mine, mineScope);
      setLessons((x) => [l, ...x]); setMine('');
    } catch (e: any) { Alert.alert('Could not add', String(e?.message ?? e)); }
  };

  const study = async () => {
    const key = await getAiKey(st.provider);
    if (!key) { Alert.alert('AI key needed', 'Add your AI provider key in Profile first.'); return; }
    setBusy('Studying pages...');
    try {
      const r = await studyOnce(st.provider, key);
      await reload();
      Alert.alert('Done', r.added.length ? `Read ${r.pages} pages of "${r.source}" and learned ${r.added.length} new lesson${r.added.length > 1 ? 's' : ''}.` : `Read ${r.pages} pages of "${r.source}". Nothing new to add this time.`);
    } catch (e: any) {
      Alert.alert('Study failed', String(e?.message ?? e));
    } finally { setBusy(null); }
  };

  const removeSource = (x: Source) => Alert.alert('Remove this novel?', `"${x.title}" and its pages will be deleted. Lessons already learned stay.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: async () => { try { await deleteSource(x.id); await reload(); } catch (e: any) { Alert.alert('Failed', String(e?.message ?? e)); } } },
  ]);
  const removeLesson = (x: Lesson) => Alert.alert('Delete this lesson?', x.text, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { try { await deleteLesson(x.id); setLessons((l) => l.filter((y) => y.id !== x.id)); } catch (e: any) { Alert.alert('Failed', String(e?.message ?? e)); } } },
  ]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.screen, gap: space.gap, paddingBottom: insets.bottom + space.section }} keyboardShouldPersistTaps="handled">
      <Card title="How it works" hint="Add novels as text. Now and then (every few hours when you open the app, or when you tap Study now) the app reads 2 or 3 pages, writes down the writing techniques it sees, and uses a few of them in every story chat. It keeps technique only, never copied lines. Only you (admin) can read the novel pages.">
        <GradientButton title={busy?.startsWith('Studying') ? 'Studying...' : 'Study now'} onPress={study} disabled={!!busy || !sources.length} />
      </Card>

      <Card title="Add a novel" hint="Plain text (.txt or .md). A PDF must be converted to text first.">
        <TextInput style={s.input} placeholder="Novel name" placeholderTextColor={colors.sub} value={title} onChangeText={setTitle} />
        <View style={s.row}>
          {LANGS.map((l) => <Chip key={l} label={LANG_LABEL[l]} active={l === lang} onPress={() => setLang(l)} />)}
        </View>
        {file ? (
          <View style={s.fileBox}>
            <Ionicons name="document-text-outline" size={22} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={s.itemTitle} numberOfLines={1}>{file.name}</Text>
              <Text style={s.hint}>{file.text.length.toLocaleString()} characters, about {pages} pages</Text>
            </View>
            <Pressable onPress={() => setFile(null)} hitSlop={8}><Ionicons name="close-circle" size={22} color={colors.sub} /></Pressable>
          </View>
        ) : (
          <>
            <OutlineButton title="Pick a text file" icon="document-outline" onPress={pickFile} />
            <TextInput style={[s.input, s.paste]} placeholder="...or paste a few chapters here" placeholderTextColor={colors.sub} value={paste} onChangeText={setPaste} multiline textAlignVertical="top" />
            <View style={s.linkRow}>
              <TextInput style={[s.input, { flex: 1 }]} placeholder="...or a link to a .txt file" placeholderTextColor={colors.sub} value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
              <Pressable onPress={fetchLink} style={s.go}><Ionicons name="download-outline" size={20} color={colors.accent} /></Pressable>
            </View>
            {paste.trim() ? <Text style={s.hint}>About {pages} pages</Text> : null}
          </>
        )}
        <GradientButton title={busy && busy.startsWith('Saving') ? busy : 'Save novel'} onPress={save} disabled={!!busy} />
      </Card>

      {busy && !busy.startsWith('Saving') ? <View style={s.busy}><ActivityIndicator color={colors.accent} /><Text style={s.hint}>{busy}</Text></View> : null}

      <Card title={`Novels (${sources.length})`}>
        {loading ? <ActivityIndicator color={colors.accent} /> : sources.length === 0 ? <Text style={s.hint}>No novel yet.</Text> : sources.map((x) => (
          <View key={x.id} style={s.item}>
            <View style={{ flex: 1 }}>
              <Text style={s.itemTitle}>{x.title}</Text>
              <Text style={s.hint}>{LANG_LABEL[x.language]}  ·  {x.pageCount} pages  ·  studied {x.studyCount}x</Text>
            </View>
            <Pressable onPress={() => removeSource(x)} hitSlop={8}><Ionicons name="trash-outline" size={20} color={colors.sub} /></Pressable>
          </View>
        ))}
      </Card>

      <Card title="Add a lesson yourself" hint="One clear tip for the story writer, 20 to 260 characters. It reaches every reader the next time they open the app.">
        <TextInput style={[s.input, { minHeight: 80, paddingTop: 12 }]} placeholder="Example: Let a character answer a question with an action, not words." placeholderTextColor={colors.sub} value={mine} onChangeText={setMine} multiline textAlignVertical="top" maxLength={260} />
        <View style={s.row}>
          <Chip label="All languages" active={mineScope === 'all'} onPress={() => setMineScope('all')} />
          {LANGS.map((l) => <Chip key={l} label={LANG_LABEL[l] + ' only'} active={mineScope === l} onPress={() => setMineScope(l)} />)}
        </View>
        <GradientButton title="Add lesson" onPress={saveMine} disabled={mine.trim().length < 20} />
      </Card>

      <Card title={`What it learned (${lessons.length})`} hint="A few of these go into every story chat. Delete any that look wrong.">
        {lessons.length === 0 ? <Text style={s.hint}>Nothing yet. Add a novel and tap Study now.</Text> : lessons.map((x) => (
          <View key={x.id} style={s.item}>
            <View style={{ flex: 1 }}>
              <Text style={s.lesson}>{x.text}</Text>
              <Text style={s.hint}>{x.tag}  ·  {x.scope === 'all' ? 'all languages' : LANG_LABEL[x.scope]}{x.sourceTitle ? `  ·  ${x.sourceTitle}` : ''}</Text>
            </View>
            <Pressable onPress={() => removeLesson(x)} hitSlop={8}><Ionicons name="close" size={20} color={colors.sub} /></Pressable>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  card: { padding: space.card, borderRadius: radius.card, backgroundColor: colors.surface, gap: space.gap },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  hint: { color: colors.sub, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { minHeight: 46, borderRadius: radius.btn, backgroundColor: colors.bg, paddingHorizontal: 14, color: colors.text, fontSize: 15 },
  paste: { minHeight: 110, maxHeight: 200, paddingTop: 12 },
  linkRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  go: { width: 46, height: 46, borderRadius: radius.btn, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  fileBox: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.btn, backgroundColor: colors.bg },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'center', padding: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.btn, backgroundColor: '#1F1A1A' },
  itemTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  lesson: { color: colors.text, fontSize: 14, lineHeight: 20, marginBottom: 4 },
});
