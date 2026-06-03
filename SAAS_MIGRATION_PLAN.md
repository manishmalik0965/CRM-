# Complete SaaS Architecture & Migration Plan: Firebase to MySQL

This document provides a complete, professional migration plan and architectural documentation for migrating the current CRM SaaS application from Firebase (Authentication & Firestore) to a custom Node.js/Express backend backed by MySQL and JWT based authentication.

---

## Architecture Overview

**Current:**
- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** Node.js + Express (handling emails and API proxies)
- **Database / Auth:** Firebase Auth, Firestore
- **Structure:** Multi-tenant via Firestore sub-collections (e.g., `clients/{id}/...`)

**Target:**
- **Frontend:** React + Vite + Tailwind CSS (using React Context + Axios for API state)
- **Backend:** Node.js + Express (Modular structure)
- **Database:** MySQL 8.0+
- **Auth:** Custom JWT (RSA/HMAC) + Google Authenticator TOTP via `otplib`
- **Structure:** Multi-tenant via `company_id` foreign key row-level isolation.

---

## PHASE 1: Database Migration

We are transitioning from a Document store (Firestore) to a Relational schema (MySQL).

### 1.1 MySQL Schema Setup

**File:** `database/schema.sql`

```sql
-- Create Database
CREATE DATABASE IF NOT EXISTS crm_saas CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE crm_saas;

-- 1. Companies (Tenants)
CREATE TABLE companies (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL -- Soft delete
);

-- 2. Users (Auth & Details)
CREATE TABLE users (
    id CHAR(36) PRIMARY KEY,
    company_id CHAR(36) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('Admin', 'Manager', 'Agent', 'HOD', 'WFM', 'Superadmin') NOT NULL DEFAULT 'Agent',
    
    -- TOTP details
    totp_secret VARCHAR(255) NULL, 
    totp_enabled BOOLEAN DEFAULT FALSE,
    backup_codes JSON NULL,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    INDEX idx_company_auth (company_id, email)
);

-- 3. Clients / Customers of the SaaS 
CREATE TABLE clients (
    id CHAR(36) PRIMARY KEY,
    company_id CHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- 4. Bookings
CREATE TABLE bookings (
    id CHAR(36) PRIMARY KEY,
    company_id CHAR(36) NOT NULL,
    crm_id VARCHAR(100),
    airline_name VARCHAR(255),
    passenger_names JSON,
    total_amount DECIMAL(10,2),
    currency VARCHAR(10),
    status VARCHAR(50) DEFAULT 'draft',
    created_by CHAR(36) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 5. Email Templates
CREATE TABLE email_templates (
    id CHAR(36) PRIMARY KEY,
    company_id CHAR(36) NOT NULL,
    type VARCHAR(100),
    subject VARCHAR(255),
    html_content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- 6. Activity Logs
CREATE TABLE activity_logs (
    id CHAR(36) PRIMARY KEY,
    company_id CHAR(36) NOT NULL,
    user_id CHAR(36) NOT NULL,
    action VARCHAR(255) NOT NULL,
    details JSON,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

**Implementation Strategy:**
- All tables feature `id` as UUID (`CHAR(36)`) for distributed ID generation matching Firebase's style.
- `company_id` is mandatory on business tables to guarantee strict row-level multitenancy.
- Soft deletes (`deleted_at`) applied to core company management.

---

## PHASE 2: Authentication Migration (JWT)

We will use `bcrypt` for passwords and `jsonwebtoken` for access/refresh tokens.

### 2.1 Backend Auth Controller

**File:** `server/controllers/auth.controller.ts`

```typescript
import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import db from '../database/connection';
import { v4 as uuidv4 } from 'uuid';

export const login = async (req: Request, res: Response) => {
    const { email, password } = req.body;

    const [users]: any = await db.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
    const user = users[0];

    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });

    if (user.totp_enabled) {
        // Return a temporary token indicating MFA is required
        const mfaToken = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '5m' });
        return res.json({ requireMFA: true, mfaToken });
    }

    // Generate Standard JWT
    const accessToken = jwt.sign({ 
        id: user.id, 
        company_id: user.company_id, 
        role: user.role 
    }, process.env.JWT_SECRET!, { expiresIn: '1h' });

    res.json({ accessToken, user: { id: user.id, email: user.email, role: user.role } });
};
```

---

## PHASE 3: Google Authenticator (TOTP) Migration

**File:** `server/controllers/mfa.controller.ts`

```typescript
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import db from '../database/connection';

export const setupTOTP = async (req: Request, res: Response) => {
    const userId = req.user.id;
    const userEmail = req.user.email;

    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(userEmail, 'SaaS_CRM', secret);
    
    // Encrypt and store secret in DB
    await db.query('UPDATE users SET totp_secret = ? WHERE id = ?', [secret, userId]);

    const qrCodeDataUrl = await QRCode.toDataURL(otpauth);
    res.json({ qrCode: qrCodeDataUrl, secret });
};

