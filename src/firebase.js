import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBV6saoZ0b_LTJFD9vblPapgHQJEwmJeTE",
  authDomain: "language-study-3a4d4.firebaseapp.com",
  databaseURL: "https://language-study-3a4d4-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "language-study-3a4d4",
  storageBucket: "language-study-3a4d4.firebasestorage.app",
  messagingSenderId: "963079406793",
  appId: "1:963079406793:web:424a186a6da501b1a77918",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
