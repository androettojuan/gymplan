import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";

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
