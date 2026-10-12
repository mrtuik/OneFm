import React from 'react';
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { coverSource } from '../data/covers';
import { GradientView } from './GradientView';
import { GENRE_ICON } from './genreIcon';
import { Story } from '../types';

/** Story picture. Uses the cover image when there is one, otherwise the two gradient colors and a genre icon. */
export function Cover({ story, style, iconSize = 44, children }: { story: Story; style?: StyleProp<ViewStyle>; iconSize?: number; children?: React.ReactNode }) {
  const src = coverSource(story);
  return (
    <View style={[{ overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: story.cover[0] }, style]}>
      {src ? (
        <>
          <Image source={src} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <GradientView from="#000000" to="#000000" fromOpacity={0.05} toOpacity={0.55} style={StyleSheet.absoluteFill} />
        </>
      ) : (
        <>
          <GradientView from={story.cover[0]} to={story.cover[1]} fromOpacity={1} toOpacity={0.85} diagonal style={StyleSheet.absoluteFill} />
          <Ionicons name={GENRE_ICON[story.genres[0]] ?? 'book'} size={iconSize} color="rgba(255,255,255,0.3)" />
        </>
      )}
      {children}
    </View>
  );
}
