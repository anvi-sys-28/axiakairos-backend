import fs from 'fs';
import path from 'path';
import { Chunk } from './retrieval';

function resolveKbPath(): string {
  const candidates = [
    path.resolve(process.cwd(), 'knowledge.json'),
    path.resolve(process.cwd(), 'backend', 'knowledge.json'),
    path.resolve(process.cwd(), 'server', 'knowledge.json'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

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

function resolveLogsDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'logs'),
    path.resolve(process.cwd(), 'backend', 'logs'),
    path.resolve(process.cwd(), 'server', 'logs'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.resolve(process.cwd(), 'logs');
}

// Valid internal routes dynamically loaded from knowledge base + core navigation
function loadValidInternalRoutes(): Set<string> {
  const routes = new Set<string>([
    '/',
    '/about',
    '/services',
    '/case-studies',
    '/blogs',
    '/careers',
    '/industries',
    '/our-approach',
    '/products',
    '/contact',
    '/contact-us',
    '/assistant',
    '/privacy-policy',
    '/terms-and-conditions',
  ]);

  try {
    const kbPath = resolveKbPath();
    if (fs.existsSync(kbPath)) {
      const kb = JSON.parse(fs.readFileSync(kbPath, 'utf8'));
      if (Array.isArray(kb.chunks)) {
        for (const c of kb.chunks) {
          if (c.url) routes.add(c.url.toLowerCase());
        }
      }
    }
  } catch (err) {
    console.warn('Could not read knowledge.json for valid routes:', err);
  }

  return routes;
}

export const VALID_INTERNAL_ROUTES = loadValidInternalRoutes();

/**
 * Validates and sanitizes URLs in the generated response.
 * External links or unauthorized internal URLs are replaced with safe fallback links.
 */
export function sanitizeUrls(text: string): string {
  // Replace markdown links [text](url)
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, url) => {
    // If it's a known valid internal route
    const cleanUrl = url.trim().toLowerCase().split('?')[0].split('#')[0];
    if (VALID_INTERNAL_ROUTES.has(cleanUrl)) {
      return `[${linkText}](${cleanUrl})`;
    }
    // If it's axia kairos domain with valid route
    if (cleanUrl.startsWith('https://axiakairos.com')) {
      const pathPart = cleanUrl.replace('https://axiakairos.com', '') || '/';
      if (VALID_INTERNAL_ROUTES.has(pathPart)) {
        return `[${linkText}](${pathPart})`;
      }
    }
    // Otherwise sanitize
    return linkText;
  });
}

/**
 * Guardrail check: Numeric and Entity Verification
 * Verifies that metrics, percentages, and prominent numbers in the response appear in the retrieved context.
 */
export function verifyNumericGroundedness(
  response: string,
  retrievedContextText: string
): { passed: boolean; ungroundedMetrics: string[] } {
  const metricRegex = /(?:\$\d+(?:\.\d+)?[MBKmbk]?|\b\d+(?:\.\d+)?%|\b\d+x\b|\b\d{2,}(?:,\d{3})*(?:\.\d+)?\b)/g;

  const matches = response.match(metricRegex) || [];
  const ungroundedMetrics: string[] = [];

  const contextLower = retrievedContextText.toLowerCase();

  for (const m of matches) {
    // Ignore small structural numbers (like 1, 2, 3, 4, 5 in lists or steps)
    if (/^[1-9]$/.test(m)) continue;
    // Ignore current year / common years
    if (m === '2025' || m === '2026' || m === '2024') continue;

    const cleanMetric = m.toLowerCase();
    if (!contextLower.includes(cleanMetric)) {
      ungroundedMetrics.push(m);
    }
  }

  return {
    passed: ungroundedMetrics.length === 0,
    ungroundedMetrics,
  };
}

/**
 * Logs content gaps to server/data/gaps.json for editorial review.
 */
export function logContentGap(
  question: string,
  reason: string = 'Information not found in knowledge base',
  contextSnippet?: string
): void {
  try {
    const dataDir = resolveDataDir();
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const gapsPath = path.resolve(dataDir, 'gaps.json');
    let gaps: any[] = [];
    if (fs.existsSync(gapsPath)) {
      try {
        gaps = JSON.parse(fs.readFileSync(gapsPath, 'utf8'));
      } catch {}
    }

    gaps.push({
      id: `gap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      question,
      reason,
      contextSnippet: contextSnippet ? contextSnippet.slice(0, 300) : undefined,
    });

    // Keep last 1000 entries
    if (gaps.length > 1000) gaps = gaps.slice(-1000);

    fs.writeFileSync(gapsPath, JSON.stringify(gaps, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to log content gap:', err);
  }
}

/**
 * Logs visitor feedback (thumbs up / thumbs down) to server/data/feedback.json.
 */
export function logVisitorFeedback(feedback: {
  rating: 'up' | 'down';
  question: string;
  answerSnippet?: string;
  usedChunks?: string[];
}): void {
  try {
    const dataDir = resolveDataDir();
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const feedbackPath = path.resolve(dataDir, 'feedback.json');
    let records: any[] = [];
    if (fs.existsSync(feedbackPath)) {
      try {
        records = JSON.parse(fs.readFileSync(feedbackPath, 'utf8'));
      } catch {}
    }

    records.push({
      id: `fb-${Date.now()}`,
      timestamp: new Date().toISOString(),
      rating: feedback.rating,
      question: feedback.question,
      answerSnippet: feedback.answerSnippet ? feedback.answerSnippet.slice(0, 300) : undefined,
      usedChunks: feedback.usedChunks || [],
    });

    if (records.length > 2000) records = records.slice(-2000);

    fs.writeFileSync(feedbackPath, JSON.stringify(records, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to log feedback:', err);
  }
}

/**
 * Appends an entry to logs/unanswered.jsonl for continuous KB improvement.
 */
export function logUnansweredQuestion(
  question: string,
  retrievedChunks: Chunk[] = []
): void {
  try {
    const logsDir = resolveLogsDir();
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const logPath = path.resolve(logsDir, 'unanswered.jsonl');
    const entry = {
      timestamp: new Date().toISOString(),
      question,
      retrievedTopTitles: retrievedChunks.slice(0, 3).map((c) => c.title),
    };

    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');

    // Also record in gaps.json
    logContentGap(question, 'Knowledge base lacked exact answer', retrievedChunks[0]?.text);
  } catch (err) {
    console.error('Failed to log unanswered question:', err);
  }
}

/**
 * Appends a human handoff form submission to logs/handoffs.jsonl.
 */
export function logHandoffSubmission(payload: Record<string, any>): void {
  try {
    const logsDir = resolveLogsDir();
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const logPath = path.resolve(logsDir, 'handoffs.jsonl');
    const entry = {
      timestamp: new Date().toISOString(),
      ...payload,
    };

    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
  } catch (err) {
    console.error('Failed to log handoff submission:', err);
  }
}
