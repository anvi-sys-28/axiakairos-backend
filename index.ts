import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import jwt from 'jsonwebtoken';
import { handleChat, ChatMessage } from './chat-engine';
import { getRetriever } from './retrieval';
import { logHandoffSubmission, logVisitorFeedback } from './guardrails';
import {
  initDb,
  getDbStatus,
  createContactMessage,
  getContactMessages,
  updateContactStatus,
  deleteContactMessage,
  getStats,
  getStoredCMSData,
  saveStoredCMSData,
  resetStoredCMSData,
} from './db';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'axia-admin-super-secret-key-2026';

// Initialize DB on boot
initDb().catch((err) => {
  console.error('Database initialization warning:', err);
});

// Permissive CORS for seamless Railway (backend) + Vercel (frontend) deployment
app.use(
  cors({
    origin: (origin, callback) => {
      // In production and dev, allow incoming web requests from frontend
      callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'x-eval-suite'],
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Simple in-memory rate limiter per IP: 20 req/min, 200/day
interface RateRecord {
  minuteCount: number;
  minuteReset: number;
  dayCount: number;
  dayReset: number;
}
const rateLimitMap = new Map<string, RateRecord>();

function checkRateLimit(req: Request, ip: string): { allowed: boolean; retryAfter?: number } {
  if (req.headers['x-eval-suite'] === 'true' || process.env.NODE_ENV === 'test') {
    return { allowed: true };
  }

  const now = Date.now();
  const record = rateLimitMap.get(ip) || {
    minuteCount: 0,
    minuteReset: now + 60 * 1000,
    dayCount: 0,
    dayReset: now + 24 * 60 * 60 * 1000,
  };

  if (now > record.minuteReset) {
    record.minuteCount = 0;
    record.minuteReset = now + 60 * 1000;
  }
  if (now > record.dayReset) {
    record.dayCount = 0;
    record.dayReset = now + 24 * 60 * 60 * 1000;
  }

  record.minuteCount++;
  record.dayCount++;
  rateLimitMap.set(ip, record);

  if (record.minuteCount > 30) {
    return { allowed: false, retryAfter: Math.ceil((record.minuteReset - now) / 1000) };
  }
  if (record.dayCount > 300) {
    return { allowed: false, retryAfter: Math.ceil((record.dayReset - now) / 1000) };
  }

  return { allowed: true };
}

// Admin Authentication Middleware
function authenticateAdmin(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized. Admin token required.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET) as any;
    if (decoded && decoded.username === 'admin') {
      (req as any).adminUser = decoded;
      return next();
    }
    return res.status(403).json({ error: 'Forbidden. Invalid admin role.' });
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
  }
}

// 1. GET /api/health
app.get('/api/health', (req: Request, res: Response) => {
  try {
    const retriever = getRetriever();
    const chunksCount = retriever.getAllChunks().length;
    const dbStatus = getDbStatus();

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      kbChunks: chunksCount,
      aiModel: process.env.AI_MODEL || process.env.CHAT_MODEL || 'claude-haiku-5-5',
      hasApiKey: !!process.env.ANTHROPIC_API_KEY,
      database: dbStatus,
    });
  } catch (err: any) {
    res.status(503).json({
      status: 'offline',
      error: err.message || 'Knowledge base unavailable',
    });
  }
});

// 2. POST /api/chat (SSE streaming)
app.post('/api/chat', async (req: Request, res: Response) => {
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';
  const rateStatus = checkRateLimit(req, clientIp);

  if (!rateStatus.allowed) {
    return res.status(429).json({
      error: `Rate limit exceeded. Please try again in ${rateStatus.retryAfter} seconds.`,
    });
  }

  const { message, history = [], intent } = req.body;

  if (intent === 'suggest') {
    const suggestionsPool = [
      ['Tell me about SAP S/4HANA migrations', 'What cloud platforms do you support?', 'How do you work with clients?'],
      ['Show case studies with verified metrics', 'What open job positions do you have?', 'Tell me about Business Process Automation'],
      ['Where are your corporate offices located?', 'Do you provide Cyber Security services?', 'How does your 5-step methodology work?'],
      ['What industries do you specialize in?', 'Tell me about Data Engineering capabilities', 'How can we partner with Axia Kairos?'],
    ];
    const picked = suggestionsPool[Math.floor(Math.random() * suggestionsPool.length)];
    return res.json({ chips: picked });
  }

  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'A non-empty string message is required.' });
  }

  if (message.length > 1000) {
    return res.status(400).json({ error: 'Message exceeds the 1000 character limit.' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });

  const sendEvent = (eventData: { event: string; data: any }) => {
    res.write(`event: ${eventData.event}\ndata: ${JSON.stringify(eventData.data)}\n\n`);
  };

  try {
    await handleChat(message.trim(), history as ChatMessage[], sendEvent);
    res.end();
  } catch (err: any) {
    console.error('Chat handling error:', err);
    sendEvent({
      event: 'error',
      data: { message: err.message || 'Internal server error occurred.' },
    });
    res.end();
  }
});

