/*
  firebase.js - Firebase initialization and global helpers
  This file sets up Firebase app, Firestore, and Auth for syncing posts
*/
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-analytics.js";

// Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyBbaEe4uqptD7NOlv6_ktlo7Fz3G3SMqiU",
  authDomain: "dashboard-8a81e.firebaseapp.com",
  projectId: "dashboard-8a81e",
  storageBucket: "dashboard-8a81e.firebasestorage.app",
  messagingSenderId: "167872186862",
  appId: "1:167872186862:web:a49b755a004d3758df66ff",
  measurementId: "G-9R8TLX5KGJ"
};

window.__firebaseReady = (async () => {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);
  getAnalytics(app);
  return { db, auth };
})();

window.__firebase = {
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
};
