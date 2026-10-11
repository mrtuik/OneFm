import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Dimensions, Easing, FlatList, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RichText } from '../components/RichText';
import { TypingDots } from '../components/TypingDots';
import { VoiceChip } from '../components/VoiceChip';
import { GradientButton } from '../components/Ui';
import { colors, radius, space } from '../theme';
import { ChatMessage, ChatState, GENDER_LABEL, Gender, Story } from '../types';
import { useSettings } from '../state/settings';
import { getApiKey } from '../ai/secure';
import { deleteChat, loadChat, newChat, saveChat } from '../chat/store';
import { TurnOptions, takeTurn } from '../chat/engine';
import { ensureSpeech } from '../ai/speech';
import { YOU, isYou, playableRoles } from '../chat/roles';
import { cleanSpeech } from '../format';
import { UiText, uiText } from '../chat/uiText';
import { isVoiceReady, speak, stopSpeaking } from '../voice/engine';
import { incrementPlay } from '../firebase/db';

const FONT = { small: 14, medium: 16, large: 18 } as const;
const roleLabel = (role: string | undefined, t: UiText) => (isYou(role) ? t.you : role!);

/**
 * True while the keyboard is open. KeyboardAvoidingView is switched on only then, so it can never leave
 * an empty gap under the composer after the keyboard closes. While it is open it measures the real overlap,
 * so the composer is never hidden behind the keyboard.
 */
function useKeyboardOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return open;
}

