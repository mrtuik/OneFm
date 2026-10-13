import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StoryCard } from '../components/StoryCard';
import { Chip, GradientButton } from '../components/Ui';
import { colors, radius, space } from '../theme';
import { GENRES, LANGS, LANG_LABEL, Lang, Visibility } from '../types';
import { useSettings } from '../state/settings';
import { Checked, checkStory, createPost, parseStoryText } from '../firebase/community';

type Mode = 'form' | 'json';

/** Picks a picture, shrinks it to about 720 px wide and returns it as a small data: link (it is stored in the post). */
async function pickCover(): Promise<string | null> {
  // @ts-ignore: added in package.json; require keeps the app starting if a module is missing
  const IP = require('expo-image-picker');
  // @ts-ignore
  const IM = require('expo-image-manipulator');
  const res = await IP.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 1 });
  if (res.canceled || !res.assets?.length) return null;
  const out = await IM.manipulateAsync(res.assets[0].uri, [{ resize: { width: 720 } }], { compress: 0.6, format: IM.SaveFormat.JPEG, base64: true });
  if (!out.base64) throw new Error('The picture could not be read.');
  if (out.base64.length > 450000) throw new Error('The picture is too big. Pick a simpler one.');
  return `data:image/jpeg;base64,${out.base64}`;
}

const parseLines = (t: string) => t.split('\n').map((l) => l.trim()).filter(Boolean);

