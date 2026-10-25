import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';

export interface ContactMessage {
  id: number | string;
  fullName: string;
  company?: string;
  email: string;
  message: string;
  status: 'unread' | 'read' | 'archived' | 'replied';
  createdAt: string;
}

let pool: Pool | null = null;
let isPostgresReady = false;
let postgresError: string | null = null;

// Local fallback store path
function resolveDataDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'data'),
    path.resolve(process.cwd(), 'backend', 'data'),
    path.resolve(process.cwd(), 'server', 'data'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.resolve(process.cwd(), 'data');
}

const FALLBACK_DIR = resolveDataDir();
const FALLBACK_FILE = path.join(FALLBACK_DIR, 'contact_messages.json');

function ensureFallbackFile(): ContactMessage[] {
  try {
    if (!fs.existsSync(FALLBACK_DIR)) {
      fs.mkdirSync(FALLBACK_DIR, { recursive: true });
    }
    if (!fs.existsSync(FALLBACK_FILE)) {
      const initialSeed: ContactMessage[] = [
        {
          id: 1,
          fullName: 'Marcus Vance',
          company: 'Aura Logistics Global',
          email: 'm.vance@auralogistics.com',
          message: 'We are seeking guidance on migrating our legacy supply chain system to SAP S/4HANA with automated tracking.',
          status: 'unread',
          createdAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
        },
        {
          id: 2,
          fullName: 'Elena Rostova',
          company: 'FinTech Nexus UK',
          email: 'elena.rostova@fintechnexus.co.uk',
          message: 'Interested in exploring enterprise AI agent automation for transaction reconciliation and fraud analysis.',
          status: 'read',
          createdAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
        },
      ];
      fs.writeFileSync(FALLBACK_FILE, JSON.stringify(initialSeed, null, 2), 'utf8');
      return initialSeed;
    }
    const raw = fs.readFileSync(FALLBACK_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function saveFallback(messages: ContactMessage[]) {
  try {
    if (!fs.existsSync(FALLBACK_DIR)) {
      fs.mkdirSync(FALLBACK_DIR, { recursive: true });
    }
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify(messages, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write fallback contact file:', e);
  }
}

export async function initDb(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    console.log('ℹ️  No DATABASE_URL configured. Running with local persistent file storage for contact messages.');
    ensureFallbackFile();
    return;
  }

  try {
    pool = new Pool({
      connectionString: dbUrl,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    });

    const client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS contact_messages (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(255) NOT NULL,
        company VARCHAR(255),
        email VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'unread',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    client.release();

    isPostgresReady = true;
    console.log('✅ PostgreSQL connected and contact_messages table verified.');
  } catch (err: any) {
    postgresError = err.message || 'Failed to connect to PostgreSQL';
    isPostgresReady = false;
    console.warn('⚠️  PostgreSQL connection failed:', err.message);
    console.warn('ℹ️  Falling back to persistent local storage for contact messages.');
    ensureFallbackFile();
  }
}

export function getDbStatus() {
  return {
    isPostgresReady,
    type: isPostgresReady ? 'PostgreSQL' : 'Local Fallback Store',
    error: postgresError,
  };
}

export async function createContactMessage(data: {
  fullName: string;
  company?: string;
  email: string;
  message: string;
}): Promise<ContactMessage> {
  const { fullName, company = '', email, message } = data;

  if (isPostgresReady && pool) {
    try {
      const res = await pool.query(
        `INSERT INTO contact_messages (full_name, company, email, message, status)
         VALUES ($1, $2, $3, $4, 'unread')
         RETURNING id, full_name as "fullName", company, email, message, status, created_at as "createdAt"`,
        [fullName, company, email, message]
      );
      return res.rows[0];
    } catch (err) {
      console.error('PostgreSQL insert error, falling back:', err);
    }
  }

  // Fallback
  const list = ensureFallbackFile();
  const newMsg: ContactMessage = {
    id: Date.now(),
    fullName,
    company,
    email,
    message,
    status: 'unread',
    createdAt: new Date().toISOString(),
  };
  list.unshift(newMsg);
  saveFallback(list);
  return newMsg;
}

export async function getContactMessages(): Promise<ContactMessage[]> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query(
        `SELECT id, full_name as "fullName", company, email, message, status, created_at as "createdAt"
         FROM contact_messages
         ORDER BY created_at DESC`
      );
      return res.rows;
    } catch (err) {
      console.error('PostgreSQL select error, falling back:', err);
    }
  }

  return ensureFallbackFile();
}

export async function updateContactStatus(
  id: number | string,
  status: 'unread' | 'read' | 'archived' | 'replied'
): Promise<boolean> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query(
        `UPDATE contact_messages SET status = $1 WHERE id = $2`,
        [status, id]
      );
      return (res.rowCount ?? 0) > 0;
    } catch (err) {
      console.error('PostgreSQL update error, falling back:', err);
    }
  }

  const list = ensureFallbackFile();
  const item = list.find((m) => String(m.id) === String(id));
  if (item) {
    item.status = status;
    saveFallback(list);
    return true;
  }
  return false;
}

export async function deleteContactMessage(id: number | string): Promise<boolean> {
  if (isPostgresReady && pool) {
    try {
      const res = await pool.query(`DELETE FROM contact_messages WHERE id = $1`, [id]);
      return (res.rowCount ?? 0) > 0;
    } catch (err) {
      console.error('PostgreSQL delete error, falling back:', err);
    }
  }

  let list = ensureFallbackFile();
  const initialLength = list.length;
  list = list.filter((m) => String(m.id) !== String(id));
  if (list.length !== initialLength) {
    saveFallback(list);
    return true;
  }
  return false;
}

export async function getStats() {
  const messages = await getContactMessages();
  const total = messages.length;
  const unread = messages.filter((m) => m.status === 'unread').length;
  const read = messages.filter((m) => m.status === 'read').length;
  const archived = messages.filter((m) => m.status === 'archived').length;
  const replied = messages.filter((m) => m.status === 'replied').length;

  return {
    total,
    unread,
    read,
    archived,
    replied,
  };
}