function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const H = Dimensions.get('window').height;
  const y = useRef(new Animated.Value(H)).current;
  const [mounted, setMounted] = useState(visible);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      y.setValue(H);
      Animated.timing(y, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      Animated.timing(y, { toValue: H, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [visible]);

  // Drag the sheet down to close it. A short or slow drag springs back.
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_, g) => { if (g.dy > 0) y.setValue(g.dy); },
    onPanResponderRelease: (_, g) => {
      if (g.dy > 110 || g.vy > 0.9) closeRef.current();
      else Animated.spring(y, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
    },
    onPanResponderTerminate: () => Animated.spring(y, { toValue: 0, useNativeDriver: true }).start(),
  })).current;

  const dim = y.interpolate({ inputRange: [0, H], outputRange: [1, 0], extrapolate: 'clamp' });

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={s2.backdrop}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)', opacity: dim }]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View style={[s2.sheet, { paddingBottom: insets.bottom + 20, transform: [{ translateY: y }] }]} {...pan.panHandlers}>
          <View style={s2.handle} />
          {title ? <Text style={s2.sheetTitle}>{title}</Text> : null}
          <View style={s2.sheetList}>{children}</View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function SheetItem({ icon, label, onPress, danger, disabled }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s2.sheetItem, danger && s2.sheetItemDanger, pressed && { opacity: 0.7 }, disabled && { opacity: 0.4 }]}>
      <View style={[s2.sheetIcon, danger && s2.sheetIconDanger]}>
        <Ionicons name={icon} size={20} color={danger ? colors.accent : colors.text} />
      </View>
      <Text style={[s2.sheetItemText, danger && { color: colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

/** Choose the one role you play. The AI plays everybody else. Only roles that fit your gender are listed. */
function RolePicker({ story, t, gender, onGender, current, onPick }: { story: Story; t: UiText; gender: Gender | null; onGender: (g: Gender) => void; current?: string; onPick: (role: string) => void }) {
  const roles = playableRoles(story, gender);
  return (
    <View style={{ gap: space.gap }}>
      <Text style={s2.pickTitle}>{t.pickTitle}</Text>
      <Text style={s2.pickHint}>{t.pickHint}</Text>

      <View style={s2.genderRow}>
        {(['male', 'female'] as Gender[]).map((g) => (
          <Pressable key={g} onPress={() => onGender(g)} style={[s2.genderBtn, gender === g && s2.genderBtnOn]}>
            <Text style={[s2.genderText, gender === g && { color: colors.accent }]}>{GENDER_LABEL[g]}</Text>
          </Pressable>
        ))}
      </View>

      {!gender ? <Text style={s2.pickHint}>{t.pickGenderFirst}</Text> : roles.map((r) => (
        <Pressable key={r.name} onPress={() => onPick(r.name)} style={[s2.roleCard, current === r.name && s2.roleCardOn]}>
          <View style={s2.roleDot}><Text style={s2.roleInitial}>{r.name.charAt(0).toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={s2.roleName}>{r.name === YOU ? t.youMain : r.name}</Text>
            <Text style={s2.roleDesc} numberOfLines={2}>{r.role}</Text>
          </View>
          <Ionicons name={current === r.name ? 'checkmark-circle' : 'chevron-forward'} size={20} color={current === r.name ? colors.accent : colors.sub} />
        </Pressable>
      ))}
    </View>
  );
}

export default function Chat() {
  const { story } = useRoute<any>().params as { story: Story };
  const nav = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const { s, update } = useSettings();
  const kbOpen = useKeyboardOpen();
  const t = uiText(story.language);

  const [chat, setChat] = useState<ChatState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // Message whose voice text is still being prepared in the background.
  const [prepId, setPrepId] = useState<string | null>(null);
  const chatRef = useRef<ChatState | null>(null);
  const busyRef = useRef(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const inputRef = useRef<TextInput>(null);
  const font = FONT[s.textSize];
  const voiceId = s.voices[story.language];

  const setBoth = (c: ChatState) => { chatRef.current = c; setChat(c); };

  useEffect(() => {
    loadChat(story.id).then((c) => { setBoth(c ?? newChat(story)); setLoaded(true); });
    return () => stopSpeaking();
  }, [story.id]);

  useFocusEffect(useCallback(() => { getApiKey().then((k) => setHasKey(!!k)); }, []));

  useEffect(() => {
    if (kbOpen) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
  }, [kbOpen]);

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
      // The text is already on screen. The voice text is finished in the background, then it plays.
      if (ai?.speech && key) {
        const m = ai;
        setPrepId(m.id);
        ensureSpeech(story.language, m.text, m.speech!, s.provider, key)
          .then(async (better) => {
            const c = chatRef.current;
            if (c) { const n = { ...c, messages: c.messages.map((x) => (x.id === m.id ? { ...x, speech: better } : x)) }; setBoth(n); saveChat(n); }
            const stillLast = chatRef.current?.messages[chatRef.current.messages.length - 1]?.id === m.id;
            if (s.autoPlay && stillLast && !busyRef.current && (await isVoiceReady(story.language, voiceId))) speak(m.id, cleanSpeech(better), story.language, voiceId);
          })
          .catch(() => {})
          .finally(() => setPrepId((p) => (p === m.id ? null : p)));
      }
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Please try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [story, s.provider, s.autoPlay, voiceId]);

  const last = chat?.messages[chat.messages.length - 1];
  const empty = loaded && !!chat && chat.messages.length === 0;
  // A new chat first asks which role you want to play.
  const needRole = empty && !!chat && !chat.userRole;
  const showPicker = needRole || pickerOpen;

  // The first episode opens by itself once the role is chosen.
  useEffect(() => {
    if (empty && hasKey && chat?.userRole) { incrementPlay(story.id); run({ begin: true }); }
  }, [empty, hasKey, chat?.userRole]);

  const waitingNext = last?.role === 'episode_end';
  const canType = !!hasKey && !busy && !waitingNext && !empty;
  const inputOn = !!hasKey && !waitingNext;

  // Open the keyboard by itself once the chat is ready (like a normal chat app).
  const readyToType = loaded && inputOn && !empty && !showPicker;
  useEffect(() => {
    if (!readyToType) return;
    const t = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(t);
  }, [readyToType]);

  const pickRole = (role: string) => {
    const c = chatRef.current;
    if (!c) return;
    const n = { ...c, userRole: role, userGender: s.gender ?? undefined };
    setBoth(n);
    saveChat(n);
    setPickerOpen(false);
  };

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
    const l = c.messages[c.messages.length - 1];
    if (!l || l.role === 'episode_end') run({ begin: true });
    else run({});
  };

  const nextEpisode = () => {
    if (busy) return;
    Alert.alert(t.nextEpTitle, t.nextEpBody, [
      { text: t.cancel, style: 'cancel' },
      { text: t.nextEpisode, onPress: () => { stopSpeaking(); run({ closeEpisode: true }); } },
    ]);
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
      { text: t.copy, onPress: () => Clipboard.setStringAsync(m.text) },
    ];
    if (m.role === 'ai' && isLast && !busy) buttons.push({ text: t.regenerate, onPress: () => run({ regenerate: true }) });
    buttons.push({ text: t.delete, style: 'destructive', onPress: () => removeMessage(m) });
    Alert.alert(t.message, undefined, buttons, { cancelable: true });
  };

  const restart = () => Alert.alert(t.restartTitle, t.restartBody, [
    { text: t.cancel, style: 'cancel' },
    { text: t.restart, style: 'destructive', onPress: async () => { stopSpeaking(); await deleteChat(story.id); setBoth(newChat(story)); } },
  ]);

  const renderItem = ({ item }: { item: ChatMessage }) => {
    if (item.role === 'user') {
      return (
        <Pressable onLongPress={() => onLongPress(item)} style={s2.userCard}>
          <Text style={s2.userLabel}>{roleLabel(chat?.userRole, t).toUpperCase()}</Text>
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
    const isLastAi = !busy && item.id === last?.id;
    return (
      <Pressable onLongPress={() => onLongPress(item)} style={s2.ai}>
        <RichText text={item.text} style={{ color: colors.text, fontSize: font, lineHeight: font * 1.55 }} />
        {item.id === prepId ? <View style={[s2.prepChip, { marginTop: 6 }]}><ActivityIndicator size="small" color={colors.accent} /><Text style={s2.prepText}>Preparing voice…</Text></View> : item.speech ? <View style={{ marginTop: 6 }}><VoiceChip id={item.id} text={cleanSpeech(item.speech)} lang={story.language} voiceId={voiceId} /></View> : null}
        {isLastAi ? (
          <View style={s2.actions}>
            <Pressable onPress={() => { stopSpeaking(); run({ advance: true }); }} style={s2.actionBtn} accessibilityLabel="Next">
              <Ionicons name="play-forward" size={16} color={colors.text} />
              <Text style={s2.actionText}>{t.next}</Text>
            </Pressable>
            <Pressable onPress={() => { stopSpeaking(); run({ regenerate: true }); }} style={s2.actionBtn} accessibilityLabel="Regenerate">
              <Ionicons name="refresh" size={16} color={colors.text} />
              <Text style={s2.actionText}>{t.retry}</Text>
            </Pressable>
            <Pressable onPress={nextEpisode} style={s2.actionBtn} accessibilityLabel="Next episode">
              <Ionicons name="play-skip-forward" size={16} color={colors.text} />
              <Text style={s2.actionText}>{t.nextEpisode}</Text>
            </Pressable>
          </View>
        ) : null}
      </Pressable>
    );
  };

  const choices = !busy && last?.role === 'ai' ? last.choices ?? [] : [];
  const myRole = chat?.userRole;
  const myName = roleLabel(myRole, t);
  const initial = myName.charAt(0).toUpperCase();
  const canSend = canType && !!input.trim();
  // Space under the composer: clear of the system bar when the keyboard is closed, small when it is open.
  const bottomPad = kbOpen ? 10 : insets.bottom + 24;

  return (
    <KeyboardAvoidingView style={[s2.root, { paddingTop: insets.top }]} behavior="padding" enabled={kbOpen}>
      <View style={s2.header}>
        <View style={s2.headLeft}>
          <Pressable onPress={() => nav.goBack()} hitSlop={10} style={s2.iconBtn} accessibilityLabel="Back"><Ionicons name="arrow-back" size={22} color={colors.text} /></Pressable>
        </View>
        <View style={s2.titleBox}>
          <Text style={s2.title} numberOfLines={1}>{story.title}</Text>
          <Text style={s2.subtitle} numberOfLines={1}>{busy ? t.writing : needRole ? t.chooseRole : isYou(myRole) ? t.youAreMain : t.youAre(myRole!)}{needRole ? '' : `  ·  Ep: ${chat?.ep ?? 1}`}</Text>
        </View>
        <View style={s2.headRight}>
          <Pressable onPress={() => setMenuOpen(true)} hitSlop={8} style={s2.menuBtn} accessibilityLabel="Chat options"><Ionicons name="ellipsis-vertical" size={18} color={colors.text} /></Pressable>
        </View>
      </View>

      {showPicker ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.screen, paddingTop: space.section, paddingBottom: insets.bottom + space.section }}>
          {hasKey === false ? (
            <View style={[s2.setup, { marginBottom: space.gap }]}>
              <Text style={s2.setupTitle}>Connect your AI provider</Text>
              <Text style={s2.setupBody}>Stories are written by an AI model through your own key. Add a Groq or OpenRouter key in Profile to start.</Text>
              <GradientButton title="Open Profile" onPress={() => nav.navigate('Profile')} />
            </View>
          ) : null}
          <RolePicker story={story} t={t} gender={s.gender} onGender={(g) => update({ gender: g })} current={myRole} onPick={pickRole} />
          {pickerOpen ? <Pressable onPress={() => setPickerOpen(false)} style={s2.cancelPick}><Text style={s2.cancelPickText}>{t.cancel}</Text></Pressable> : null}
        </ScrollView>
      ) : (
        <>
          <FlatList
            ref={listRef}
            style={{ flex: 1 }}
            data={chat?.messages ?? []}
            extraData={[busy, last?.id, myRole, prepId]}
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
              <Pressable onPress={retry} hitSlop={8}><Text style={s2.retry}>{t.retry}</Text></Pressable>
            </View>
          ) : null}

          {waitingNext && !busy ? (
            <View style={{ paddingHorizontal: space.screen, paddingTop: 8, paddingBottom: bottomPad }}>
              <GradientButton title={t.startEpisode((last?.ep ?? 0) + 1)} onPress={startNext} />
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

              {/* Composer: no outline. The text field on top, your role and send underneath. Tap anywhere to type. */}
              <Pressable onPress={() => inputRef.current?.focus()} style={[s2.composer, !inputOn && { opacity: 0.55 }]}>
                <TextInput
                  ref={inputRef}
                  style={s2.input}
                  placeholder={hasKey === false ? 'Add your AI key in Profile to start' : isYou(myRole) ? t.saySomething : t.sayAs(myName)}
                  placeholderTextColor={colors.sub}
                  value={input}
                  onChangeText={setInput}
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
                  <Pressable onPress={() => setPickerOpen(true)} hitSlop={6} style={s2.charChip} accessibilityLabel="Change role">
                    <View style={s2.charDot}><Text style={s2.charInitial}>{initial}</Text></View>
                    <Text style={s2.charName} numberOfLines={1}>{myName}</Text>
                  </Pressable>
                  <View style={{ flex: 1 }} />
                  <Pressable onPress={() => send(input)} disabled={!canSend} style={[s2.send, !canSend && s2.sendOff]} accessibilityLabel="Send">
                    <Ionicons name="arrow-up" size={20} color={canSend ? colors.onAccent : colors.sub} />
                  </Pressable>
                </View>
              </Pressable>
            </View>
          )}
        </>
      )}

      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} title={t.menuTitle}>
        <SheetItem icon="volume-mute-outline" label={t.stopVoice} onPress={() => { setMenuOpen(false); stopSpeaking(); }} />
        <SheetItem icon="person-outline" label={t.changeRole} onPress={() => { setMenuOpen(false); setPickerOpen(true); }} />
        <SheetItem icon="play-skip-forward-outline" label={t.nextEpisode} disabled={busy || empty || waitingNext} onPress={() => { setMenuOpen(false); nextEpisode(); }} />
        <SheetItem icon="refresh-outline" label={t.restart} danger onPress={() => { setMenuOpen(false); restart(); }} />
      </Sheet>
    </KeyboardAvoidingView>
  );
}

