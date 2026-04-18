import 'dotenv/config';
import express    from 'express';
import cors       from 'cors';
import path       from 'path';
import { v4 as uuid } from 'uuid';
import { PaymentCopilot } from '../agents/PaymentCopilot';
import { logger }          from '../utils/logger';
import db                  from '../utils/database';

const app    = express();
const PORT   = process.env.PORT || 3001;
const apiKey = process.env.GEMINI_API_KEY!;

if (!apiKey || apiKey === 'your_gemini_api_key_here') {
  logger.error('GEMINI_API_KEY not set in .env file');
  process.exit(1);
}

const copilot = new PaymentCopilot(apiKey);

app.use(cors());
app.use(express.json());

// ── API Routes FIRST ──────────────────────────────────────────

app.post('/api/chat', async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });
  const sid = sessionId || uuid();
  try {
    logger.info('Chat request', { sessionId: sid, message: message.slice(0, 100) });
    const response = await copilot.chat(sid, message);
    res.json({ sessionId: sid, message: response.message, toolsCalled: response.toolsCalled, timestamp: new Date().toISOString() });
  } catch (error: any) {
    logger.error('Chat error', { error: error.message });
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat/clear', (req, res) => {
  const { sessionId } = req.body;
  if (sessionId) copilot.clearSession(sessionId);
  res.json({ success: true });
});

app.get('/api/suggestions', (req, res) => {
  res.json({ suggestions: copilot.getSuggestedQuestions() });
});

app.get('/api/stats', (req, res) => {
  try {
    const all = db.getAllTransactions();
    const total = all.length;
    const success = all.filter(t => t.status === 'SUCCESS').length;
    const failed = all.filter(t => t.status === 'FAILED').length;
    const pending = all.filter(t => t.status === 'PENDING').length;
    const hour = new Date(Date.now() - 3600000).toISOString();
    const recentF = all.filter(t => t.status === 'FAILED' && t.created_at >= hour);
    const codeMap: Record<string,number> = {};
    recentF.forEach(t => { if (t.failure_code) codeMap[t.failure_code] = (codeMap[t.failure_code]||0)+1; });
    const recentFails = Object.entries(codeMap).map(([c,n]) => ({ failure_code: c, count: n })).sort((a,b) => b.count-a.count).slice(0,5);
    const bankMap: Record<string,{bank_code:string,total:number,failed:number}> = {};
    all.forEach(t => {
      if (!t.bank_code) return;
      if (!bankMap[t.bank_code]) bankMap[t.bank_code] = { bank_code: t.bank_code, total: 0, failed: 0 };
      bankMap[t.bank_code].total++;
      if (t.status === 'FAILED') bankMap[t.bank_code].failed++;
    });
    const bankStats = Object.values(bankMap).sort((a,b) => b.failed-a.failed);
    const failureRate = total > 0 ? ((failed/total)*100).toFixed(1)+'%' : '0%';
    res.json({ total, success, failed, pending, failureRate, recentFails, bankStats, mismatches: db.getMismatches(false).length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/transactions', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string;
    let txns = db.getAllTransactions();
    if (status) txns = txns.filter(t => t.status === status);
    txns = txns.sort((a,b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
    res.json({ transactions: txns });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Static AFTER API ──────────────────────────────────────────
app.use(express.static(path.join(process.cwd(), 'frontend', 'dist')));

app.get(/^(?!\/api).*$/, (req: any, res: any) => {
  res.sendFile(path.join(process.cwd(), 'frontend', 'dist', 'index.html'));
});

app.listen(PORT, () => {
  logger.info('═══════════════════════════════════════════');
  logger.info('  Payment Operations Copilot — Running!');
  logger.info('═══════════════════════════════════════════');
  logger.info(`  API:      http://localhost:${PORT}/api`);
  logger.info(`  Frontend: http://localhost:${PORT}`);
  logger.info('═══════════════════════════════════════════');
});