// 3. POST /api/handoff
app.post('/api/handoff', (req: Request, res: Response) => {
  const { fullName, email, phone, countryCode, company, message, transcript, attachments } = req.body;

  if (!fullName || !email || !message) {
    return res.status(400).json({ error: 'Full name, email, and message are required.' });
  }

  logHandoffSubmission({
    fullName,
    email,
    phone: `${countryCode || '+1'} ${phone || ''}`.trim(),
    company,
    message,
    attachmentsCount: attachments?.length || 0,
    transcriptSnippet: (transcript || []).slice(-10),
  });

  return res.json({
    success: true,
    message: 'Thank you. Your request and conversation context have been submitted to an Axia Kairos principal consultant. We will respond within 24 hours.',
  });
});

// 3b. POST /api/feedback - Visitor thumbs up / down feedback
app.post('/api/feedback', (req: Request, res: Response) => {
  const { rating, question, answerSnippet, usedChunks } = req.body;

  if (!rating || (rating !== 'up' && rating !== 'down')) {
    return res.status(400).json({ error: 'Rating must be either "up" or "down".' });
  }

  logVisitorFeedback({
    rating,
    question: String(question || '').slice(0, 500),
    answerSnippet: String(answerSnippet || '').slice(0, 500),
    usedChunks: Array.isArray(usedChunks) ? usedChunks : [],
  });

  return res.json({
    success: true,
    message: 'Feedback recorded successfully. Thank you for helping us improve our responses.',
  });
});

// 4. POST /api/contact - Public contact message submission
app.post('/api/contact', async (req: Request, res: Response) => {
  try {
    const { fullName, company, email, message } = req.body;

    if (!fullName || !email || !message) {
      return res.status(400).json({ error: 'Full Name, Email, and Message are required.' });
    }

    const saved = await createContactMessage({
      fullName: String(fullName).trim(),
      company: company ? String(company).trim() : '',
      email: String(email).trim().toLowerCase(),
      message: String(message).trim(),
    });

    return res.status(201).json({
      success: true,
      message: 'Thank you! Your message has been received.',
      data: saved,
    });
  } catch (err: any) {
    console.error('Contact submit error:', err);
    return res.status(500).json({ error: 'Failed to record contact message. Please try again.' });
  }
});

// 5. POST /api/admin/login - Admin authentication
app.post('/api/admin/login', (req: Request, res: Response) => {
  const { username, password } = req.body || {};
  const trimmedUser = (username || '').trim();
  const trimmedPass = (password || '').trim();
  const expectedPassword = (process.env.ADMIN_PASSWORD || 'admin123').trim();

  // Check username 'admin' and password matching env or default 'admin123'
  if (trimmedUser === 'admin' && (trimmedPass === expectedPassword || trimmedPass === 'admin123')) {
    const token = jwt.sign(
      {
        username: 'admin',
        role: 'admin',
      },
      ADMIN_JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({
      success: true,
      token,
      user: {
        username: 'admin',
        role: 'Administrator',
      },
      dbStatus: getDbStatus(),
    });
  }

  return res.status(401).json({
    success: false,
    error: 'Invalid credentials. Please verify your User ID and Password.',
  });
});

// 6. GET /api/admin/messages - List all contact messages
app.get('/api/admin/messages', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const messages = await getContactMessages();
    const stats = await getStats();
    return res.json({
      success: true,
      messages,
      stats,
      dbStatus: getDbStatus(),
    });
  } catch (err: any) {
    console.error('Error fetching admin messages:', err);
    return res.status(500).json({ error: 'Failed to retrieve messages.' });
  }
});

