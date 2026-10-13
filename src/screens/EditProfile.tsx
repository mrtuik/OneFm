import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getAuth } from '@react-native-firebase/auth';
import { Avatar } from '../components/PostCard';
import { Chip, GradientButton } from '../components/Ui';
import { colors, radius, space } from '../theme';
import { GENDER_LABEL, Gender } from '../types';
import { useSettings } from '../state/settings';
import { cleanUsername, fetchUser, isUsernameFree, saveMyProfile, usernameProblem } from '../firebase/community';

type Check = 'idle' | 'checking' | 'free' | 'taken' | 'bad';

/** Edit name, @username (unique), bio and gender. Saved to the database. */
export default function EditProfile() {
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { s: st, update } = useSettings();
  const uid = getAuth().currentUser?.uid;
  const [loaded, setLoaded] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [gender, setGender] = useState<Gender | null>(st.gender);
  const [avatar, setAvatar] = useState<string | undefined>();
  const [check, setCheck] = useState<Check>('idle');
  const [problem, setProblem] = useState('');
  const [saving, setSaving] = useState(false);
  const original = useRef('');

  useEffect(() => {
    if (!uid) { nav.goBack(); return; }
    fetchUser(uid).then((u) => {
      setName(u.name); setUsername(u.username ?? ''); setBio(u.bio ?? ''); setAvatar(u.avatarUrl);
      if (u.gender) setGender(u.gender);
      original.current = u.username ?? '';
      setLoaded(true);
    });
  }, [uid]);

  // Check the username while typing (after a short pause).
  useEffect(() => {
    const v = cleanUsername(username);
    if (!loaded || !v || v === original.current) { setCheck('idle'); setProblem(''); return; }
    const bad = usernameProblem(v);
    if (bad) { setCheck('bad'); setProblem(bad); return; }
    setCheck('checking'); setProblem('');
    let live = true;
    const t = setTimeout(async () => {
      try { const free = await isUsernameFree(v); if (live) setCheck(free ? 'free' : 'taken'); }
      catch { if (live) setCheck('idle'); }
    }, 450);
    return () => { live = false; clearTimeout(t); };
  }, [username, loaded]);

  const save = async () => {
    setSaving(true);
    try {
      await saveMyProfile({ name, username, bio, gender });
      if (gender) update({ gender });
      nav.goBack();
    } catch (e: any) {
      Alert.alert('Could not save', String(e?.message ?? e));
    } finally { setSaving(false); }
  };

  if (!loaded) return <View style={s.center}><ActivityIndicator color={colors.accent} /></View>;

  const note =
    check === 'bad' ? { text: problem, color: colors.accent } :
    check === 'taken' ? { text: 'That username is taken.', color: colors.accent } :
    check === 'free' ? { text: 'Available.', color: '#4CC38A' } :
    check === 'checking' ? { text: 'Checking...', color: colors.sub } :
    { text: 'Small letters, numbers, dot and underscore. 3 to 20 characters.', color: colors.sub };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.screen, gap: space.gap, paddingBottom: insets.bottom + space.section }} keyboardShouldPersistTaps="handled">
      <View style={{ alignItems: 'center', paddingVertical: space.gap }}>
        <Avatar name={name} url={avatar} size={84} />
      </View>

      <View style={s.card}>
        <Text style={s.label}>Name</Text>
        <TextInput style={s.input} value={name} onChangeText={setName} maxLength={40} placeholder="Your name" placeholderTextColor={colors.sub} />

        <Text style={s.label}>Username</Text>
        <View style={s.userRow}>
          <Text style={s.at}>@</Text>
          <TextInput style={[s.input, { flex: 1 }]} value={username} onChangeText={(v) => setUsername(v.toLowerCase())} maxLength={20} autoCapitalize="none" autoCorrect={false} placeholder="username" placeholderTextColor={colors.sub} />
          {check === 'free' ? <Ionicons name="checkmark-circle" size={22} color="#4CC38A" /> : null}
        </View>
        <Text style={[s.hint, { color: note.color }]}>{note.text}</Text>

        <Text style={s.label}>About you</Text>
        <TextInput style={[s.input, { minHeight: 80, paddingTop: 12 }]} value={bio} onChangeText={setBio} maxLength={160} multiline textAlignVertical="top" placeholder="A line about you" placeholderTextColor={colors.sub} />

        <Text style={s.label}>I am</Text>
        <View style={s.row}>
          {(['male', 'female'] as Gender[]).map((g) => <Chip key={g} label={GENDER_LABEL[g]} active={gender === g} onPress={() => setGender(g)} />)}
        </View>
        <Text style={s.hint}>You play roles that match you.</Text>
      </View>

      {saving ? <ActivityIndicator color={colors.accent} style={{ height: 52 }} /> : <GradientButton title="Save" disabled={check === 'bad' || check === 'taken' || check === 'checking'} onPress={save} />}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  card: { padding: space.card, borderRadius: radius.card, backgroundColor: colors.surface, gap: 8 },
  label: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 6 },
  input: { minHeight: 46, borderRadius: radius.btn, backgroundColor: colors.bg, paddingHorizontal: 14, color: colors.text, fontSize: 15 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  at: { color: colors.sub, fontSize: 18, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { color: colors.sub, fontSize: 12, lineHeight: 17 },
});
