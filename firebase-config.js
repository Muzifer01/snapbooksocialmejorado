import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app-check.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDN89D9cljm0e8OzrPtloYOUcOY7XSXBqg",
  authDomain: "socialtest-3d114.firebaseapp.com",
  databaseURL: "https://socialtest-3d114-default-rtdb.firebaseio.com",
  projectId: "socialtest-3d114",
  storageBucket: "socialtest-3d114.firebasestorage.app",
  messagingSenderId: "779140232754",
  appId: "1:779140232754:android:8b1d492ce1970d98e26e2b"
};

const app = initializeApp(firebaseConfig);

// App Check — bloquea bots, scripts y peticiones no autorizadas
initializeAppCheck(app, {
  provider: new ReCaptchaV3Provider("6Le606IsAAAANIeRgiQmQwMhl3k55X61pAB1nOA"),
  isTokenAutoRefreshEnabled: true
});

export const auth = getAuth(app);
export const db = getDatabase(app);
export const storage = getStorage(app);
export { app };
