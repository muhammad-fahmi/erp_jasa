-- Auth schema for ERP Jasa
CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(10) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  address TEXT,
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  doc_prefix VARCHAR(10) NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Users table (matches domain.ts User interface)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN (
    'OWNER',
    'SUPERVISOR',
    'FRONT_DESK',
    'TECHNICIAN',
    'QC',
    'FINANCE',
    'PARTS'
  )),
  technician_id UUID,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- JWT blacklist (optional, for logout)
CREATE TABLE jwt_blacklist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  blacklisted_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_branch ON users(branch_id);
CREATE INDEX idx_users_role ON users(role);

-- Seed data (default branch and owner)
INSERT INTO branches (code, name, phone, open_time, close_time, doc_prefix, is_default)
VALUES ('HQ-01', 'Kantor Pusat', '+628123456789', '08:00', '17:00', 'WO', TRUE);

-- Seed users for all 7 roles (single-row inserts)
INSERT INTO users (branch_id, email, password_hash, full_name, role, is_active)
SELECT id, 'owner@erp.local', '$2b$10$1JM7e1WbBJ/ugtLNzBvkxOxeEbvxwFIxklQIfjmldPaUxY9DqWxFy', 'Super Admin', 'OWNER', TRUE FROM branches WHERE is_default = TRUE;

INSERT INTO users (branch_id, email, password_hash, full_name, role, is_active)
SELECT id, 'supervisor@erp.local', '$2b$10$1JM7e1WbBJ/ugtLNzBvkxOxeEbvxwFIxklQIfjmldPaUxY9DqWxFy', 'Manajer Operasional', 'SUPERVISOR', TRUE FROM branches WHERE is_default = TRUE;

INSERT INTO users (branch_id, email, password_hash, full_name, role, is_active)
SELECT id, 'front@erp.local', '$2b$10$1JM7e1WbBJ/ugtLNzBvkxOxeEbvxwFIxklQIfjmldPaUxY9DqWxFy', 'Kasir Front Desk', 'FRONT_DESK', TRUE FROM branches WHERE is_default = TRUE;

INSERT INTO users (branch_id, email, password_hash, full_name, role, is_active)
SELECT id, 'tech@erp.local', '$2b$10$1JM7e1WbBJ/ugtLNzBvkxOxeEbvxwFIxklQIfjmldPaUxY9DqWxFy', 'Teknisi Lapangan', 'TECHNICIAN', TRUE FROM branches WHERE is_default = TRUE;

INSERT INTO users (branch_id, email, password_hash, full_name, role, is_active)
SELECT id, 'qc@erp.local', '$2b$10$1JM7e1WbBJ/ugtLNzBvkxOxeEbvxwFIxklQIfjmldPaUxY9DqWxFy', 'Quality Control', 'QC', TRUE FROM branches WHERE is_default = TRUE;

INSERT INTO users (branch_id, email, password_hash, full_name, role, is_active)
SELECT id, 'finance@erp.local', '$2b$10$1JM7e1WbBJ/ugtLNzBvkxOxeEbvxwFIxklQIfjmldPaUxY9DqWxFy', 'Staff Keuangan', 'FINANCE', TRUE FROM branches WHERE is_default = TRUE;

INSERT INTO users (branch_id, email, password_hash, full_name, role, is_active)
SELECT id, 'parts@erp.local', '$2b$10$1JM7e1WbBJ/ugtLNzBvkxOxeEbvxwFIxklQIfjmldPaUxY9DqWxFy', 'Staff Gudang', 'PARTS', TRUE FROM branches WHERE is_default = TRUE;