import React from 'react';
import { Image } from 'react-native';

/** The One Fm mark: a pen writing a line. Used in the header and on the welcome screen. */
export function Logo({ size = 28 }: { size?: number }) {
  return <Image source={require('../../assets/logo.png')} style={{ width: size, height: size }} resizeMode="contain" />;
}