export default function CreatePost() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { s: st } = useSettings();
  const [mode, setMode] = useState<Mode>('form');
  const [json, setJson] = useState('');
  const [title, setTitle] = useState('');
  const [logline, setLogline] = useState('');
  const [genre, setGenre] = useState(GENRES[0]);
  const [lang, setLang] = useState<Lang>(st.language ?? 'bn');
  const [setting, setSetting] = useState('');
  const [tone, setTone] = useState('');
  const [chars, setChars] = useState('');
  const [eps, setEps] = useState('');
  const [caption, setCaption] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<Visibility>('public');
  const [agree, setAgree] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const checked: Checked = useMemo(() => {
    if (mode === 'json') return parseStoryText(json);
    return checkStory({
      title, logline, language: lang, genres: [genre], setting, tone,
      characters: parseLines(chars).map((l) => {
        const g = l.match(/\((m|f)\)\s*$/i);
        const body = l.replace(/\((m|f)\)\s*$/i, '').trim();
        const [name, ...rest] = body.split(/\s+[-\u2013\u2014]\s+|\s*\|\s*/);
        return { name: (name ?? '').trim(), role: rest.join(' - ').trim() || 'Character', gender: g ? (g[1].toLowerCase() === 'm' ? 'male' : 'female') : undefined };
      }),
      episodes: parseLines(eps).map((goal) => ({ goal })),
    });
  }, [mode, json, title, logline, genre, lang, setting, tone, chars, eps]);

  const preview = checked.story ? { ...checked.story, image: image ?? undefined, creatorName: 'You' } : null;

  const pick = async () => {
    try { const img = await pickCover(); if (img) setImage(img); }
    catch (e: any) { Alert.alert('Could not add the picture', String(e?.message ?? e)); }
  };

  const post = async () => {
    setTried(true);
    if (!checked.story) return;
    if (!agree) { Alert.alert('One more thing', 'Please confirm the story is yours (or public domain).'); return; }
    setBusy(true);
    try {
      await createPost({ ...checked.story, image: image ?? undefined }, caption, visibility);
      nav.goBack();
    } catch (e: any) {
      Alert.alert('Could not post', String(e?.message ?? e));
    } finally { setBusy(false); }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.screen, gap: space.gap, paddingBottom: insets.bottom + space.section }} keyboardShouldPersistTaps="handled">
      <View style={s.row}>
        <Chip label="Fill a form" active={mode === 'form'} onPress={() => setMode('form')} />
        <Chip label="Paste story JSON" active={mode === 'json'} onPress={() => setMode('json')} />
      </View>

      {mode === 'json' ? (
        <View style={s.card}>
          <Text style={s.hint}>Paste the JSON your story-maker AI gave you (the master prompt format). It is checked before it is posted. This gives the richest stories.</Text>
          <TextInput style={[s.input, { minHeight: 220, maxHeight: 360, paddingTop: 12 }]} multiline textAlignVertical="top" placeholder='{ "title": "...", "logline": "...", ... }' placeholderTextColor={colors.sub} value={json} onChangeText={setJson} autoCapitalize="none" autoCorrect={false} />
        </View>
      ) : (
        <View style={s.card}>
          <Text style={s.label}>Title</Text>
          <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="Story name" placeholderTextColor={colors.sub} />
          <Text style={s.label}>One-line story (logline)</Text>
          <TextInput style={[s.input, s.multi]} value={logline} onChangeText={setLogline} multiline textAlignVertical="top" placeholder="Who wants what, and what is in the way" placeholderTextColor={colors.sub} />
          <Text style={s.label}>Genre</Text>
          <View style={s.row}>{GENRES.map((g) => <Chip key={g} label={g} active={g === genre} onPress={() => setGenre(g)} />)}</View>
          <Text style={s.label}>Language</Text>
          <View style={s.row}>{LANGS.map((l) => <Chip key={l} label={LANG_LABEL[l]} active={l === lang} onPress={() => setLang(l)} />)}</View>
          <Text style={s.label}>Setting (optional)</Text>
          <TextInput style={[s.input, s.multi]} value={setting} onChangeText={setSetting} multiline textAlignVertical="top" placeholder="Where and when, with real details (smell, sound, objects)" placeholderTextColor={colors.sub} />
          <Text style={s.label}>Tone (optional)</Text>
          <TextInput style={s.input} value={tone} onChangeText={setTone} placeholder="Soft, slow burn, no filmy drama..." placeholderTextColor={colors.sub} />
          <Text style={s.label}>Characters, one per line</Text>
          <Text style={s.hint}>Name - role. Add (m) or (f) for a male or female role. Everyone must be 18 or older.</Text>
          <TextInput style={[s.input, s.multi, { minHeight: 100 }]} value={chars} onChangeText={setChars} multiline textAlignVertical="top" placeholder={'Meera (f) - shy girl with a notebook\nArjun (m) - the new boy'} placeholderTextColor={colors.sub} />
          <Text style={s.label}>Episodes, one goal per line</Text>
          <TextInput style={[s.input, s.multi, { minHeight: 100 }]} value={eps} onChangeText={setEps} multiline textAlignVertical="top" placeholder={'Meet in the classroom\nThe sticky note secret'} placeholderTextColor={colors.sub} />
        </View>
      )}

      <View style={s.card}>
        <Text style={s.label}>Cover picture (optional)</Text>
        {image ? (
          <View>
            <Image source={{ uri: image }} style={s.thumb} resizeMode="cover" />
            <Pressable onPress={() => setImage(null)} style={s.remove} hitSlop={8}><Ionicons name="close" size={18} color={colors.text} /></Pressable>
          </View>
        ) : (
          <Pressable onPress={pick} style={s.pick}>
            <Ionicons name="image-outline" size={22} color={colors.accent} />
            <Text style={s.pickText}>Choose from gallery</Text>
          </Pressable>
        )}
        <Text style={s.label}>Who can see it</Text>
        <View style={s.row}>
          <Chip label="Public (Community)" active={visibility === 'public'} onPress={() => setVisibility('public')} />
          <Chip label="Private (only me)" active={visibility === 'private'} onPress={() => setVisibility('private')} />
        </View>
        <Text style={s.label}>Say something about it (optional)</Text>
        <TextInput style={s.input} value={caption} onChangeText={setCaption} maxLength={200} placeholder="A short note for readers" placeholderTextColor={colors.sub} />
      </View>

      {tried && checked.errors.length ? (
        <View style={[s.card, { backgroundColor: colors.accentSoft }]}>
          <Text style={s.errTitle}>Fix this first</Text>
          {checked.errors.map((e, i) => <Text key={i} style={s.err}>{`\u2022 ${e}`}</Text>)}
        </View>
      ) : null}

      {preview ? (
        <View style={{ gap: 8 }}>
          <Text style={s.label}>Preview</Text>
          <StoryCard story={preview} variant="row" onPress={() => {}} />
          {checked.warnings.map((w, i) => <Text key={i} style={s.warn}>{`Tip: ${w}`}</Text>)}
        </View>
      ) : null}

      <Pressable onPress={() => setAgree((v) => !v)} style={s.agree}>
        <Ionicons name={agree ? 'checkbox' : 'square-outline'} size={22} color={agree ? colors.accent : colors.sub} />
        <Text style={s.agreeText}>I wrote this story, or it is public domain. It is not copied from a book, film or app, and it has no sexual or abusive content.</Text>
      </Pressable>

      {busy ? <ActivityIndicator color={colors.accent} /> : <GradientButton title={visibility === 'private' ? 'Save privately' : 'Post story'} onPress={post} />}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { padding: space.card, borderRadius: radius.card, backgroundColor: colors.surface, gap: 8 },
  label: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 4 },
  hint: { color: colors.sub, fontSize: 13, lineHeight: 18 },
  input: { minHeight: 46, borderRadius: radius.btn, backgroundColor: colors.bg, paddingHorizontal: 14, color: colors.text, fontSize: 15 },
  multi: { minHeight: 70, paddingTop: 12 },
  thumb: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.btn },
  remove: { position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center' },
  pick: { height: 52, borderRadius: radius.btn, backgroundColor: colors.accentSoft, flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center' },
  pickText: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  errTitle: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  err: { color: colors.text, fontSize: 13, lineHeight: 19 },
  warn: { color: colors.sub, fontSize: 12, lineHeight: 17 },
  agree: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 4 },
  agreeText: { flex: 1, color: colors.sub, fontSize: 13, lineHeight: 18 },
});
