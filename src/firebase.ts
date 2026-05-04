import { initializeApp } from 'firebase/app'

const firebaseConfig = {
  apiKey: 'AIzaSyDKobzvO83xxVwvG5bTs-wFyJdRyCzYw3Q',
  authDomain: 'track-my-income.firebaseapp.com',
  projectId: 'track-my-income',
  storageBucket: 'track-my-income.firebasestorage.app',
  messagingSenderId: '331721420803',
  appId: '1:331721420803:web:f8a3e11e026ff12bbf5e36',
}

export const firebaseApp = initializeApp(firebaseConfig)
