import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Keyboard, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RichText } from '../components/RichText';
import { TypingDots } from '../components/TypingDots';
import { VoiceChip } from '../components/VoiceChip';
import { GradientButton } from '../components/Ui';
import { colors, radius, space } from '../theme';
import { ChatMessage, ChatState, Story } from '../types';
import { useSettings } from '../state/settings';
import { getApiKey } from '../ai/secure';
import { deleteChat, loadChat, newChat, saveChat } from '../chat/store';
import { TurnOptions, takeTurn } from '../chat/engine';
import { isVoiceReady, speak, stopSpeaking } from '../voice/engine';
import { incrementPlay } from '../firebase/db';

const FONT = { small: 14, medium: 16, large: 18 } as const;

export default function Chat() {
  const { story } = useRoute<any>().params as { story: Story };
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { s } = useSettings();

  const [chat, setChat] = useState<ChatState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const chatRef = useRef<ChatState | null>(null);
  const busyRef = useRef(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const [kbOpen, setKbOpen] = useState(false);
  const font = FONT[s.textSize];
  const voiceId = s.voices[story.language];

  const setBoth = (c: ChatState) => { chatRef.current = c; setChat(c); };

  useEffect(() => {
    loadChat(story.id).then((c) => { setBoth(c ?? newChat(story)); setLoaded(true); });
    return () => stopSpeaking();
  }, [story.id]);

  useFocusEffect(useCallback(() => { getApiKey().then((k) => setHasKey(!!k)); }, []));

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => { setKbOpen(true); setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 60); });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const run = useCallback(async (opts: TurnOptions) => {
    if (!chatRef.current || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    const startedAt = Date.now();
    try {
      const key = await getApiKey();
      const final = await takeTurn(story, chatRef.current, opts, s.provider, key, setBoth);
      const ai = [...final.messages].reverse().find((m) => m.role === 'ai' && m.createdAt >= startedAt);
      if (ai?.speech && s.autoPlay && (await isVoiceReady(story.language, voiceId))) speak(ai.id, ai.speech, story.language, voiceId);
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [story, s.provider, s.autoPlay, voiceId]);

  // A new chat opens the first episode by itself.
  const empty = loaded && !!chat && chat.messages.length === 0;
  useEffect(() => {
    if (empty && hasKey) { incrementPlay(story.id); run({ begin: true }); }
  }, [empty, hasKey]);

  const last = chat?.messages[chat.messages.length - 1];
  const waitingNext = last?.role === 'episode_end';
  const canType = !!hasKey && !busy && !waitingNext && !empty;
  const inputOn = !!hasKey && !waitingNext;

  // Open the keyboard by itself once the chat is ready (like a normal chat app).
  const readyToType = loaded && inputOn && !empty;
  useEffect(() => {
    if (!readyToType) return;
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [readyToType]);

  const send = (t: string) => {
    const text = t.trim();
    if (!text || !canType) return;
    stopSpeaking();
    setInput('');
    run({ userText: text });
  };

  const startNext = () => {
    const c = chatRef.current;
    if (!c) return;
    const l = c.messages[c.messages.length - 1];
    if (l && c.ep === l.ep) setBoth({ ...c, ep: c.ep + 1, epCount: 0 });
    run({ begin: true });
  };

  const retry = () => {
    const c = chatRef.current;
    if (!c) return;
    if (c.messages.length === 0) run({ begin: true });
    else run({});
  };

  const cycleCharacter = () => {
    const c = chatRef.current;
    if (!c || story.characters.length < 2) return;
    const i = story.characters.findIndex((x) => x.name === c.character);
    const next = story.characters[(i + 1) % story.characters.length].name;
    const n = { ...c, character: next };
    setBoth(n);
    saveChat(n);
  };

  const removeMessage = (m: ChatMessage) => {
    const c = chatRef.current;
    if (!c) return;
    const n = { ...c, messages: c.messages.filter((x) => x.id !== m.id) };
    setBoth(n);
    saveChat(n);
  };

  const onLongPress = (m: ChatMessage) => {
    const isLast = chat?.messages[chat.messages.length - 1]?.id === m.id;
    const buttons: { text: string; onPress: () => void; style?: 'destructive' }[] = [
      { text: 'Copy', onPress: () => Clipboard.setStringAsync(m.text) },
    ];
    if (m.role === 'ai' && isLast && !busy) buttons.push({ text: 'Regenerate', onPress: () => run({ regenerate: true }) });
    buttons.push({ text: 'Delete', style: 'destructive', onPress: () => removeMessage(m) });
    Alert.alert('Message', undefined, buttons, { cancelable: true });
  };

  const options = () => {
    Alert.alert('Chat options', undefined, [
      { text: 'Stop voice', onPress: () => stopSpeaking() },
      {
        text: 'Restart story', style: 'destructive',
        onPress: () => Alert.alert('Restart this story?', 'Your messages and the story memory will be deleted from this phone.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Restart', style: 'destructive', onPress: async () => { stopSpeaking(); await deleteChat(story.id); setBoth(newChat(story)); } },
        ]),
      },
    ], { cancelable: true });
  };

  const renderItem = ({ item }: { item: ChatMessage }) => {
    if (item.role === 'user') {
      return (
        <Pressable onLongPress={() => onLongPress(item)} style={s2.userCard}>
          <Text style={s2.userLabel}>YOU</Text>
          <Text style={[s2.userText, { fontSize: font, lineHeight: font * 1.5 }]}>{item.text}</Text>
        </Pressable>
      );
    }
    if (item.role === 'episode_end') {
      return (
        <View style={s2.endWrap}>
          <View style={s2.endLine} />
          <View style={s2.endPill}>
            <Ionicons name="checkmark-circle" size={16} color={colors.accent} />
            <Text style={s2.endTitle}>{item.text}</Text>
          </View>
          <View style={s2.endLine} />
        </View>
      );
    }
    const name = item.speaker ?? 'Narrator';
    return (
      <Pressable onLongPress={() => onLongPress(item)} style={s2.ai}>
        <View style={s2.speakerRow}>
          <View style={s2.avatar}><Text style={s2.avatarText}>{name.charAt(0).toUpperCase()}</Text></View>
          <Text style={s2.speaker}>{name}</Text>
        </View>
        <RichText text={item.text} style={{ color: colors.text, fontSize: font, lineHeight: font * 1.55 }} />
        {item.speech ? <View style={{ marginTop: 14 }}><VoiceChip id={item.id} text={item.speech} lang={story.language} voiceId={voiceId} /></View> : null}
      </Pressable>
    );
  };

  const choices = !busy && last?.role === 'ai' ? last.choices ?? [] : [];
  const characterName = chat?.character ?? story.characters[0]?.name ?? 'Narrator';
  const initial = characterName.charAt(0).toUpperCase();
  const canSend = canType && !!input.trim();
  const multi = story.characters.length > 1;
  // Space under the composer: clear of the gesture bar when the keyboard is closed, small when it is open.
  const bottomPad = kbOpen ? 10 : Math.max(insets.bottom, 12) + 10;

  return (
    <KeyboardAvoidingView style={[s2.root, { paddingTop: insets.top }]} behavior="padding">
      <View style={s2.header}>
        <View style={s2.headLeft}>
          <Pressable onPress={() => nav.goBack()} hitSlop={10} style={s2.iconBtn} accessibilityLabel="Back"><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
          <Pressable onPress={options} hitSlop={10} style={s2.iconBtn} accessibilityLabel="Chat options"><Ionicons name="ellipsis-vertical" size={20} color={colors.text} /></Pressable>
        </View>
        <View style={s2.titleBox}>
          <Text style={s2.title} numberOfLines={1}>{story.title}</Text>
          <Text style={s2.subtitle} numberOfLines={1}>{busy ? 'Writing...' : `with ${characterName}`}</Text>
        </View>
        <View style={s2.headRight}><View style={s2.epPill}><Text style={s2.epText}>Ep: {chat?.ep ?? 1}</Text></View></View>
      </View>

      <FlatList
        ref={listRef}
        style={{ flex: 1 }}
        data={chat?.messages ?? []}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        contentContainerStyle={{ paddingHorizontal: space.screen, paddingTop: space.section, paddingBottom: space.section, gap: 22, flexGrow: 1 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListFooterComponent={
          <View>
            {busy ? <TypingDots /> : null}
            {hasKey === false ? (
              <View style={s2.setup}>
                <Text style={s2.setupTitle}>Connect your AI provider</Text>
                <Text style={s2.setupBody}>Stories are written by an AI model through your own key. Add a Groq or OpenRouter key in Profile to start.</Text>
                <GradientButton title="Open Profile" onPress={() => nav.navigate('Profile')} />
              </View>
            ) : null}
          </View>
        }
      />

      {error ? (
        <View style={s2.errorBar}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.accent} />
          <Text style={s2.errorText} numberOfLines={3}>{error}</Text>
          <Pressable onPress={retry} hitSlop={8}><Text style={s2.retry}>Retry</Text></Pressable>
        </View>
      ) : null}

      {waitingNext && !busy ? (
        <View style={{ paddingHorizontal: space.screen, paddingTop: 8, paddingBottom: bottomPad }}>
          <GradientButton title={`Start Episode ${(last?.ep ?? 0) + 1}`} onPress={startNext} />
        </View>
      ) : (
        <View style={[s2.dock, { paddingBottom: bottomPad }]}>
          {choices.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }} keyboardShouldPersistTaps="handled">
              {choices.map((c) => (
                <Pressable key={c} onPress={() => send(c)} style={s2.choice}><Text style={s2.choiceText} numberOfLines={2}>{c}</Text></Pressable>
              ))}
            </ScrollView>
          ) : null}

          {/* Claude-style composer: the text field on top, tools and send underneath. Tap anywhere to type. */}
          <Pressable onPress={() => inputRef.current?.focus()} style={[s2.composer, focused && s2.composerFocused, !inputOn && { opacity: 0.55 }]}>
            <TextInput
              ref={inputRef}
              style={s2.input}
              placeholder={hasKey === false ? 'Add your AI key in Profile to start' : `Say something to ${characterName}`}
              placeholderTextColor={colors.sub}
              value={input}
              onChangeText={setInput}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              editable={inputOn}
              multiline
              maxLength={1000}
              selectionColor={colors.accent}
              cursorColor={colors.accent}
              underlineColorAndroid="transparent"
              textAlignVertical="top"
              blurOnSubmit={false}
            />
            <View style={s2.toolbar}>
              <Pressable onPress={cycleCharacter} disabled={!multi} hitSlop={6} style={s2.charChip} accessibilityLabel="Switch character">
                <View style={s2.charDot}><Text style={s2.charInitial}>{initial}</Text></View>
                <Text style={s2.charName} numberOfLines={1}>{characterName}</Text>
                {multi ? <Ionicons name="swap-horizontal" size={14} color={colors.sub} /> : null}
              </Pressable>
              <View style={{ flex: 1 }} />
              <Pressable onPress={() => send(input)} disabled={!canSend} style={[s2.send, !canSend && s2.sendOff]} accessibilityLabel="Send">
                <Ionicons name="arrow-up" size={20} color={canSend ? colors.onAccent : colors.sub} />
              </Pressable>
            </View>
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const s2 = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', height: 60, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  headLeft: { flexDirection: 'row', width: 92 },
  headRight: { width: 92, alignItems: 'flex-end', paddingRight: 8 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titleBox: { flex: 1, alignItems: 'center' },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  subtitle: { color: colors.sub, fontSize: 12, marginTop: 1 },
  epPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.chip, borderWidth: 1.5, borderColor: colors.line },
  epText: { color: colors.text, fontSize: 13, fontWeight: '700' },

  ai: { gap: 8 },
  speakerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  speaker: { color: colors.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
  userCard: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, gap: 6 },
  userLabel: { color: colors.sub, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  userText: { color: colors.text },
  endWrap: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 4 },
  endLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.line },
  endPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: colors.surface },
  endTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  setup: { gap: space.gap, padding: space.card, borderRadius: radius.card, backgroundColor: colors.surface },
  setupTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  setupBody: { color: colors.sub, fontSize: 14, lineHeight: 20 },
  errorBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: space.screen, marginBottom: 8, padding: 12, borderRadius: radius.card, backgroundColor: colors.accentSoft },
  errorText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 18 },
  retry: { color: colors.accent, fontSize: 14, fontWeight: '800' },

  dock: { paddingHorizontal: space.screen, paddingTop: 8 },
  choice: { maxWidth: 260, paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.chip, borderWidth: 1.5, borderColor: colors.accent },
  choiceText: { color: colors.text, fontSize: 14 },
  composer: { borderRadius: 24, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface, paddingTop: 6, paddingHorizontal: 8, paddingBottom: 8 },
  composerFocused: { borderColor: 'rgba(227,26,78,0.55)' },
  input: { minHeight: 48, maxHeight: 140, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 6, color: colors.text, fontSize: 16, lineHeight: 22 },
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingTop: 2 },
  charChip: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 200, height: 36, paddingLeft: 4, paddingRight: 12, borderRadius: 18, borderWidth: 1.5, borderColor: colors.line },
  charDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accentSoft, borderWidth: 1.5, borderColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  charInitial: { color: colors.text, fontSize: 12, fontWeight: '800' },
  charName: { color: colors.text, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  send: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendOff: { backgroundColor: colors.bg },
});
