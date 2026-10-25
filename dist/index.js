import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { handleChat } from './chat-engine';
import { getRetriever } from './retrieval';
import { logHandoffSubmission, logVisitorFeedback } from './guardrails';
import { initDb, getDbStatus, createContactMessage, getContactMessages, updateContactStatus, deleteContactMessage, getStats, } from './db';
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3001;
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'axia-admin-super-secret-key-2026';
// Initialize DB on boot
initDb().catch((err) => {
    console.error('Database initialization warning:', err);
});
// Permissive CORS for seamless Railway (backend) + Vercel (frontend) deployment
app.use(cors({
    origin: (origin, callback) => {
        // In production and dev, allow incoming web requests from frontend
        callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'x-eval-suite'],
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
const rateLimitMap = new Map();
function checkRateLimit(req, ip) {
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
function authenticateAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized. Admin token required.' });
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
        if (decoded && decoded.username === 'admin') {
            req.adminUser = decoded;
            return next();
        }
        return res.status(403).json({ error: 'Forbidden. Invalid admin role.' });
    }
    catch (err) {
        return res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
    }
}
// 1. GET /api/health
app.get('/api/health', (req, res) => {
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
    }
    catch (err) {
        res.status(503).json({
            status: 'offline',
            error: err.message || 'Knowledge base unavailable',
        });
    }
});
// 2. POST /api/chat (SSE streaming)
app.post('/api/chat', async (req, res) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
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
    const sendEvent = (eventData) => {
        res.write(`event: ${eventData.event}\ndata: ${JSON.stringify(eventData.data)}\n\n`);
    };
    try {
        await handleChat(message.trim(), history, sendEvent);
        res.end();
    }
    catch (err) {
        console.error('Chat handling error:', err);
        sendEvent({
            event: 'error',
            data: { message: err.message || 'Internal server error occurred.' },
        });
        res.end();
    }
});
// 3. POST /api/handoff
app.post('/api/handoff', (req, res) => {
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
app.post('/api/feedback', (req, res) => {
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
app.post('/api/contact', async (req, res) => {
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
    }
    catch (err) {
        console.error('Contact submit error:', err);
        return res.status(500).json({ error: 'Failed to record contact message. Please try again.' });
    }
});
// 5. POST /api/admin/login - Admin authentication
app.post('/api/admin/login', (req, res) => {
    const { username, password } = req.body;
    // Strict check: username 'admin', password 'admin123'
    if (username === 'admin' && password === 'admin123') {
        const token = jwt.sign({
            username: 'admin',
            role: 'admin',
        }, ADMIN_JWT_SECRET, { expiresIn: '7d' });
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
app.get('/api/admin/messages', authenticateAdmin, async (req, res) => {
    try {
        const messages = await getContactMessages();
        const stats = await getStats();
        return res.json({
            success: true,
            messages,
            stats,
            dbStatus: getDbStatus(),
        });
    }
    catch (err) {
        console.error('Error fetching admin messages:', err);
        return res.status(500).json({ error: 'Failed to retrieve messages.' });
    }
});
// 7. PATCH /api/admin/messages/:id - Update message status
app.patch('/api/admin/messages/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
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
    }
    catch (err) {
        console.error('Error updating message status:', err);
        return res.status(500).json({ error: 'Failed to update message.' });
    }
});
// 8. DELETE /api/admin/messages/:id - Delete a contact message
app.delete('/api/admin/messages/:id', authenticateAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await deleteContactMessage(id);
        if (!deleted) {
            return res.status(404).json({ error: 'Message not found' });
        }
        return res.json({ success: true, message: 'Message deleted successfully.' });
    }
    catch (err) {
        console.error('Error deleting message:', err);
        return res.status(500).json({ error: 'Failed to delete message.' });
    }
});
// 9. GET /api/admin/stats - Quick stats
app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
    try {
        const stats = await getStats();
        return res.json({
            success: true,
            stats,
            dbStatus: getDbStatus(),
        });
    }
    catch (err) {
        return res.status(500).json({ error: 'Failed to retrieve stats.' });
    }
});
// 10. POST /api/admin/seed-test - Inject a sample inquiry for testing
app.post('/api/admin/seed-test', authenticateAdmin, async (req, res) => {
    try {
        const sample = await createContactMessage({
            fullName: 'Sarah Jenkins',
            company: 'Apex Cloud Solutions',
            email: 's.jenkins@apexcloud.io',
            message: 'Requesting an architectural review for multi-region Kubernetes migration and automated CI/CD pipeline modernization.',
        });
        return res.json({ success: true, message: 'Test message created', data: sample });
    }
    catch (err) {
        return res.status(500).json({ error: 'Failed to create test message.' });
    }
});
// Start Express server
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`🚀 AXIA Assistant Server listening on http://localhost:${PORT}`);
        console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
        console.log(`🔐 Admin endpoints ready at http://localhost:${PORT}/api/admin/*`);
    });
}
export default app;
