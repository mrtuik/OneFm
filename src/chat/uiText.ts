import { Lang } from '../types';

/** Every word the chat screen shows. It follows the story language: Hinglish for Hindi stories, Banglish for Bangla stories. */
export interface UiText {
  you: string;
  youMain: string;
  next: string;
  retry: string;
  nextEpisode: string;
  saySomething: string;
  sayAs: (name: string) => string;
  youAreMain: string;
  youAre: (name: string) => string;
  chooseRole: string;
  writing: string;
  pickTitle: string;
  pickHint: string;
  pickGenderFirst: string;
  cancel: string;
  startEpisode: (n: number) => string;
  episodeDone: (n: number) => string;
  menuTitle: string;
  stopVoice: string;
  changeRole: string;
  restart: string;
  nextEpTitle: string;
  nextEpBody: string;
  restartTitle: string;
  restartBody: string;
  copy: string;
  regenerate: string;
  delete: string;
  message: string;
}

const EN: UiText = {
  you: 'You', youMain: 'You (main character)', next: 'Next', retry: 'Retry', nextEpisode: 'Next episode',
  saySomething: 'Say something...', sayAs: (n) => `Say something as ${n}`,
  youAreMain: 'You are the main character', youAre: (n) => `You are ${n}`, chooseRole: 'Choose your role', writing: 'Writing...',
  pickTitle: 'Who do you want to play?', pickHint: 'You play one role. Everyone else is played by the story.',
  pickGenderFirst: 'Choose Male or Female first. You can change it later in Profile.', cancel: 'Cancel',
  startEpisode: (n) => `Start Episode ${n}`, episodeDone: (n) => `Episode ${n} complete`,
  menuTitle: 'Chat options', stopVoice: 'Stop voice', changeRole: 'Change my role', restart: 'Restart story',
  nextEpTitle: 'Go to the next episode?', nextEpBody: 'This episode ends now with a closing scene.',
  restartTitle: 'Restart this story?', restartBody: 'Your messages and the story memory will be deleted from this phone.',
  copy: 'Copy', regenerate: 'Regenerate', delete: 'Delete', message: 'Message',
};

const HI: UiText = {
  you: 'Tum', youMain: 'Tum (main kirdaar)', next: 'Aage', retry: 'Dobara', nextEpisode: 'Agla episode',
  saySomething: 'Kuch bolo...', sayAs: (n) => `${n} ban kar kuch bolo`,
  youAreMain: 'Tum hi main kirdaar ho', youAre: (n) => `Tum ${n} ho`, chooseRole: 'Apna role chuno', writing: 'Kahani likh rahe hain...',
  pickTitle: 'Tum kaunsa role khelna chahte ho?', pickHint: 'Tum sirf ek role khelte ho. Baaki sab kirdaar kahani nibhayegi.',
  pickGenderFirst: 'Pehle Male ya Female chuno. Baad mein Profile mein badal sakte ho.', cancel: 'Raho',
  startEpisode: (n) => `Episode ${n} shuru karo`, episodeDone: (n) => `Episode ${n} poora hua`,
  menuTitle: 'Chat ke options', stopVoice: 'Awaaz band karo', changeRole: 'Apna role badlo', restart: 'Kahani dobara shuru karo',
  nextEpTitle: 'Agle episode par chalein?', nextEpBody: 'Yeh episode abhi ek closing scene ke saath khatam hoga.',
  restartTitle: 'Kahani dobara shuru karein?', restartBody: 'Is phone se tumhare messages aur kahani ki memory delete ho jayegi.',
  copy: 'Copy', regenerate: 'Dobara likho', delete: 'Delete', message: 'Message',
};

const BN: UiText = {
  you: 'Tumi', youMain: 'Tumi (main chorit)', next: 'Egiye jao', retry: 'Abar', nextEpisode: 'Porer episode',
  saySomething: 'Kichu bolo...', sayAs: (n) => `${n} hoye kichu bolo`,
  youAreMain: 'Tumi-i main chorit', youAre: (n) => `Tumi ${n}`, chooseRole: 'Tomar role bachho', writing: 'Golpo likhchi...',
  pickTitle: 'Tumi kon role khelte chao?', pickHint: 'Tumi shudhu ekta role khelbe. Baki shob chorit golpo khelbe.',
  pickGenderFirst: 'Age Male ba Female bachho. Pore Profile theke bodle nite paro.', cancel: 'Thak',
  startEpisode: (n) => `Episode ${n} shuru koro`, episodeDone: (n) => `Episode ${n} sesh`,
  menuTitle: 'Chat-er option', stopVoice: 'Awaj bondho koro', changeRole: 'Amar role bodlao', restart: 'Golpo abar shuru koro',
  nextEpTitle: 'Porer episode-e jabe?', nextEpBody: 'Ei episode ekhon ekta closing scene diye shesh hobe.',
  restartTitle: 'Golpo abar shuru korbe?', restartBody: 'Ei phone theke tomar message ar golper memory delete hoye jabe.',
  copy: 'Copy', regenerate: 'Abar lekho', delete: 'Delete', message: 'Message',
};

export const uiText = (lang: Lang): UiText => (lang === 'hi' ? HI : lang === 'bn' ? BN : EN);
