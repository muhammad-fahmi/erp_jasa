import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { Role, WoStatus } from '../src/types/domain.ts';
import { can, canTransition, evaluateWoStatusFromTasks, transitionAllowedByRole } from '../src/services/domainEngine.ts';

dotenv.config();

if (!process.env.DB_PASSWORD) throw new Error('DB_PASSWORD required');
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET required');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433'),
  user: process.env.DB_USER || 'erp_admin',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'erp_jasa_auth',
});

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = '1h';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = loginSchema.extend({
  fullName: z.string().min(2),
  role: z.enum(['OWNER', 'SUPERVISOR', 'FRONT_DESK', 'TECHNICIAN', 'QC', 'FINANCE', 'PARTS'] as const),
  branchId: z.string().uuid().optional(),
});

interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  branchId: string | null;
  branchCode?: string;
  technicianId?: string;
  isActive: boolean;
}

function matchPricingRule(rules: any[], customerId: string | null | undefined, quantity: number, basePrice: number) {
  let unitPrice = Number(basePrice);
  let matchedRule: any = null;

  if (customerId) {
    const custRule = rules.find(
      (r: any) =>
        r.customer_id === customerId &&
        quantity >= Number(r.min_qty) &&
        (r.max_qty === null || quantity <= Number(r.max_qty))
    );
    if (custRule) {
      unitPrice = Number(custRule.unit_price);
      matchedRule = custRule;
    }
  }

  if (!matchedRule) {
    const tierRule = rules.find(
      (r: any) =>
        !r.customer_id &&
        quantity >= Number(r.min_qty) &&
        (r.max_qty === null || quantity <= Number(r.max_qty))
    );
    if (tierRule) {
      unitPrice = Number(tierRule.unit_price);
      matchedRule = tierRule;
    }
  }

  const lineTotal = Math.round(unitPrice * quantity * 100) / 100;
  return { unitPrice, lineTotal, matchedRule };
}

