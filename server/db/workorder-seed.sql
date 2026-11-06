-- Seed data for WO schema

-- Get default branch id
DO $$
DECLARE
  bid UUID;
BEGIN
  SELECT id INTO bid FROM branches WHERE is_default = TRUE;

  -- SLA Policies
  INSERT INTO sla_policies (branch_id, tier, name, lead_hours) VALUES
    (bid, 'SAME_DAY', 'Same Day Service', 6),
    (bid, 'EXPRESS', 'Express 1-2 Hari', 24),
    (bid, 'REGULAR', 'Reguler 3-5 Hari', 72)
  ON CONFLICT (branch_id, tier) DO NOTHING;

  -- Sample Services (Laundry)
  INSERT INTO services (branch_id, code, name, category, base_unit, price_type, base_price, requires_qc) VALUES
    (bid, 'LND-KILO', 'Laundry Kiloan', 'Laundry', 'kg', 'TIERED', 10000, TRUE),
    (bid, 'LND-SATUAN', 'Laundry Satuan', 'Laundry', 'pcs', 'FLAT', 15000, TRUE),
    (bid, 'LND-EXPRESS', 'Laundry Express', 'Laundry', 'kg', 'FLAT', 20000, TRUE),
    (bid, 'SRV-AC', 'Servis AC', 'Service', 'unit', 'FLAT', 150000, TRUE)
  ON CONFLICT (branch_id, code) DO NOTHING;

  -- Stages for Laundry Kiloan
  INSERT INTO stages (service_id, seq, name, est_minutes)
    SELECT id, 1, 'Sortir & Timbang', 15 FROM services WHERE code = 'LND-KILO'
    UNION ALL
    SELECT id, 2, 'Cuci', 60 FROM services WHERE code = 'LND-KILO'
    UNION ALL
    SELECT id, 3, 'Kering', 45 FROM services WHERE code = 'LND-KILO'
    UNION ALL
    SELECT id, 4, 'Setrika', 30 FROM services WHERE code = 'LND-KILO'
    UNION ALL
    SELECT id, 5, 'Packing', 10 FROM services WHERE code = 'LND-KILO';

  -- Stages for Servis AC
  INSERT INTO stages (service_id, seq, name, est_minutes)
    SELECT id, 1, 'Inspeksi', 30 FROM services WHERE code = 'SRV-AC'
    UNION ALL
    SELECT id, 2, 'Pembersihan', 60 FROM services WHERE code = 'SRV-AC'
    UNION ALL
    SELECT id, 3, 'Penggantian Part', 45 FROM services WHERE code = 'SRV-AC'
    UNION ALL
    SELECT id, 4, 'Testing', 20 FROM services WHERE code = 'SRV-AC';

  -- Sample Customers
  INSERT INTO customers (branch_id, code, name, phone, customer_type) VALUES
    (bid, 'CUST-001', 'Budi Santoso', '+62812345678', 'TERDAFTAR'),
    (bid, 'CUST-002', 'Siti Rahayu', '+62812345679', 'TERDAFTAR'),
    (bid, 'CUST-003', 'Toko Makmur Jaya', '+62812345680', 'KONTRAK')
  ON CONFLICT (branch_id, code) DO NOTHING;

  -- Pricing Rules (tiered for Laundry Kiloan)
  INSERT INTO pricing_rules (service_id, min_qty, max_qty, unit_price)
    SELECT id, 0, 4.99, 10000 FROM services WHERE code = 'LND-KILO'
    UNION ALL
    SELECT id, 5, NULL, 8000 FROM services WHERE code = 'LND-KILO';

  -- VIP pricing for CUST-003
  INSERT INTO pricing_rules (service_id, customer_id, min_qty, unit_price)
    SELECT s.id, c.id, 0, 7000
    FROM services s, customers c
    WHERE s.code = 'LND-KILO' AND c.code = 'CUST-003';

  -- Sample Stations
  INSERT INTO stations (branch_id, code, name, station_type) VALUES
    (bid, 'ST-WASH', 'Area Cuci', 'washing'),
    (bid, 'ST-DRY', 'Area Pengering', 'drying'),
    (bid, 'ST-IRON', 'Area Setrika', 'ironing'),
    (bid, 'ST-PACK', 'Area Packing', 'packing'),
    (bid, 'ST-QC', 'Area QC', 'qc')
  ON CONFLICT (branch_id, code) DO NOTHING;

  -- Technician records (link to existing users)
  INSERT INTO technicians (user_id, branch_id, code, name, skill_tags)
    SELECT u.id, u.branch_id, 'TECH-001', 'Teknisi Lapangan', ARRAY['laundry', 'ac']
    FROM users u WHERE u.role = 'TECHNICIAN' LIMIT 1
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO technicians (user_id, branch_id, code, name, skill_tags)
    SELECT u.id, u.branch_id, 'QC-001', 'Quality Control', ARRAY['qc', 'inspection']
    FROM users u WHERE u.role = 'QC' LIMIT 1
  ON CONFLICT (user_id) DO NOTHING;

END $$;
