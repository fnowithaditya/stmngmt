import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js"; // NEW IMPORT

export const firebaseConfig = {
  apiKey: "AIzaSyD7AZGSsdKXxHADT7kEa2lnBqiueizzyQ0",
  authDomain: "studentmanage-lgps.firebaseapp.com",
  projectId: "studentmanage-lgps",
  storageBucket: "studentmanage-lgps.firebasestorage.app",
  messagingSenderId: "394244456290",
  appId: "1:394244456290:web:dc1562ff312963ba93363b",
  measurementId: "G-7C74QNZKRQ"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app); // NEW EXPORT