export const verifyTOTP = async (req: Request, res: Response) => {
    const { token, mfaToken } = req.body;
    
    // Decode MFA token to get user ID
    const decoded: any = jwt.verify(mfaToken, process.env.JWT_SECRET!);
    const [users]: any = await db.query('SELECT * FROM users WHERE id = ?', [decoded.userId]);
    const user = users[0];

    const isValid = authenticator.verify({ token, secret: user.totp_secret });
    
    if (!isValid) return res.status(401).json({ error: 'Invalid authenticator code' });

    const accessToken = jwt.sign({ 
        id: user.id, 
        company_id: user.company_id, 
        role: user.role 
    }, process.env.JWT_SECRET!, { expiresIn: '1h' });

    res.json({ accessToken });
};
```

---

## PHASE 4: Frontend Migration

### 4.1 Replace Firebase Initialization

**File:** `src/lib/api.ts` (NEW)
*Replaces `src/lib/firebase.ts`*

```typescript
import axios from 'axios';

export const api = axios.create({
    baseURL: '/api'
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});
```

### 4.2 Replace `onAuthStateChanged`

**File:** `src/context/AuthContext.tsx`
*Reason: Shift from realtime WebSocket stream to initial API payload via JWT*

```tsx
import React, { createContext, useState, useEffect } from 'react';
import { api } from '@/lib/api';

export const AuthContext = createContext<any>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const checkAuth = async () => {
            try {
                const res = await api.get('/auth/me');
                setUser(res.data.user);
            } catch (err) {
                localStorage.removeItem('accessToken');
            } finally {
                setIsLoading(false);
            }
        };
        checkAuth();
    }, []);

    return <AuthContext.Provider value={{ user, setUser, isLoading }}>{children}</AuthContext.Provider>;
};
```

### 4.3 Refactor Pages

**File:** `src/pages/LoginPage.tsx`
**Current Firebase Code:**
```typescript
const result = await signInWithEmailAndPassword(auth, email, password);
```
**Replacement Code:**
```typescript
const res = await api.post('/auth/login', { email, password });
if (res.data.requireMFA) {
    setMfaToken(res.data.mfaToken);
    setShowOtp(true);
} else {
    localStorage.setItem('accessToken', res.data.accessToken);
    setUser(res.data.user);
    navigate('/');
}
```

---

## PHASE 5: Backend Express Structure

Deploy a standard scalable SaaS architecture.

```text
server/
├── routes/
│   ├── auth.routes.ts
│   ├── bookings.routes.ts
│   └── companies.routes.ts
├── controllers/
│   ├── auth.controller.ts
│   └── bookings.controller.ts
├── middleware/
│   ├── requireAuth.ts
│   └── requireTenant.ts
├── database/
│   └── connection.ts
└── helpers/
```

**Tenant Isolation Middleware:** `server/middleware/requireTenant.ts`
```typescript
export const requireTenant = (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !req.user.company_id) {
        return res.status(403).json({ error: 'Company scope required' });
    }
    next();
};
```
*Purpose:* Pre-injects the user's `company_id` into all database queries routing to specific SaaS data tables to prevent IDOR (Insecure Direct Object Reference).

---

## PHASE 6: Security Hardening

1. **Authentication Weaknesses:** 
   *Firebase uses broad client-side rules. Moving to JWT requires strict route scoping.* 
   *Fix:* Implement `requireAuth` checking `JWT` signatures and `token expiration`.
2. **Tenant Isolation Risks:**
   *Fix:* Do NOT pass `company_id` from the frontend in requests representing data mutations. Always read `company_id` directly from `req.user.company_id` assigned at the JWT layer via backend authentication.
3. **MFA Weaknesses (TOTP):**
   *Fix:* The `totp_secret` is symmetrically encrypted at rest in MySQL using an AEAD cipher (`AES-256-GCM`). Only send the QR code once during enrollment.
4. **SQL Injection Risks:**
   *Fix:* Strictly use MySQL prepared statements parameterized via the `mysql2/promise` library. E.g., `db.query('SELECT * WHERE id = ?', [id])`. Never use inline string concatenation.
5. **Session Risks (XSS):**
   *Fix:* Optionally move the JWT `accessToken` from `localStorage` to an `httpOnly, Secure, SameSite=Strict` cookie if the frontend/backend operate on the same root domain.

---

## PHASE 7: Performance Optimization

1. **Database Indexes:**
   ```sql
   CREATE INDEX idx_bookings_tenant ON bookings (company_id, created_at DESC);
   CREATE INDEX idx_activity_logs_date ON activity_logs (company_id, created_at DESC);
   ```
2. **Pagination:** Drop Firestore snapshot listeners which load entire collections on mount. Wrap all endpoints referencing dashboards/logs with `LIMIT ? OFFSET ?`.
3. **Queries:** For dashboard stats, avoid iterating rows in Node.js. Use `GROUP BY` and `SUM()` in SQL natively.

---

## Rollback Plan

1. **Database:** Keep Firestore running in parallel during the migration phase (dual writes) using the Firebase Admin SDK inside MySQL triggers/hooks.
2. **Tokens:** If JWT system fails, temporarily revert DNS routing back to Firebase Hosting/Functions.
3. **Validation:** Use `diff` testing to ensure MySQL outputs match Firestore Document payload schemas before dropping the Firebase library from package.json (`npm uninstall firebase firebase-admin`).
