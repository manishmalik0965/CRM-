-- 1. Companies (Tenants)
CREATE TABLE IF NOT EXISTS companies (
    id CHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(255) UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL -- Soft delete
);

-- 2. Users (Auth & Details)
CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) PRIMARY KEY,
    company_id CHAR(36) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    user_id VARCHAR(255) UNIQUE NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('Admin', 'Manager', 'Agent', 'HOD', 'WFM', 'Superadmin') NOT NULL DEFAULT 'Agent',
    display_name VARCHAR(255) NULL,
    totp_secret VARCHAR(255) NULL, 
    totp_enabled BOOLEAN DEFAULT FALSE,
    backup_codes JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    INDEX idx_company_auth (company_id, email)
);

-- 3. Clients / Customers of the SaaS 
CREATE TABLE IF NOT EXISTS clients (
    id CHAR(36) PRIMARY KEY,
    company_id CHAR(36) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- 4. Bookings
CREATE TABLE IF NOT EXISTS bookings (
    id CHAR(36) PRIMARY KEY,
    company_id CHAR(36) NOT NULL,
    crm_id VARCHAR(100),
    airline_name VARCHAR(255),
    passenger_names JSON,
    total_amount DECIMAL(10,2),
    currency VARCHAR(10),
    status VARCHAR(50) DEFAULT 'draft',
    created_by CHAR(36) NOT NULL,
    details JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- 5. Email Templates
CREATE TABLE IF NOT EXISTS email_templates (
    id CHAR(36) PRIMARY KEY,
    company_id CHAR(36) NOT NULL,
    type VARCHAR(100),
    subject VARCHAR(255),
    html_content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- 6. Activity Logs
CREATE TABLE IF NOT EXISTS activity_logs (
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

-- 7. Settings (JSON object per tenant/company)
CREATE TABLE IF NOT EXISTS settings (
    company_id CHAR(36) PRIMARY KEY,
    settings_json JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);
