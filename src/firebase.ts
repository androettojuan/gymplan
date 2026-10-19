import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

// Public web config: access control lives in firestore.rules.
const config = {
  apiKey: "AIzaSyAQkLFlKzlG2_pRUO5J0AR8mM2U4fL9uUo",
  authDomain: "gymplan-ar.firebaseapp.com",
  projectId: "gymplan-ar",
  storageBucket: "gymplan-ar.firebasestorage.app",
  messagingSenderId: "136462138738",
  appId: "1:136462138738:web:da5e1762c0068dd26d71eb",
};

export const app = initializeApp(config);
export const auth = getAuth(app);
// Local cache keeps the app usable without signal at the gym; writes sync when it comes back.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// Local emulators, only in development (npm run capturas). Never in a production build.
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATOR === "true") {
  connectAuthEmulator(auth, "http://127.0.0.1:9299", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8180);
  // The Auth emulator takes an unsigned Google token, so a script can sign in as anyone.
  Object.assign(window, {
    gpSignIn: (sub: string, email: string, name: string) =>
      signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({ sub, email, name, email_verified: true }))),
  });
}
