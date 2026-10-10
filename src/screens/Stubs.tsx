import React from 'react';
import { Empty, Screen } from '../components/Ui';

export const Chats = () => (
  <Screen><Empty title="Kono chat nei" body="Kono story shuru korle tomar chat ekhane dekha jabe. Chat screen ashbe M2 te." /></Screen>
);
export const Community = () => (
  <Screen><Empty title="Community" body="Story post, like, save ar comment ashbe M5 te." /></Screen>
);
export const Library = () => (
  <Screen><Empty title="Library" body="Saved, History ar Downloads ashbe M6 te." /></Screen>
);
