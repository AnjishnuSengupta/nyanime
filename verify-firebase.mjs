#!/usr/bin/env node

// Firebase Configuration Verification Script
console.log('🔥 Firebase Configuration Verification\n');

// Read .env file
import { readFileSync } from 'fs';
import { join } from 'path';

try {
  const envPath = join(process.cwd(), '.env');
  const envContent = readFileSync(envPath, 'utf-8');
  
  const config = {
    apiKey: envContent.match(/VITE_FIREBASE_API_KEY=(.+)/)?.[1]?.trim(),
    authDomain: envContent.match(/VITE_FIREBASE_AUTH_DOMAIN=(.+)/)?.[1]?.trim(),
    projectId: envContent.match(/VITE_FIREBASE_PROJECT_ID=(.+)/)?.[1]?.trim(),
    storageBucket: envContent.match(/VITE_FIREBASE_STORAGE_BUCKET=(.+)/)?.[1]?.trim(),
    messagingSenderId: envContent.match(/VITE_FIREBASE_MESSAGING_SENDER_ID=(.+)/)?.[1]?.trim(),
    appId: envContent.match(/VITE_FIREBASE_APP_ID=(.+)/)?.[1]?.trim(),
  };

  console.log('✅ Firebase Configuration Found:\n');
  console.log(`   Project ID: ${config.projectId}`);
  console.log(`   Auth Domain: ${config.authDomain}`);
  console.log(`   Storage Bucket: ${config.storageBucket}`);
  console.log(`   App ID: ${config.appId}`);
  console.log(`   API Key: ${config.apiKey?.substring(0, 20)}...`);
  console.log(`   Sender ID: ${config.messagingSenderId}\n`);

  // Validate all values exist
  const allConfigured = Object.entries(config).every(([key, value]) => value && value !== '');
  
  if (allConfigured) {
    console.log('✅ All Firebase environment variables are configured!\n');
    console.log('🚀 Next steps:');
    console.log('   1. Enable Authentication in Firebase Console');
    console.log('   2. Run: bun run dev');
    console.log('   3. Test sign-up/sign-in at /signup or /signin\n');
    console.log('🔗 Firebase Console: https://console.firebase.google.com/project/' + config.projectId);
  } else {
    console.log('❌ Some Firebase environment variables are missing!');
    console.log('   Please check your .env file\n');
  }

} catch (error) {
  console.error('❌ Error reading .env file:', error.message);
  console.log('   Make sure .env file exists in the project root');
}
