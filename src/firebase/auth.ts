import { useEffect, useState } from 'react';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signInWithCredential, GoogleAuthProvider, signOut, FirebaseAuthTypes,
} from '@react-native-firebase/auth';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { ensureUserProfile } from './db';

// Web client (client_type 3) from google-services.json
const WEB_CLIENT_ID = '254854939387-qng634gkqpamdo7u5lb1eu07m4k5hshs.apps.googleusercontent.com';
GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });

export type User = FirebaseAuthTypes.User;

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(
    () =>
      onAuthStateChanged(getAuth(), (u) => {
        setUser(u);
        setReady(true);
        if (u) ensureUserProfile(u);
      }),
    []
  );
  return { user, ready };
}

export const emailSignIn = (email: string, pw: string) => signInWithEmailAndPassword(getAuth(), email.trim(), pw);
export const emailSignUp = (email: string, pw: string) => createUserWithEmailAndPassword(getAuth(), email.trim(), pw);
export const logout = async () => {
  try { await GoogleSignin.signOut(); } catch {}
  await signOut(getAuth());
};

export async function googleSignIn() {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const res = await GoogleSignin.signIn();
  const idToken = res.data?.idToken;
  if (!idToken) throw new Error('cancelled');
  await signInWithCredential(getAuth(), GoogleAuthProvider.credential(idToken));
}

export function friendlyAuthError(e: any): string {
  const code: string = e?.code ?? '';
  if (e?.message === 'cancelled') return '';
  if (code.includes('invalid-email')) return 'That email address is not valid.';
  if (code.includes('weak-password')) return 'Use a password with at least 6 characters.';
  if (code.includes('email-already-in-use')) return 'An account with this email already exists. Please sign in.';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found'))
    return 'The email or password is incorrect.';
  if (code.includes('network')) return 'Please check your internet connection.';
  return 'Something went wrong. Please try again. ' + (code ? `(${code})` : '');
}
