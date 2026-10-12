import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, space } from '../theme';

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
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

export function SheetItem({ icon, label, onPress, danger, disabled }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s2.sheetItem, danger && s2.sheetItemDanger, pressed && { opacity: 0.7 }, disabled && { opacity: 0.4 }]}>
      <View style={[s2.sheetIcon, danger && s2.sheetIconDanger]}>
        <Ionicons name={icon} size={20} color={danger ? colors.accent : colors.text} />
      </View>
      <Text style={[s2.sheetItemText, danger && { color: colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

export const SheetDivider = () => <View style={s2.sheetDivider} />;

const s2 = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#000000', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, paddingHorizontal: space.screen },
  handle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: 'rgba(254,244,244,0.28)', marginBottom: 16 },
  sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 14, paddingHorizontal: 4 },
  sheetList: { backgroundColor: colors.surface, borderRadius: 16, overflow: 'hidden' },
  sheetDivider: { height: StyleSheet.hairlineWidth, marginLeft: 66, backgroundColor: colors.line },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 62, paddingHorizontal: 12 },
  sheetItemDanger: {},
  sheetIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(254,244,244,0.09)', alignItems: 'center', justifyContent: 'center' },
  sheetIconDanger: { backgroundColor: colors.accentSoft },
  sheetItemText: { color: colors.text, fontSize: 16, fontWeight: '600' },
});
