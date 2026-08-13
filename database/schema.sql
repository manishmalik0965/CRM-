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
    email VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('Admin', 'Manager', 'Agent', 'HOD', 'WFM', 'Superadmin') NOT NULL DEFAULT 'Agent',
    display_name VARCHAR(255) NULL,
    totp_secret VARCHAR(255) NULL, 
    totp_enabled BOOLEAN DEFAULT FALSE,
    backup_codes JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
    UNIQUE idx_tenant_email (company_id, email),
    UNIQUE idx_tenant_username (company_id, user_id),
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

-- 7b. Sent Emails Log Table
CREATE TABLE IF NOT EXISTS sent_emails (
    id VARCHAR(255) PRIMARY KEY,
    company_id CHAR(36) NOT NULL,
    booking_id VARCHAR(255) NULL,
    crm_id VARCHAR(100) NULL,
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body_html LONGTEXT NOT NULL,
    type VARCHAR(100) NOT NULL,
    sent_by VARCHAR(255) NULL,
    data_sent JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- 7c. Airports (Global Lookup)
CREATE TABLE IF NOT EXISTS airports (
    code VARCHAR(10) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    city VARCHAR(255) NOT NULL,
    country VARCHAR(100) NULL,
    INDEX idx_airport_search (code, name, city)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed major airports and AGS as requested
INSERT IGNORE INTO airports (code, name, city, country) VALUES 
('AGS', 'Augusta Regional Airport', 'Augusta', 'USA'),
('LHR', 'London Heathrow Airport', 'London', 'UK'),
('JFK', 'John F. Kennedy International Airport', 'New York', 'USA'),
('DXB', 'Dubai International Airport', 'Dubai', 'UAE'),
('CDG', 'Charles de Gaulle Airport', 'Paris', 'France'),
('SIN', 'Singapore Changi Airport', 'Singapore', 'Singapore'),
('AMS', 'Amsterdam Airport Schiphol', 'Amsterdam', 'Netherlands'),
('HKG', 'Hong Kong International Airport', 'Hong Kong', 'China'),
('HND', 'Haneda Airport', 'Tokyo', 'Japan'),
('ORD', 'O\'Hare International Airport', 'Chicago', 'USA'),
('ATL', 'Hartsfield-Jackson Atlanta International Airport', 'Atlanta', 'USA'),
('LAX', 'Los Angeles International Airport', 'Los Angeles', 'USA'),
('DFW', 'Dallas/Fort Worth International Airport', 'Dallas', 'USA'),
('DEN', 'Denver International Airport', 'Denver', 'USA'),
('SFO', 'San Francisco International Airport', 'San Francisco', 'USA'),
('SEA', 'Seattle-Tacoma International Airport', 'Seattle', 'USA'),
('MCO', 'Orlando International Airport', 'Orlando', 'USA'),
('LAS', 'Harry Reid International Airport', 'Las Vegas', 'USA'),
('CLT', 'Charlotte Douglas International Airport', 'Charlotte', 'USA'),
('MIA', 'Miami International Airport', 'Miami', 'USA'),
('PHX', 'Phoenix Sky Harbor International Airport', 'Phoenix', 'USA'),
('EWR', 'Newark Liberty International Airport', 'Newark', 'USA'),
('IAH', 'George Bush Intercontinental Airport', 'Houston', 'USA'),
('BOS', 'Logan International Airport', 'Boston', 'USA'),
('MSP', 'Minneapolis-Saint Paul International Airport', 'Minneapolis', 'USA'),
('DTW', 'Detroit Metropolitan Airport', 'Detroit', 'USA'),
('FLL', 'Fort Lauderdale-Hollywood International Airport', 'Fort Lauderdale', 'USA'),
('PHL', 'Philadelphia International Airport', 'Philadelphia', 'USA'),
('LGA', 'LaGuardia Airport', 'New York', 'USA'),
('BWI', 'Baltimore/Washington International Thurgood Marshall Airport', 'Baltimore', 'USA'),
('SLC', 'Salt Lake City International Airport', 'Salt Lake City', 'USA'),
('SAN', 'San Diego International Airport', 'San Diego', 'USA'),
('IAD', 'Washington Dulles International Airport', 'Washington D.C.', 'USA'),
('TPA', 'Tampa International Airport', 'Tampa', 'USA'),
('BNA', 'Nashville International Airport', 'Nashville', 'USA'),
('AUS', 'Austin-Bergstrom International Airport', 'Austin', 'USA'),
('MDW', 'Midway International Airport', 'Chicago', 'USA'),
('HNL', 'Daniel K. Inouye International Airport', 'Honolulu', 'USA'),
('PDX', 'Portland International Airport', 'Portland', 'USA'),
('STL', 'St. Louis Lambert International Airport', 'St. Louis', 'USA'),
('HOU', 'William P. Hobby Airport', 'Houston', 'USA'),
('SNA', 'John Wayne Airport', 'Santa Ana', 'USA'),
('MSY', 'Louis Armstrong New Orleans International Airport', 'New Orleans', 'USA'),
('RDU', 'Raleigh-Durham International Airport', 'Raleigh', 'USA'),
('SMF', 'Sacramento International Airport', 'Sacramento', 'USA'),
('SJC', 'San Jose International Airport', 'San Jose', 'USA'),
('SAT', 'San Antonio International Airport', 'San Antonio', 'USA'),
('CLE', 'Cleveland Hopkins International Airport', 'Cleveland', 'USA'),
('IND', 'Indianapolis International Airport', 'Indianapolis', 'USA'),
('PIT', 'Pittsburgh International Airport', 'Pittsburgh', 'USA'),
('CVG', 'Cincinnati/Northern Kentucky International Airport', 'Cincinnati', 'USA'),
('CMH', 'John Glenn Columbus International Airport', 'Columbus', 'USA'),
('PBI', 'Palm Beach International Airport', 'West Palm Beach', 'USA'),
('RSW', 'Southwest Florida International Airport', 'Fort Myers', 'USA'),
('BDL', 'Bradley International Airport', 'Hartford', 'USA'),
('MKE', 'Milwaukee Mitchell International Airport', 'Milwaukee', 'USA'),
('OMA', 'Eppley Airfield', 'Omaha', 'USA'),
('ABQ', 'Albuquerque International Sunport', 'Albuquerque', 'USA'),
('OKC', 'Will Rogers World Airport', 'Oklahoma City', 'USA'),
('TUL', 'Tulsa International Airport', 'Tulsa', 'USA'),
('LIT', 'Clinton National Airport', 'Little Rock', 'USA'),
('MEM', 'Memphis International Airport', 'Memphis', 'USA'),
('BHM', 'Birmingham-Shuttlesworth International Airport', 'Birmingham', 'USA'),
('SDF', 'Louisville Muhammad Ali International Airport', 'Louisville', 'USA'),
('HSV', 'Huntsville International Airport', 'Huntsville', 'USA'),
('MOB', 'Mobile Regional Airport', 'Mobile', 'USA'),
('SAV', 'Savannah/Hilton Head International Airport', 'Savannah', 'USA'),
('CHS', 'Charleston International Airport', 'Charleston', 'USA'),
('MYR', 'Myrtle Beach International Airport', 'Myrtle Beach', 'USA'),
('CAE', 'Columbia Metropolitan Airport', 'Columbia', 'USA'),
('GSP', 'Greenville-Spartanburg International Airport', 'Greenville', 'USA'),
('AVL', 'Asheville Regional Airport', 'Asheville', 'USA'),
('ROA', 'Roanoke-Blacksburg Regional Airport', 'Roanoke', 'USA'),
('RIC', 'Richmond International Airport', 'Richmond', 'USA'),
('ORF', 'Norfolk International Airport', 'Norfolk', 'USA'),
('PHF', 'Newport News/Williamsburg International Airport', 'Newport News', 'USA'),
('CHO', 'Charlottesville-Albemarle Airport', 'Charlottesville', 'USA'),
('LYH', 'Lynchburg Regional Airport', 'Lynchburg', 'USA'),
('SYR', 'Syracuse Hancock International Airport', 'Syracuse', 'USA'),
('ROC', 'Greater Rochester International Airport', 'Rochester', 'USA'),
('BUF', 'Buffalo Niagara International Airport', 'Buffalo', 'USA'),
('ALB', 'Albany International Airport', 'Albany', 'USA'),
('PVD', 'T.F. Green Airport', 'Providence', 'USA'),
('MHT', 'Manchester-Boston Regional Airport', 'Manchester', 'USA'),
('PWM', 'Portland International Jetport', 'Portland', 'USA'),
('BTV', 'Burlington International Airport', 'Burlington', 'USA'),
('BGR', 'Bangor International Airport', 'Bangor', 'USA'),
('MBS', 'MBS International Airport', 'Saginaw', 'USA'),
('GRR', 'Gerald R. Ford International Airport', 'Grand Rapids', 'USA'),
('LAN', 'Capital Region International Airport', 'Lansing', 'USA'),
('AZO', 'Kalamazoo/Battle Creek International Airport', 'Kalamazoo', 'USA'),
('FNT', 'Bishop International Airport', 'Flint', 'USA'),
('TVC', 'Cherry Capital Airport', 'Traverse City', 'USA'),
('SBN', 'South Bend International Airport', 'South Bend', 'USA'),
('EVV', 'Evansville Regional Airport', 'Evansville', 'USA'),
('FWA', 'Fort Wayne International Airport', 'Fort Wayne', 'USA'),
('LEX', 'Blue Grass Airport', 'Lexington', 'USA'),
('TYS', 'McGhee Tyson Airport', 'Knoxville', 'USA'),
('TRI', 'Tri-Cities Airport', 'Blountville', 'USA'),
('CHA', 'Chattanooga Metropolitan Airport', 'Chattanooga', 'USA'),
('TUP', 'Tupelo Regional Airport', 'Tupelo', 'USA'),
('JAN', 'Jackson-Medgar Wiley Evers International Airport', 'Jackson', 'USA'),
('GPT', 'Gulfport-Biloxi International Airport', 'Gulfport', 'USA'),
('PIB', 'Hattiesburg-Laurel Regional Airport', 'Hattiesburg', 'USA'),
('BTR', 'Baton Rouge Metropolitan Airport', 'Baton Rouge', 'USA'),
('SHV', 'Shreveport Regional Airport', 'Shreveport', 'USA'),
('MLU', 'Monroe Regional Airport', 'Monroe', 'USA'),
('LFT', 'Lafayette Regional Airport', 'Lafayette', 'USA'),
('AEX', 'Alexandria International Airport', 'Alexandria', 'USA');

-- 8. Seed Default Landlord Data (Super Admin & Default Tenant settings)
INSERT INTO companies (id, name, domain, is_active) VALUES ('legacy-tenant-1', 'BLACKGRASS CRM', 'localhost', TRUE)
ON DUPLICATE KEY UPDATE name = 'BLACKGRASS CRM';

INSERT INTO users (id, company_id, email, password_hash, role, display_name, user_id) VALUES 
('super-admin-1', 'legacy-tenant-1', 'manishmalik0965@gmail.com', '$2b$10$w5PhkLkWsODgfYaQoT9rveL0Z2HiUohsbJukAgDk.wmRP7E2XGEDW', 'Superadmin', 'Super Admin', 'admin-0965')
ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = 'Superadmin';

INSERT INTO settings (company_id, settings_json) VALUES 
('legacy-tenant-1', '{"organizationName": "BLACKGRASS CRM", "primaryColor": "#0f172a", "twoFactorEnabled": true, "globalTwoFactorEnabled": false, "supportPhone": "+1 800 555 1234", "supportEmail": "support@skyway.com", "logoUrl": "/logo.svg", "fullAddress": "123 Aviation Blvd, New York, NY 10001"}')
ON DUPLICATE KEY UPDATE company_id = company_id;