app.get('/api/auth/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Database connection failed', error: (error as Error).message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await pool.query(
      `SELECT u.id, u.email, u.password_hash, u.full_name, u.role, u.branch_id, u.technician_id, u.is_active,
              b.code as branch_code
       FROM users u
       LEFT JOIN branches b ON u.branch_id = b.id
       WHERE u.email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    if (!user.is_active) {
      return res.status(403).json({ error: 'Account deactivated' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        branchId: user.branch_id,
        technicianId: user.technician_id,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    const userResponse: AuthUser = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      branchId: user.branch_id,
      branchCode: user.branch_code,
      technicianId: user.technician_id,
      isActive: user.is_active,
    };

    res.json({ token, user: userResponse, expiresIn: JWT_EXPIRY });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (decoded.role !== 'OWNER' && decoded.role !== 'SUPERVISOR') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { email, password, fullName, role, branchId } = registerSchema.parse(req.body);
    const existingUser = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role, branch_id, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, full_name, role, branch_id, is_active`,
      [email, passwordHash, fullName, role, branchId || decoded.branchId, true]
    );

    const newUser = result.rows[0];
    res.status(201).json({
      id: newUser.id,
      email: newUser.email,
      fullName: newUser.full_name,
      role: newUser.role,
      branchId: newUser.branch_id,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const result = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.role, u.branch_id, u.technician_id, u.is_active,
              b.code as branch_code
       FROM users u
       LEFT JOIN branches b ON u.branch_id = b.id
       WHERE u.id = $1`,
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const userResponse: AuthUser = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      branchId: user.branch_id,
      branchCode: user.branch_code,
      technicianId: user.technician_id,
      isActive: user.is_active,
    };

    res.json(userResponse);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export function authenticate(requiredRole?: Role) {
  return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      if (requiredRole && decoded.role !== requiredRole) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      (req as any).user = decoded;
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid token' });
    }
  };
}

app.get('/api/auth/users', authenticate('OWNER'), async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.email, u.full_name, u.role, u.is_active, b.code as branch_code
       FROM users u
       LEFT JOIN branches b ON u.branch_id = b.id
       ORDER BY u.created_at DESC`
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/services', authenticate(), async (req, res) => {
  try {
    const user = (req as any).user;
    const result = await pool.query(
      `SELECT id, branch_id, code, name, category, base_unit, price_type, base_price, requires_qc
       FROM services
       WHERE branch_id = $1 AND is_active = TRUE
       ORDER BY name ASC`,
      [user.branchId]
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

const createWoSchema = z.object({
  customerId: z.string().uuid().optional(),
  customerName: z.string().min(1).max(255),
  customerPhone: z.string().optional(),
  serviceId: z.string().uuid(),
  quantity: z.number().positive().max(1_000_000),
  entryChannel: z.enum(['WALK_IN', 'WHATSAPP', 'WEB', 'PHONE']),
  slaTier: z.enum(['SAME_DAY', 'EXPRESS', 'REGULAR']),
  intakeNotes: z.string().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum([
    'DRAFT',
    'QUEUED',
    'IN_PROGRESS',
    'ON_HOLD',
    'QC',
    'REWORK',
    'READY',
    'HANDED_OVER',
    'CLOSED',
    'CANCELLED',
  ]),
});

const updateTaskStatusSchema = z.object({
  status: z.enum(['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'BLOCKED', 'DONE', 'QC_REJECTED']),
});

const boardQuerySchema = z.object({
  status: z.enum(['PENDING', 'ASSIGNED', 'IN_PROGRESS', 'PAUSED', 'BLOCKED', 'DONE', 'QC_REJECTED']).optional(),
  stationId: z.string().uuid().optional(),
  technicianId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
  priority: z.enum(['high', 'normal', 'low']).optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

const assignTaskSchema = z.object({
  taskId: z.string().uuid(),
  technicianId: z.string().uuid(),
  stationId: z.string().uuid().optional(),
});

const claimTaskSchema = z.object({
  taskId: z.string().uuid(),
});

const startTaskSchema = z.object({
  taskId: z.string().uuid(),
});

const releaseTaskSchema = z.object({
  taskId: z.string().uuid(),
});

// Job Board - list tasks with filters
app.get('/api/board', authenticate(), async (req, res) => {
  try {
    const user = (req as any).user;
    const query = boardQuerySchema.parse(req.query);

    if (!can(user.role, 'board') && !can(user.role, 'tasks')) {
      return res.status(403).json({ error: 'Role not allowed to view job board' });
    }

    let where = 'WHERE w.branch_id = $1';
    const params: any[] = [user.branchId];
    let paramIdx = 2;

    if (query.status) {
      where += ` AND t.status = $${paramIdx++}`;
      params.push(query.status);
    }
    if (query.stationId) {
      where += ` AND t.station_id = $${paramIdx++}`;
      params.push(query.stationId);
    }
    if (query.technicianId) {
      where += ` AND t.assigned_to = $${paramIdx++}`;
      params.push(query.technicianId);
    }
    if (query.serviceId) {
      where += ` AND w.service_id = $${paramIdx++}`;
      params.push(query.serviceId);
    }
    if (query.dateFrom) {
      where += ` AND w.intake_at >= $${paramIdx++}`;
      params.push(query.dateFrom);
    }
    if (query.dateTo) {
      where += ` AND w.intake_at <= $${paramIdx++}`;
      params.push(query.dateTo);
    }

    // Technician role: only see own assigned tasks
    if (user.role === 'TECHNICIAN') {
      where += ` AND t.assigned_to = $${paramIdx++}`;
      params.push(user.technicianId);
    }

    const countRes = await pool.query(
      `SELECT COUNT(*)::int as total
       FROM wo_tasks t
       JOIN work_orders w ON t.wo_id = w.id
       ${where}`,
      params
    );
    const total = countRes.rows[0].total;

    const offset = (query.page - 1) * query.pageSize;
    const limitIdx = paramIdx++;
    const offsetIdx = paramIdx++;
    params.push(query.pageSize, offset);

    const tasksRes = await pool.query(
      `SELECT t.*, w.wo_no, w.customer_name, w.status as wo_status, w.promised_at, s.name as service_name, s.code as service_code,
              st.name as station_name, st.code as station_code,
              tech.name as technician_name, tech.code as technician_code
       FROM wo_tasks t
       JOIN work_orders w ON t.wo_id = w.id
       JOIN services s ON w.service_id = s.id
       LEFT JOIN stations st ON t.station_id = st.id
       LEFT JOIN technicians tech ON t.assigned_to = tech.id
       ${where}
       ORDER BY
         CASE t.status
           WHEN 'IN_PROGRESS' THEN 1
           WHEN 'ASSIGNED' THEN 2
           WHEN 'PENDING' THEN 3
           WHEN 'PAUSED' THEN 4
           WHEN 'BLOCKED' THEN 5
           WHEN 'DONE' THEN 6
           WHEN 'QC_REJECTED' THEN 7
         END,
         w.promised_at ASC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    res.json({
      tasks: tasksRes.rows,
      pagination: { page: query.page, pageSize: query.pageSize, total, pages: Math.ceil(total / query.pageSize) },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Board list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Assign task to technician (SUPERVISOR/OWNER only)
app.post('/api/board/assign', authenticate(), async (req, res) => {
  try {
    const user = (req as any).user;
    if (!can(user.role, 'wo:override')) {
      return res.status(403).json({ error: 'Only Supervisor/Owner can assign tasks' });
    }
    const { taskId, technicianId, stationId } = assignTaskSchema.parse(req.body);

    const techRes = await pool.query(
      `SELECT * FROM technicians WHERE id = $1 AND branch_id = $2 AND is_active = TRUE`,
      [technicianId, user.branchId]
    );
    if (techRes.rows.length === 0) {
      return res.status(404).json({ error: 'Technician not found or inactive' });
    }

    const taskRes = await pool.query(
      `SELECT t.*, w.branch_id
       FROM wo_tasks t
       JOIN work_orders w ON t.wo_id = w.id
       WHERE t.id = $1 AND w.branch_id = $2`,
      [taskId, user.branchId]
    );
    if (taskRes.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const task = taskRes.rows[0];

    if (task.status === 'DONE' || task.status === 'QC_REJECTED') {
      return res.status(400).json({ error: 'Cannot assign completed or rejected task' });
    }

    const stationIdToUse = stationId || task.station_id;
    if (stationIdToUse) {
      const stationRes = await pool.query(
        `SELECT * FROM stations WHERE id = $1 AND branch_id = $2 AND is_active = TRUE`,
        [stationIdToUse, user.branchId]
      );
      if (stationRes.rows.length === 0) {
        return res.status(400).json({ error: 'Station not found or inactive' });
      }
    }

    const updated = await pool.query(
      `UPDATE wo_tasks
       SET assigned_to = $1, station_id = $2, status = 'ASSIGNED', updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [technicianId, stationIdToUse || null, taskId]
    );

    res.json(updated.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Assign task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Technician claims task (TECHNICIAN only)
app.post('/api/board/claim', authenticate(), async (req, res) => {
  try {
    const user = (req as any).user;
    if (user.role !== 'TECHNICIAN') {
      return res.status(403).json({ error: 'Only technicians can claim tasks' });
    }
    const { taskId } = claimTaskSchema.parse(req.body);

    if (!user.technicianId) {
      return res.status(400).json({ error: 'User not linked to technician profile' });
    }

    const taskRes = await pool.query(
      `SELECT t.*, w.branch_id
       FROM wo_tasks t
       JOIN work_orders w ON t.wo_id = w.id
       WHERE t.id = $1 AND w.branch_id = $2`,
      [taskId, user.branchId]
    );
    if (taskRes.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const task = taskRes.rows[0];

    if (task.assigned_to && task.assigned_to !== user.technicianId) {
      return res.status(409).json({ error: 'Task already assigned to another technician' });
    }
    if (task.status === 'DONE' || task.status === 'QC_REJECTED') {
      return res.status(400).json({ error: 'Cannot claim completed or rejected task' });
    }

    const updated = await pool.query(
      `UPDATE wo_tasks
       SET assigned_to = $1, status = 'ASSIGNED', updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [user.technicianId, taskId]
    );

    res.json(updated.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Claim task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start task (sets started_at)
app.post('/api/board/start', authenticate(), async (req, res) => {
  try {
    const user = (req as any).user;
    const { taskId } = startTaskSchema.parse(req.body);

    const taskRes = await pool.query(
      `SELECT t.*, w.branch_id
       FROM wo_tasks t
       JOIN work_orders w ON t.wo_id = w.id
       WHERE t.id = $1 AND w.branch_id = $2`,
      [taskId, user.branchId]
    );
    if (taskRes.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const task = taskRes.rows[0];

    // Authorization: tech can only start own assigned tasks; supervisor/owner can start any
    if (user.role === 'TECHNICIAN') {
      if (!user.technicianId || task.assigned_to !== user.technicianId) {
        return res.status(403).json({ error: 'Task not assigned to you' });
      }
    } else if (!can(user.role, 'task:execute') && !can(user.role, 'wo:override')) {
      return res.status(403).json({ error: 'Insufficient permissions to start task' });
    }

    if (task.status === 'DONE' || task.status === 'QC_REJECTED') {
      return res.status(400).json({ error: 'Cannot start completed or rejected task' });
    }

    const updated = await pool.query(
      `UPDATE wo_tasks
       SET status = 'IN_PROGRESS', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [taskId]
    );

    // Also update WO status if it was QUEUED
    const woRes = await pool.query(`SELECT status FROM work_orders WHERE id = $1`, [task.wo_id]);
    if (woRes.rows.length > 0 && woRes.rows[0].status === 'QUEUED') {
      await pool.query(
        `UPDATE work_orders SET status = 'IN_PROGRESS', started_at = COALESCE(started_at, NOW()), updated_at = NOW() WHERE id = $1`,
        [task.wo_id]
      );
    }

    res.json(updated.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Start task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Release task (unassign, back to PENDING)
app.post('/api/board/release', authenticate(), async (req, res) => {
  try {
    const user = (req as any).user;
    const { taskId } = releaseTaskSchema.parse(req.body);

    const taskRes = await pool.query(
      `SELECT t.*, w.branch_id
       FROM wo_tasks t
       JOIN work_orders w ON t.wo_id = w.id
       WHERE t.id = $1 AND w.branch_id = $2`,
      [taskId, user.branchId]
    );
    if (taskRes.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const task = taskRes.rows[0];

    // Authorization
    if (user.role === 'TECHNICIAN') {
      if (!user.technicianId || task.assigned_to !== user.technicianId) {
        return res.status(403).json({ error: 'Task not assigned to you' });
      }
    } else if (!can(user.role, 'wo:override')) {
      return res.status(403).json({ error: 'Insufficient permissions to release task' });
    }

    if (task.status === 'DONE' || task.status === 'QC_REJECTED') {
      return res.status(400).json({ error: 'Cannot release completed or rejected task' });
    }

    const updated = await pool.query(
      `UPDATE wo_tasks
       SET assigned_to = NULL, status = 'PENDING', started_at = NULL, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [taskId]
    );

    res.json(updated.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Release task error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/workorders', authenticate(), async (req, res) => {
  try {
    const user = (req as any).user;
    if (!can(user.role, 'wo:create')) {
      return res.status(403).json({ error: 'Role not allowed to create work orders' });
    }

    const payload = createWoSchema.parse(req.body);
    const serviceRes = await pool.query(
      `SELECT s.*, b.doc_prefix
       FROM services s
       JOIN branches b ON s.branch_id = b.id
       WHERE s.id = $1 AND s.branch_id = $2 AND s.is_active = TRUE`,
      [payload.serviceId, user.branchId]
    );

    if (serviceRes.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }
    const service = serviceRes.rows[0];

    const rulesRes = await pool.query(
      `SELECT * FROM pricing_rules
       WHERE service_id = $1 AND (customer_id IS NULL OR customer_id = $2)`,
      [payload.serviceId, payload.customerId || null]
    );

    const { unitPrice, lineTotal } = matchPricingRule(
      rulesRes.rows,
      payload.customerId,
      payload.quantity,
      Number(service.base_price)
    );

    const slaRes = await pool.query(
      `SELECT lead_hours FROM sla_policies WHERE branch_id = $1 AND tier = $2 AND is_active = TRUE`,
      [user.branchId, payload.slaTier]
    );
    const leadHours = Number(slaRes.rows[0]?.lead_hours || 24);
    const promisedAt = new Date(Date.now() + leadHours * 3600 * 1000);

    const prefix = service.doc_prefix || 'WO';
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seqRes = await pool.query(
      `SELECT LPAD(COALESCE(MAX(SUBSTRING(wo_no, '[0-9]+$')::int), 0) + 1, 4, '0')::text as seq 
       FROM work_orders WHERE branch_id = $1`,
      [user.branchId]
    );
    const seq = seqRes.rows[0].seq;
    const woNo = `${prefix}-${stamp}-${seq}`;

    const insertWoRes = await pool.query(
      `INSERT INTO work_orders (
        branch_id, wo_no, status, customer_id, customer_name, customer_phone,
        service_id, quantity, unit_price, line_total, sla_tier, promised_at,
        entry_channel, intake_notes, intake_by, intake_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
      RETURNING *`,
      [
        user.branchId,
        woNo,
        'DRAFT',
        payload.customerId || null,
        payload.customerName,
        payload.customerPhone || null,
        payload.serviceId,
        payload.quantity,
        unitPrice,
        lineTotal,
        payload.slaTier,
        promisedAt,
        payload.entryChannel,
        payload.intakeNotes || null,
        user.userId,
      ]
    );
    const wo = insertWoRes.rows[0];

    const stagesRes = await pool.query(
      `SELECT * FROM stages WHERE service_id = $1 ORDER BY seq ASC`,
      [payload.serviceId]
    );

    let tasks: any[] = [];
    if (stagesRes.rows.length > 0) {
      const values = stagesRes.rows.map((st: any, i: number) => 
        `($1, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, 'PENDING', $${i * 5 + 6})`
      ).join(', ');
      const params = [wo.id];
      stagesRes.rows.forEach((st: any) => {
        params.push(st.id, st.seq, st.name, st.est_minutes);
      });
      const tasksRes = await pool.query(
        `INSERT INTO wo_tasks (wo_id, stage_id, seq, name, status, est_minutes)
         VALUES ${values}
         RETURNING *`,
        params
      );
      tasks = tasksRes.rows;
    }

    res.status(201).json({ ...wo, tasks });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Create WO error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/workorders/:id', authenticate(), async (req, res) => {
  try {
    const user = (req as any).user;
    const woRes = await pool.query(
      `SELECT * FROM work_orders WHERE id = $1 AND branch_id = $2`,
      [req.params.id, user.branchId]
    );
    if (woRes.rows.length === 0) return res.status(404).json({ error: 'Work order not found' });
    const tasksRes = await pool.query(
      `SELECT * FROM wo_tasks WHERE wo_id = $1 ORDER BY seq ASC`,
      [req.params.id]
    );
    res.json({ ...woRes.rows[0], tasks: tasksRes.rows });
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/workorders/:id/status', authenticate(), async (req, res) => {
  try {
    const user = (req as any).user;
    const { status: nextStatus } = updateStatusSchema.parse(req.body);

    const woRes = await pool.query(
      `SELECT * FROM work_orders WHERE id = $1 AND branch_id = $2`,
      [req.params.id, user.branchId]
    );
    if (woRes.rows.length === 0) return res.status(404).json({ error: 'Work order not found' });
    const wo = woRes.rows[0];

    const currentStatus = wo.status as WoStatus;
    if (!canTransition(currentStatus, nextStatus)) {
      return res.status(400).json({ error: `Illegal transition from ${currentStatus} to ${nextStatus}` });
    }

    if (!transitionAllowedByRole(user.role, nextStatus)) {
      return res.status(403).json({ error: `Role ${user.role} cannot move WO to ${nextStatus}` });
    }

    const updated = await pool.query(
      `UPDATE work_orders
       SET status = $1::varchar,
           started_at = CASE WHEN $1::varchar = 'IN_PROGRESS' AND started_at IS NULL THEN NOW() ELSE started_at END,
           completed_at = CASE WHEN $1::varchar = 'READY' AND completed_at IS NULL THEN NOW() ELSE completed_at END,
           handed_over_at = CASE WHEN $1::varchar = 'HANDED_OVER' AND handed_over_at IS NULL THEN NOW() ELSE handed_over_at END,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [nextStatus, req.params.id]
    );

    res.json(updated.rows[0]);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Update WO status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/workorders/:woId/tasks/:taskId', authenticate(), async (req, res) => {
  try {
    const user = (req as any).user;
    const { status: taskStatus } = updateTaskStatusSchema.parse(req.body);

    const taskRes = await pool.query(
      `SELECT t.*, w.branch_id, w.status as wo_status, s.requires_qc
       FROM wo_tasks t
       JOIN work_orders w ON t.wo_id = w.id
       JOIN services s ON w.service_id = s.id
       WHERE t.id = $1 AND t.wo_id = $2 AND w.branch_id = $3`,
      [req.params.taskId, req.params.woId, user.branchId]
    );

    if (taskRes.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const current = taskRes.rows[0];

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const updatedTaskRes = await client.query(
        `UPDATE wo_tasks
         SET status = $1::varchar,
             started_at = CASE WHEN $1::varchar = 'IN_PROGRESS' AND started_at IS NULL THEN NOW() ELSE started_at END,
             completed_at = CASE WHEN $1::varchar = 'DONE' THEN NOW() ELSE completed_at END,
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [taskStatus, req.params.taskId]
      );

      const allTasksRes = await client.query(
        `SELECT * FROM wo_tasks WHERE wo_id = $1 ORDER BY seq ASC`,
        [req.params.woId]
      );

      const evaluatedStatus = evaluateWoStatusFromTasks(
        current.wo_status,
        allTasksRes.rows as any,
        Boolean(current.requires_qc)
      );

      if (evaluatedStatus !== current.wo_status && canTransition(current.wo_status, evaluatedStatus)) {
        await client.query(
          `UPDATE work_orders
           SET status = $1::varchar,
               started_at = CASE WHEN $1::varchar = 'IN_PROGRESS' AND started_at IS NULL THEN NOW() ELSE started_at END,
               updated_at = NOW()
           WHERE id = $2`,
          [evaluatedStatus, req.params.woId]
        );
      }
      await client.query('COMMIT');
      res.json(updatedTaskRes.rows[0]);
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Feature 4: Pricing & Job Costing endpoints
app.get('/api/pricing/:serviceId', authenticate(), async (req, res) => {
  try {
    const user = (req as any).user;
    const qty = Number(req.query.qty || 1);
    const customerId = req.query.customerId as string | undefined;

    const serviceRes = await pool.query(
      `SELECT id, branch_id, code, name, category, base_unit, price_type, base_price, requires_qc
       FROM services WHERE id = $1 AND branch_id = $2 AND is_active = TRUE`,
      [req.params.serviceId, user.branchId]
    );
    if (serviceRes.rows.length === 0) return res.status(404).json({ error: 'Service not found' });
    const service = serviceRes.rows[0];

    const rulesRes = await pool.query(
      `SELECT * FROM pricing_rules WHERE service_id = $1 AND (customer_id IS NULL OR customer_id = $2)`,
      [req.params.serviceId, customerId || null]
    );

    const { unitPrice, lineTotal, matchedRule } = matchPricingRule(
      rulesRes.rows,
      customerId,
      qty,
      Number(service.base_price)
    );

    const slaRes = await pool.query(
      `SELECT tier, name, lead_hours FROM sla_policies WHERE branch_id = $1 AND is_active = TRUE ORDER BY lead_hours ASC`,
      [user.branchId]
    );

    res.json({
      serviceId: service.id,
      serviceName: service.name,
      basePrice: Number(service.base_price),
      quantity: qty,
      unitPrice,
      lineTotal,
      appliedRule: matchedRule ? {
        id: matchedRule.id,
        minQty: Number(matchedRule.min_qty),
        maxQty: matchedRule.max_qty !== null ? Number(matchedRule.max_qty) : null,
        unitPrice: Number(matchedRule.unit_price),
        isCustomerSpecific: Boolean(matchedRule.customer_id)
      } : null,
      slaOptions: slaRes.rows.map((s: any) => ({
        tier: s.tier,
        name: s.name,
        leadHours: Number(s.lead_hours),
        estimatedCompletion: new Date(Date.now() + Number(s.lead_hours) * 3600 * 1000).toISOString()
      }))
    });
  } catch (error) {
    console.error('Pricing lookup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const calculateWoSchema = z.object({
  quantity: z.number().positive().optional(),
  serviceId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  slaTier: z.enum(['SAME_DAY', 'EXPRESS', 'REGULAR']).optional(),
});

app.post('/api/workorders/:id/calculate', authenticate(), async (req, res) => {
  try {
    const user = (req as any).user;
    const body = calculateWoSchema.parse(req.body);

    const woRes = await pool.query(
      `SELECT * FROM work_orders WHERE id = $1 AND branch_id = $2`,
      [req.params.id, user.branchId]
    );
    if (woRes.rows.length === 0) return res.status(404).json({ error: 'Work order not found' });
    const wo = woRes.rows[0];

    const serviceId = body.serviceId || wo.service_id;
    const quantity = body.quantity !== undefined ? body.quantity : Number(wo.quantity);
    const customerId = body.customerId !== undefined ? body.customerId : wo.customer_id;
    const slaTier = body.slaTier || wo.sla_tier;

    const serviceRes = await pool.query(
      `SELECT * FROM services WHERE id = $1 AND branch_id = $2 AND is_active = TRUE`,
      [serviceId, user.branchId]
    );
    if (serviceRes.rows.length === 0) return res.status(404).json({ error: 'Service not found' });
    const service = serviceRes.rows[0];

    const rulesRes = await pool.query(
      `SELECT * FROM pricing_rules WHERE service_id = $1 AND (customer_id IS NULL OR customer_id = $2)`,
      [serviceId, customerId || null]
    );

    const { unitPrice, lineTotal, matchedRule } = matchPricingRule(
      rulesRes.rows,
      customerId,
      quantity,
      Number(service.base_price)
    );

    const slaRes = await pool.query(
      `SELECT lead_hours FROM sla_policies WHERE branch_id = $1 AND tier = $2 AND is_active = TRUE`,
      [user.branchId, slaTier]
    );
    const leadHours = Number(slaRes.rows[0]?.lead_hours || 24);
    const intakeTime = new Date(wo.intake_at).getTime();
    const promisedAt = new Date(intakeTime + leadHours * 3600 * 1000);

    const updatedWo = await pool.query(
      `UPDATE work_orders
       SET service_id = $1,
           quantity = $2,
           customer_id = $3,
           unit_price = $4,
           line_total = $5,
           sla_tier = $6,
           promised_at = $7,
           updated_at = NOW()
       WHERE id = $8
       RETURNING *`,
      [serviceId, quantity, customerId || null, unitPrice, lineTotal, slaTier, promisedAt, req.params.id]
    );

    res.json({
      workOrder: updatedWo.rows[0],
      calculation: {
        serviceId,
        quantity,
        unitPrice,
        lineTotal,
        leadHours,
        promisedAt,
        appliedRule: matchedRule ? {
          id: matchedRule.id,
          minQty: Number(matchedRule.min_qty),
          maxQty: matchedRule.max_qty !== null ? Number(matchedRule.max_qty) : null,
          unitPrice: Number(matchedRule.unit_price),
          isCustomerSpecific: Boolean(matchedRule.customer_id)
        } : null
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Calculate WO error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const PORT = process.env.AUTH_PORT || 3001;
app.listen(PORT, () => {
  console.log(`ERP server running on http://localhost:${PORT}`);
});