const s2 = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', height: 60, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  headLeft: { flexDirection: 'row', width: 64 },
  headRight: { width: 64, alignItems: 'flex-end', paddingRight: 8 },
  menuBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  titleBox: { flex: 1, alignItems: 'center' },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  subtitle: { color: colors.sub, fontSize: 12, marginTop: 1 },

  ai: { gap: 8 },
  prepChip: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'flex-start', paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.line },
  prepText: { color: colors.sub, fontSize: 13 },
  userCard: { borderWidth: 1.5, borderColor: colors.line, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, gap: 6 },
  userLabel: { color: colors.sub, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  userText: { color: colors.text },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: 'rgba(254,244,244,0.08)' },
  actionText: { color: colors.text, fontSize: 13, fontWeight: '600' },
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
  // No outline anywhere in the dock: suggestions and the composer are soft filled shapes.
  choice: { maxWidth: 260, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18, backgroundColor: 'rgba(254,244,244,0.08)' },
  choiceText: { color: colors.text, fontSize: 14 },
  composer: { borderRadius: 24, backgroundColor: colors.surface, paddingTop: 6, paddingHorizontal: 8, paddingBottom: 8 },
  input: { minHeight: 48, maxHeight: 140, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 6, color: colors.text, fontSize: 16, lineHeight: 22 },
  toolbar: { flexDirection: 'row', alignItems: 'center', paddingTop: 2 },
  charChip: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 200, height: 36, paddingLeft: 4, paddingRight: 14, borderRadius: 18, backgroundColor: 'rgba(254,244,244,0.08)' },
  charDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  charInitial: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  charName: { color: colors.text, fontSize: 13, fontWeight: '600', flexShrink: 1 },
  send: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  sendOff: { backgroundColor: colors.bg },

  pickTitle: { color: colors.text, fontSize: 22, fontWeight: '800' },
  pickHint: { color: colors.sub, fontSize: 14, lineHeight: 20 },
  genderRow: { flexDirection: 'row', gap: 10, marginVertical: 4 },
  genderBtn: { flex: 1, height: 46, borderRadius: radius.btn, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  genderBtnOn: { backgroundColor: colors.accentSoft },
  genderText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  roleCard: { flexDirection: 'row', alignItems: 'center', gap: space.gap, padding: space.card, borderRadius: radius.card, backgroundColor: colors.surface },
  roleCardOn: { backgroundColor: colors.accentSoft },
  roleDot: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  roleInitial: { color: colors.accent, fontSize: 16, fontWeight: '800' },
  roleName: { color: colors.text, fontSize: 16, fontWeight: '700' },
  roleDesc: { color: colors.sub, fontSize: 13, lineHeight: 18, marginTop: 2 },
  cancelPick: { alignSelf: 'center', padding: 14, marginTop: 8 },
  cancelPickText: { color: colors.sub, fontSize: 15, fontWeight: '600' },

  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingTop: 10, paddingHorizontal: space.screen },
  handle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: 'rgba(254,244,244,0.28)', marginBottom: 16 },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 14, paddingHorizontal: 4 },
  sheetList: { gap: 8 },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 60, paddingHorizontal: 10, borderRadius: 16, backgroundColor: 'rgba(254,244,244,0.05)' },
  sheetItemDanger: { backgroundColor: colors.accentSoft },
  sheetIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(254,244,244,0.08)', alignItems: 'center', justifyContent: 'center' },
  sheetIconDanger: { backgroundColor: 'rgba(227,26,78,0.18)' },
  sheetItemText: { color: colors.text, fontSize: 16, fontWeight: '600' },
});
