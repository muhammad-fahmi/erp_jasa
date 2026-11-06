-- WorkOrder schema for ERP Jasa
-- Executed after auth-init.sql

-- Services master (laundry types, repair types, etc.)
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL,
  description TEXT,
  base_unit VARCHAR(20) NOT NULL,
  price_type VARCHAR(20) NOT NULL CHECK (price_type IN ('FLAT', 'TIERED', 'HOURLY')),
  base_price DECIMAL(12, 2) NOT NULL,
  requires_qc BOOLEAN DEFAULT TRUE,
  is_addon BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (branch_id, code)
);

-- Stages (tahap kerja) per service
CREATE TABLE stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  est_minutes INT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Customers (pelanggan terdaftar)
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(100),
  address TEXT,
  city VARCHAR(50),
  customer_type VARCHAR(20) NOT NULL CHECK (customer_type IN ('WALK_IN', 'TERDAFTAR', 'KONTRAK')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (branch_id, code)
);

-- Pricing rules (tiered, customer-specific)
CREATE TABLE pricing_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  min_qty DECIMAL(10, 2) NOT NULL DEFAULT 0,
  max_qty DECIMAL(10, 2),
  unit_price DECIMAL(12, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- SLA policies (SAME_DAY, EXPRESS, REGULAR)
CREATE TABLE sla_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  tier VARCHAR(20) NOT NULL CHECK (tier IN ('SAME_DAY', 'EXPRESS', 'REGULAR')),
  name VARCHAR(100) NOT NULL,
  lead_hours INT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (branch_id, tier)
);

-- Technicians (map user to technician capability)
CREATE TABLE technicians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  skill_tags TEXT[] DEFAULT '{}',
  max_concurrent_tasks INT DEFAULT 3,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (branch_id, code)
);

-- Stations (stasiun kerja)
CREATE TABLE stations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  station_type VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (branch_id, code)
);

-- Work Orders (inti dari sistem)
CREATE TABLE work_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  wo_no VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN (
    'DRAFT', 'QUEUED', 'IN_PROGRESS', 'ON_HOLD', 'QC', 'REWORK', 'READY', 'HANDED_OVER', 'CLOSED', 'CANCELLED'
  )) DEFAULT 'DRAFT',
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name VARCHAR(100) NOT NULL,
  customer_phone VARCHAR(20),
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE RESTRICT,
  quantity DECIMAL(10, 2) NOT NULL,
  unit_price DECIMAL(12, 2) NOT NULL,
  line_total DECIMAL(14, 2) NOT NULL,
  sla_tier VARCHAR(20) NOT NULL CHECK (sla_tier IN ('SAME_DAY', 'EXPRESS', 'REGULAR')),
  promised_at TIMESTAMP WITH TIME ZONE NOT NULL,
  entry_channel VARCHAR(20) NOT NULL CHECK (entry_channel IN ('WALK_IN', 'WHATSAPP', 'WEB', 'PHONE')),
  intake_notes TEXT,
  intake_by UUID NOT NULL REFERENCES users(id),
  intake_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  handed_over_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Work Order Tasks (tugas per tahap)
CREATE TABLE wo_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  name VARCHAR(200),
  est_minutes INT NOT NULL DEFAULT 15,
  status VARCHAR(20) NOT NULL CHECK (status IN (
    'PENDING', 'ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'BLOCKED', 'DONE', 'QC_REJECTED'
  )) DEFAULT 'PENDING',
  assigned_to UUID REFERENCES technicians(id) ON DELETE SET NULL,
  station_id UUID REFERENCES stations(id) ON DELETE SET NULL,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast queries
CREATE INDEX idx_work_orders_branch ON work_orders(branch_id);
CREATE INDEX idx_work_orders_customer ON work_orders(customer_id);
CREATE INDEX idx_work_orders_status ON work_orders(status);
CREATE INDEX idx_work_orders_promised_at ON work_orders(promised_at);
CREATE INDEX idx_wo_tasks_wo ON wo_tasks(wo_id);
CREATE INDEX idx_wo_tasks_status ON wo_tasks(status);
CREATE INDEX idx_wo_tasks_assigned_to ON wo_tasks(assigned_to);
CREATE INDEX idx_technicians_user ON technicians(user_id);
CREATE INDEX idx_services_branch ON services(branch_id);
CREATE INDEX idx_customers_branch ON customers(branch_id);
CREATE INDEX idx_stations_branch ON stations(branch_id);
CREATE INDEX idx_pricing_rules_service ON pricing_rules(service_id);
