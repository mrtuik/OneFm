import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CommonActions, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAuth } from '@react-native-firebase/auth';
import { Cover } from '../components/Cover';
import { GradientButton } from '../components/Ui';
import { colors, radius, space } from '../theme';
import { Story } from '../types';
import { SAMPLE_STORIES } from '../data/samples';
import { applyEdit, clearStoryEdit, saveStoryEdit, StoryEdit } from '../firebase/db';
import { isAdmin } from '../firebase/community';

/** Picks a square picture, shrinks it to 600 px and returns it as a small data: link. It is stored in the database, so every reader sees it. */
async function pickThumbnail(): Promise<string | null> {
  // @ts-ignore: added in package.json; require keeps the app starting if a module is missing
  const IP = require('expo-image-picker');
  // @ts-ignore
  const IM = require('expo-image-manipulator');
  const res = await IP.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
  if (res.canceled || !res.assets?.length) return null;
  const out = await IM.manipulateAsync(res.assets[0].uri, [{ resize: { width: 600 } }], { compress: 0.6, format: IM.SaveFormat.JPEG, base64: true });
  if (!out.base64) throw new Error('The picture could not be read.');
  if (out.base64.length > 200000) throw new Error('The picture is too big. Pick a simpler one.');
  return `data:image/jpeg;base64,${out.base64}`;
}

/** Developer only: change the thumbnail, the story name, the short description and the episode names. */
export default function EditStory() {
  const { story, postId, detailKey } = useRoute<any>().params as { story: Story; postId?: string; detailKey?: string };
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState(story.title);
  const [highlight, setHighlight] = useState(story.highlight);
  const [logline, setLogline] = useState(story.logline);
  const [image, setImage] = useState<string | undefined>(story.image);
  const [eps, setEps] = useState<string[]>(story.episodes.map((e) => e.title ?? ''));
  const [saving, setSaving] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  React.useEffect(() => { isAdmin(getAuth().currentUser?.uid).then(setAllowed); }, []);

  if (allowed === null) return <View style={s.center}><ActivityIndicator color={colors.accent} /></View>;
  if (!allowed) return <View style={s.center}><Text style={s.hint}>Only the developer account can edit stories.</Text></View>;

  const original = postId ? undefined : SAMPLE_STORIES.find((x) => x.id === story.id);
  const preview: Story = { ...story, image };

  const close = (updated: Story) => {
    if (detailKey) nav.dispatch({ ...CommonActions.setParams({ story: updated }), source: detailKey });
    nav.goBack();
  };

  const choose = async () => {
    try { const uri = await pickThumbnail(); if (uri) setImage(uri); }
    catch (e: any) { Alert.alert('Could not use the picture', String(e?.message ?? e)); }
  };

  const save = async () => {
    const t = title.trim();
    if (t.length < 2) { Alert.alert('Name needed', 'Write the story name.'); return; }
    let h = highlight.trim();
    if (!h || !t.toLowerCase().includes(h.toLowerCase())) h = t.split(' ')[0]; // the pink word must be a word of the name
    const epMap: Record<string, { title: string }> = {};
    eps.forEach((x, i) => { if (x.trim()) epMap[String(i)] = { title: x.trim() }; });
    const edit: StoryEdit = { title: t, highlight: h, logline: logline.trim() || undefined, image, episodes: Object.keys(epMap).length ? epMap : undefined };
    setSaving(true);
    try {
      await saveStoryEdit(story, edit, postId);
      close(applyEdit(story, edit));
    } catch (e: any) {
      Alert.alert('Could not save', String(e?.message ?? e));
    } finally { setSaving(false); }
  };

  const reset = () => Alert.alert('Back to the original?', 'The thumbnail and names of this story go back to how they were built into the app.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Reset', style: 'destructive', onPress: async () => {
      try { await clearStoryEdit(story.id); close(original!); }
      catch (e: any) { Alert.alert('Could not reset', String(e?.message ?? e)); }
    } },
  ]);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.screen, gap: space.gap, paddingBottom: insets.bottom + space.section }} keyboardShouldPersistTaps="handled">
      <View style={{ alignItems: 'center', gap: 12 }}>
        <Cover story={preview} iconSize={64} style={s.thumb} />
        <Pressable onPress={choose} style={s.pick}><Ionicons name="image-outline" size={18} color={colors.accent} /><Text style={s.pickText}>Change thumbnail</Text></Pressable>
        {image && image !== story.image ? <Text style={s.hint}>New picture chosen. Press Save to upload it.</Text> : null}
        {image ? <Pressable onPress={() => setImage(undefined)}><Text style={s.link}>Remove picture</Text></Pressable> : null}
      </View>

      <View style={s.card}>
        <Text style={s.label}>Story name</Text>
        <TextInput style={s.input} value={title} onChangeText={setTitle} maxLength={60} placeholder="Story name" placeholderTextColor={colors.sub} />
        <Text style={s.label}>Pink word</Text>
        <TextInput style={s.input} value={highlight} onChangeText={setHighlight} maxLength={30} autoCapitalize="none" placeholder="A word of the name" placeholderTextColor={colors.sub} />
        <Text style={s.hint}>This word of the name is shown in pink.</Text>
        <Text style={s.label}>Short description</Text>
        <TextInput style={[s.input, { minHeight: 90, paddingTop: 12 }]} value={logline} onChangeText={setLogline} maxLength={300} multiline textAlignVertical="top" placeholder="One or two lines" placeholderTextColor={colors.sub} />
      </View>

      <View style={s.card}>
        <Text style={s.label}>Episode names</Text>
        {story.episodes.map((e, i) => (
          <View key={i} style={{ gap: 4 }}>
            <Text style={s.hint} numberOfLines={1}>Episode {i + 1}{e.goal ? `  ·  ${e.goal}` : ''}</Text>
            <TextInput style={s.input} value={eps[i] ?? ''} onChangeText={(v) => setEps((a) => a.map((x, j) => (j === i ? v : x)))} maxLength={50} placeholder={`Episode ${i + 1}`} placeholderTextColor={colors.sub} />
          </View>
        ))}
      </View>

      {saving ? <ActivityIndicator color={colors.accent} style={{ height: 52 }} /> : <GradientButton title="Save" onPress={save} />}
      {original ? <Pressable onPress={reset} style={{ alignItems: 'center', padding: 10 }}><Text style={s.link}>Reset to original</Text></Pressable> : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: space.screen },
  thumb: { width: 200, height: 200, borderRadius: radius.card },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.btn, backgroundColor: colors.accentSoft },
  pickText: { color: colors.accent, fontSize: 14, fontWeight: '800' },
  card: { padding: space.card, borderRadius: radius.card, backgroundColor: colors.surface, gap: 8 },
  label: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 6 },
  input: { minHeight: 46, borderRadius: radius.btn, backgroundColor: colors.bg, paddingHorizontal: 14, color: colors.text, fontSize: 15 },
  hint: { color: colors.sub, fontSize: 12, lineHeight: 17 },
  link: { color: colors.sub, fontSize: 13, textDecorationLine: 'underline' },
});