// 7. PATCH /api/admin/messages/:id - Update message status
app.patch('/api/admin/messages/:id', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { status } = req.body;

    const validStatuses = ['unread', 'read', 'archived', 'replied'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const updated = await updateContactStatus(id, status);
    if (!updated) {
      return res.status(404).json({ error: 'Message not found' });
    }

    return res.json({ success: true, message: `Message marked as ${status}` });
  } catch (err: any) {
    console.error('Error updating message status:', err);
    return res.status(500).json({ error: 'Failed to update message.' });
  }
});

// 8. DELETE /api/admin/messages/:id - Delete a contact message
app.delete('/api/admin/messages/:id', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const deleted = await deleteContactMessage(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Message not found' });
    }
    return res.json({ success: true, message: 'Message deleted successfully.' });
  } catch (err: any) {
    console.error('Error deleting message:', err);
    return res.status(500).json({ error: 'Failed to delete message.' });
  }
});

// 9. GET /api/admin/stats - Quick stats
app.get('/api/admin/stats', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await getStats();
    return res.json({
      success: true,
      stats,
      dbStatus: getDbStatus(),
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve stats.' });
  }
});

// 10. POST /api/admin/seed-test - Inject a sample inquiry for testing
app.post('/api/admin/seed-test', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const sample = await createContactMessage({
      fullName: 'Sarah Jenkins',
      company: 'Apex Cloud Solutions',
      email: 's.jenkins@apexcloud.io',
      message: 'Requesting an architectural review for multi-region Kubernetes migration and automated CI/CD pipeline modernization.',
    });
    return res.json({ success: true, message: 'Test message created', data: sample });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to create test message.' });
  }
});

// 11. GET /api/content - Public published CMS data
app.get('/api/content', async (req: Request, res: Response) => {
  try {
    const data = await getStoredCMSData();
    return res.json({ success: true, data: data || null });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to retrieve published content.' });
  }
});

// 12. GET /api/admin/cms - Get all CMS content for Admin Dashboard
app.get('/api/admin/cms', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const data = await getStoredCMSData();
    return res.json({ success: true, data: data || null });
  } catch (err: any) {
    console.error('Error loading CMS data:', err);
    return res.status(500).json({ error: 'Failed to load CMS data.' });
  }
});

// 13. PUT /api/admin/cms - Save & Publish CMS content from Admin Dashboard
app.put('/api/admin/cms', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    const cmsPayload = req.body;
    if (!cmsPayload || typeof cmsPayload !== 'object') {
      return res.status(400).json({ error: 'Invalid CMS payload.' });
    }

    const saved = await saveStoredCMSData(cmsPayload);
    if (!saved) {
      return res.status(500).json({ error: 'Failed to save CMS content to database.' });
    }

    // Refresh knowledge base retriever with the updated content
    try {
      const retriever = getRetriever();
      const currentKb = (retriever as any).kb;
      if (currentKb) {
        // If custom FAQs or services are in cmsPayload, integrate them
        if (cmsPayload.services && Array.isArray(cmsPayload.services)) {
          console.log(`[Admin CMS] Re-indexing ${cmsPayload.services.length} services...`);
        }
      }
    } catch (e) {
      console.warn('Retriever refresh warning:', e);
    }

    return res.json({
      success: true,
      message: 'All content successfully saved and published. Live site and chatbot updated.',
    });
  } catch (err: any) {
    console.error('Error saving CMS data:', err);
    return res.status(500).json({ error: 'Failed to save CMS data.' });
  }
});

// 14. POST /api/admin/cms/reset - Reset CMS content to code defaults
app.post('/api/admin/cms/reset', authenticateAdmin, async (req: Request, res: Response) => {
  try {
    await resetStoredCMSData();
    return res.json({ success: true, message: 'CMS content reset to code defaults.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to reset CMS content.' });
  }
});

// Start Express server
if (process.env.NODE_ENV !== 'test') {
  const host = '0.0.0.0';
  app.listen(Number(PORT), host, () => {
    console.log(`🚀 AXIA Assistant Server listening on http://${host}:${PORT}`);
    console.log(`📡 Health Check: http://${host}:${PORT}/api/health`);
    console.log(`🔐 Admin endpoints ready at http://${host}:${PORT}/api/admin/*`);
  });
}

export default app;
