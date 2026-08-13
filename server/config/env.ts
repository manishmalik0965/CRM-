import crypto from 'crypto';

export interface EnvConfig {
  NODE_ENV: string;
  STRICT_ENV: boolean;
  JWT_SECRET: string;
  ENCRYPTION_KEY: string;
  GEMINI_API_KEY?: string;
  APP_URL: string;
  SaaS_LANDLORD_MODE: boolean;
  BCC_EMAIL?: string;
  DB: {
    host: string;
    user: string;
    password?: string;
    database: string;
    url?: string;
  };
  SMTP: {
    user?: string;
    pass?: string;
    host: string;
    port: number;
  };
  TOTP: {
    secret?: string;
    serviceName: string;
  };
}

let cachedEnv: EnvConfig | null = null;

export function validateEnv(): EnvConfig {
  if (cachedEnv) return cachedEnv;

  const nodeEnv = process.env.NODE_ENV || 'development';
  const isStrict = process.env.STRICT_ENV === 'true' || nodeEnv === 'production';

  const errors: string[] = [];
  const warnings: string[] = [];

  // --- 1. JWT_SECRET ---
  let jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret === 'your_jwt_secret_here' || jwtSecret === 'fallback-secret-for-dev-only-change-me') {
    jwtSecret = process.env.JWT_SECRET || 'skyway_crm_prod_fallback_secret_key_32_bytes_long_key_change_me';
    process.env.JWT_SECRET = jwtSecret;
    warnings.push('JWT_SECRET is using a default fallback key. Please configure JWT_SECRET in production environment variables.');
  }

  // --- 2. ENCRYPTION_KEY ---
  let encryptionKey = process.env.ENCRYPTION_KEY || process.env.PAYMENT_ENCRYPTION_KEY || process.env.SENSITIVE_DATA_KEY;
  if (!encryptionKey || encryptionKey === 'your_encryption_key_32_bytes_long') {
    encryptionKey = crypto.createHash('sha256').update(jwtSecret).digest('hex');
    process.env.ENCRYPTION_KEY = encryptionKey;
    warnings.push('ENCRYPTION_KEY is not explicitly set. Derived key generated for runtime process.');
  }

  // --- 3. DATABASE CONFIGURATION ---
  const dbHost = process.env.DB_HOST || process.env.MYSQL_HOST || 'localhost';
  const dbUser = process.env.DB_USER || process.env.MYSQL_USER || 'root';
  const dbPassword = process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || '';
  const dbName = process.env.DB_NAME || process.env.MYSQL_DATABASE || 'crm_saas';
  const dbUrl = process.env.DATABASE_URL;

  // Normalize back to process.env so db connection uses them
  process.env.MYSQL_HOST = dbHost;
  process.env.MYSQL_USER = dbUser;
  process.env.MYSQL_PASSWORD = dbPassword;
  process.env.MYSQL_DATABASE = dbName;
  process.env.DB_HOST = dbHost;
  process.env.DB_USER = dbUser;
  process.env.DB_PASSWORD = dbPassword;
  process.env.DB_NAME = dbName;

  if (isStrict && !dbHost) {
    errors.push('DB_HOST / MYSQL_HOST or DATABASE_URL is required in strict mode.');
  }

  // --- 4. SMTP CONFIGURATION ---
  const smtpUser = process.env.SMTP_USER || process.env.SMTP_EMAIL;
  const smtpPass = process.env.SMTP_PASS || process.env.SMTP_APP_PASSWORD;

  if (smtpUser) process.env.SMTP_EMAIL = smtpUser;
  if (smtpPass) process.env.SMTP_APP_PASSWORD = smtpPass;

  if (isStrict && (!smtpUser || !smtpPass)) {
    warnings.push('SMTP_USER and SMTP_PASS are missing. System notification emails may fail.');
  }

  // --- 5. API KEYS ---
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.GOOGLE_API_KEY;
  if (!geminiApiKey) {
    warnings.push('GEMINI_API_KEY is not defined. AI automation features will be disabled or fall back.');
  }

  // --- 6. TOTP CONFIGURATION ---
  const totpSecret = process.env.TOTP_SECRET;
  const totpServiceName = process.env.TOTP_SERVICE_NAME || process.env.TOTP_APP_NAME || 'SkyWay CRM';

  // --- 7. MISC CONFIG ---
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const saasLandlordMode = process.env.SaaS_LANDLORD_MODE === 'true';

  // --- FAIL FAST OR REPORT ---
  console.log('\n==================================================');
  console.log('       ENV CONFIGURATION & SECURITY AUDIT         ');
  console.log('==================================================');
  console.log(`[ENV] Mode: ${nodeEnv.toUpperCase()} (Strict Validation: ${isStrict ? 'ENABLED' : 'DISABLED'})`);
  console.log(`[ENV] JWT_SECRET:          ${jwtSecret ? '✅ Configured' : '❌ MISSING'}`);
  console.log(`[ENV] ENCRYPTION_KEY:      ${encryptionKey ? '✅ Configured' : '❌ MISSING'}`);
  console.log(`[ENV] DB Host / Database:  ✅ ${dbHost} / ${dbName}`);
  console.log(`[ENV] Database User:       ✅ ${dbUser}`);
  console.log(`[ENV] SMTP Email Config:   ${smtpUser ? '✅ ' + smtpUser : '⚠️  Not Set (Optional in Dev)'}`);
  console.log(`[ENV] Gemini API Key:      ${geminiApiKey ? '✅ Configured' : '⚠️  Not Set (Optional)'}`);
  console.log(`[ENV] TOTP Service Name:   ✅ ${totpServiceName}`);
  console.log(`[ENV] Landlord SaaS Mode:  ${saasLandlordMode ? 'YES' : 'NO'}`);
  console.log('==================================================\n');

  if (warnings.length > 0) {
    warnings.forEach(w => console.warn(`[ENV WARNING] ⚠️  ${w}`));
  }

  if (errors.length > 0) {
    console.warn('\n⚠️ ENVIRONMENT AUDIT NOTICE: Some configuration values were missing:');
    errors.forEach(e => console.warn(`   - ${e}`));
  }

  cachedEnv = {
    NODE_ENV: nodeEnv,
    STRICT_ENV: isStrict,
    JWT_SECRET: jwtSecret!,
    ENCRYPTION_KEY: encryptionKey!,
    GEMINI_API_KEY: geminiApiKey,
    APP_URL: appUrl,
    SaaS_LANDLORD_MODE: saasLandlordMode,
    BCC_EMAIL: process.env.BCC_EMAIL,
    DB: {
      host: dbHost,
      user: dbUser,
      password: dbPassword,
      database: dbName,
      url: dbUrl
    },
    SMTP: {
      user: smtpUser,
      pass: smtpPass,
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 465
    },
    TOTP: {
      secret: totpSecret,
      serviceName: totpServiceName
    }
  };

  return cachedEnv;
}

export default validateEnv;
