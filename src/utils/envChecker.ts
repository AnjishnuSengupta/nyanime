/**
 * Environment Variable Checker
 * Use this in development to ensure all required variables are set
 */

interface EnvCheck {
  name: string;
  value: string | undefined;
  required: boolean;
  category: 'API' | 'Firebase' | 'Security' | 'Other';
}

export const checkEnvironmentVariables = (): {
  valid: boolean;
  missing: string[];
  warnings: string[];
  checks: EnvCheck[];
} => {
  const checks: EnvCheck[] = [
    // API Configuration
    { name: 'VITE_CONSUMET_API_URL', value: import.meta.env.VITE_CONSUMET_API_URL, required: false, category: 'API' },
    { name: 'VITE_ANIWATCH_API_URL', value: import.meta.env.VITE_ANIWATCH_API_URL, required: false, category: 'API' },
    { name: 'VITE_JIKAN_API_KEY', value: import.meta.env.VITE_JIKAN_API_KEY, required: false, category: 'API' },
    { name: 'VITE_CORS_PROXY_URL', value: import.meta.env.VITE_CORS_PROXY_URL, required: false, category: 'API' },
    
    // Firebase Configuration
    { name: 'VITE_FIREBASE_API_KEY', value: import.meta.env.VITE_FIREBASE_API_KEY, required: true, category: 'Firebase' },
    { name: 'VITE_FIREBASE_AUTH_DOMAIN', value: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, required: true, category: 'Firebase' },
    { name: 'VITE_FIREBASE_PROJECT_ID', value: import.meta.env.VITE_FIREBASE_PROJECT_ID, required: true, category: 'Firebase' },
    { name: 'VITE_FIREBASE_STORAGE_BUCKET', value: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET, required: true, category: 'Firebase' },
    { name: 'VITE_FIREBASE_MESSAGING_SENDER_ID', value: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID, required: true, category: 'Firebase' },
    { name: 'VITE_FIREBASE_APP_ID', value: import.meta.env.VITE_FIREBASE_APP_ID, required: true, category: 'Firebase' },
    
    // Security
    { name: 'VITE_RECAPTCHA_SITE_KEY', value: import.meta.env.VITE_RECAPTCHA_SITE_KEY, required: true, category: 'Security' },
  ];

  const missing: string[] = [];
  const warnings: string[] = [];

  checks.forEach(check => {
    if (!check.value) {
      if (check.required) {
        missing.push(check.name);
      } else {
        warnings.push(check.name);
      }
    }
  });

  return {
    valid: missing.length === 0,
    missing,
    warnings,
    checks,
  };
};

export const logEnvironmentStatus = () => {
  const result = checkEnvironmentVariables();
  
  console.group('🔍 Environment Variables Check');
  
  if (result.valid) {
    console.log('✅ All required environment variables are set');
  } else {
    console.error('❌ Missing required environment variables:');
    result.missing.forEach(name => {
      console.error(`  - ${name}`);
    });
  }
  
  if (result.warnings.length > 0) {
    console.warn('⚠️ Optional environment variables not set (using defaults):');
    result.warnings.forEach(name => {
      console.warn(`  - ${name}`);
    });
  }
  
  // Group by category
  console.group('📋 All Variables:');
  ['API', 'Firebase', 'Security', 'Other'].forEach(category => {
    const categoryChecks = result.checks.filter(c => c.category === category);
    if (categoryChecks.length > 0) {
      console.group(`${category}:`);
      categoryChecks.forEach(check => {
        const status = check.value ? '✅' : (check.required ? '❌' : '⚠️');
        const value = check.value ? '(set)' : '(not set)';
        console.log(`${status} ${check.name}: ${value}`);
      });
      console.groupEnd();
    }
  });
  console.groupEnd();
  
  console.groupEnd();
  
  return result;
};

// Auto-check in development mode
if (import.meta.env.DEV) {
  const result = logEnvironmentStatus();
  
  if (!result.valid) {
    console.error('🚨 CRITICAL: Missing required environment variables!');
    console.error('Please check your .env file and ensure all required variables are set.');
  }
}

export default checkEnvironmentVariables;
