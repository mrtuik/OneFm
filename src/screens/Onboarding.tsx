import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Logo } from '../components/Logo';
import { Chip, GradientButton, OutlineButton } from '../components/Ui';
import { colors } from '../theme';
import { LANGS, LANG_LABEL, Lang, VOICES } from '../types';
import { useSettings } from '../state/settings';
import { emailSignIn, emailSignUp, friendlyAuthError, googleSignIn } from '../firebase/auth';

function Frame({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 24, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Hero({ line }: { line: string }) {
  return (
    <View style={s.hero}>
      <Logo size={64} />
      <Text style={s.brand}>One Fm</Text>
      <Text style={s.line}>{line}</Text>
    </View>
  );
}

export function AgeScreen() {
  const { update } = useSettings();
  const [ok, setOk] = useState(false);
  return (
    <Frame>
      <Hero line="Stories you can talk to, and hear back." />
      <View style={{ gap: 16 }}>
        <Pressable onPress={() => setOk(!ok)} style={[s.check, ok && { borderColor: colors.amber }]}>
          <View style={[s.box, ok && { backgroundColor: colors.amber, borderColor: colors.amber }]}>
            {ok ? <Text style={{ color: '#1A0B10', fontWeight: '800' }}>{'\u2713'}</Text> : null}
          </View>
          <Text style={s.checkText}>Ami confirm korchi amar boyosh 18 ba tar beshi.</Text>
        </Pressable>
        <GradientButton title="Continue" disabled={!ok} onPress={() => update({ ageConfirmed: true })} />
      </View>
    </Frame>
  );
}

export function LoginScreen() {
  const { update } = useSettings();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const run = async (fn: () => Promise<unknown>) => {
    setErr('');
    setBusy(true);
    try { await fn(); } catch (e) { setErr(friendlyAuthError(e)); } finally { setBusy(false); }
  };

  return (
    <Frame>
      <Hero line="Login koro, na hole guest hoye ghure dekho." />
      <View style={{ gap: 12 }}>
        <TextInput style={s.input} placeholder="Email" placeholderTextColor={colors.sub} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={s.input} placeholder="Password" placeholderTextColor={colors.sub} secureTextEntry value={pw} onChangeText={setPw} />
        {err ? <Text style={s.err}>{err}</Text> : null}
        {busy ? <ActivityIndicator color={colors.amber} style={{ height: 52 }} /> : (
          <>
            <GradientButton title="Sign in" onPress={() => run(() => emailSignIn(email, pw))} />
            <OutlineButton title="Create account" onPress={() => run(() => emailSignUp(email, pw))} />
            <OutlineButton title="Continue with Google" onPress={() => run(googleSignIn)} />
          </>
        )}
        <Pressable onPress={() => update({ guest: true })} style={{ alignSelf: 'center', padding: 12 }}>
          <Text style={{ color: colors.sub, fontSize: 14 }}>Guest hishebe dhukbo</Text>
        </Pressable>
      </View>
    </Frame>
  );
}

export function LanguageScreen() {
  const { s: st, update } = useSettings();
  const [lang, setLang] = useState<Lang>('bn');
  const [vi, setVi] = useState(0);
  const voices = VOICES[lang];
  return (
    <Frame>
      <Hero line="Kon bhashay pochhondo? Ta ekhon thikh kore nao, pore Profile e bodlano jabe." />
      <View style={{ flex: 1, justifyContent: 'flex-end', gap: 20 }}>
        <View style={{ gap: 10 }}>
          <Text style={s.label}>Reading language</Text>
          <View style={s.row}>
            {LANGS.map((l) => (
              <Chip key={l} label={LANG_LABEL[l]} active={l === lang} onPress={() => { setLang(l); setVi(0); }} />
            ))}
          </View>
        </View>
        <View style={{ gap: 10 }}>
          <Text style={s.label}>Voice</Text>
          <View style={s.row}>
            {voices.map((v, i) => (
              <Chip key={v} label={v} active={i === vi} onPress={() => setVi(i)} />
            ))}
          </View>
        </View>
        <GradientButton title="Continue" onPress={() => update({ language: lang, voice: voices[vi] })} />
      </View>
    </Frame>
  );
}

const s = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: 40, marginBottom: 48, gap: 14 },
  brand: { color: colors.text, fontSize: 34, fontWeight: '800', fontFamily: 'serif' },
  line: { color: colors.sub, fontSize: 15, textAlign: 'center', lineHeight: 22, maxWidth: 300 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  checkText: { color: colors.text, fontSize: 15, flex: 1, lineHeight: 21 },
  input: { height: 52, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line, paddingHorizontal: 16, color: colors.text, fontSize: 16 },
  err: { color: colors.rose, fontSize: 13 },
  label: { color: colors.sub, fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
});
