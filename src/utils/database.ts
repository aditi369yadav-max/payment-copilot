// ============================================================
// Pure JSON Database — No native compilation needed
// Stores all data in a JSON file on disk.
// Same interface as before, just uses fs instead of SQLite.
// ============================================================

import fs   from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_FILE = path.join(DATA_DIR, 'payments.json');

export interface Transaction {
  id: string; user_id: string; amount: number; currency: string;
  status: string; payment_method: string; bank_code: string | null;
  failure_reason: string | null; failure_code: string | null;
  retry_count: number; created_at: string; updated_at: string; metadata: string | null;
}

export interface AuditLog {
  id: number; transaction_id: string; from_status: string | null;
  to_status: string; event: string; details: string | null; created_at: string;
}

export interface BankCallback {
  id: number; transaction_id: string; bank_code: string; bank_status: string;
  bank_reference: string | null; error_code: string | null; received_at: string;
}

export interface ReconciliationMismatch {
  id: number; transaction_id: string; our_status: string; bank_status: string;
  mismatch_type: string; amount_diff: number; detected_at: string;
  resolved: number; resolution: string | null;
}

interface DB {
  transactions:              Transaction[];
  audit_logs:               AuditLog[];
  bank_callbacks:            BankCallback[];
  reconciliation_mismatches: ReconciliationMismatch[];
  _counters: { audit: number; bank: number; recon: number };
}

// Load or initialize DB
function loadDB(): DB {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (e) {}
  return {
    transactions: [], audit_logs: [], bank_callbacks: [],
    reconciliation_mismatches: [], _counters: { audit: 0, bank: 0, recon: 0 }
  };
}

function saveDB(data: DB): void {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ── Query helpers ─────────────────────────────────────────────
export const db = {
  // Transactions
  getTransaction: (id: string): Transaction | null => {
    return loadDB().transactions.find(t => t.id === id) ?? null;
  },
  getAllTransactions: (): Transaction[] => loadDB().transactions,
  insertTransaction: (t: Transaction): void => {
    const data = loadDB();
    data.transactions.push(t);
    saveDB(data);
  },
  clearAll: (): void => {
    saveDB({ transactions: [], audit_logs: [], bank_callbacks: [], reconciliation_mismatches: [], _counters: { audit: 0, bank: 0, recon: 0 } });
  },

  // Audit logs
  getAuditLogs: (txnId: string): AuditLog[] => {
    return loadDB().audit_logs.filter(l => l.transaction_id === txnId)
      .sort((a,b) => a.created_at.localeCompare(b.created_at));
  },
  insertAuditLog: (log: Omit<AuditLog, 'id'>): void => {
    const data = loadDB();
    data._counters.audit++;
    data.audit_logs.push({ ...log, id: data._counters.audit });
    saveDB(data);
  },

  // Bank callbacks
  getBankCallbacks: (txnId: string): BankCallback[] => {
    return loadDB().bank_callbacks.filter(b => b.transaction_id === txnId);
  },
  insertBankCallback: (cb: Omit<BankCallback, 'id'>): void => {
    const data = loadDB();
    data._counters.bank++;
    data.bank_callbacks.push({ ...cb, id: data._counters.bank });
    saveDB(data);
  },

  // Reconciliation
  getMismatches: (resolved?: boolean): ReconciliationMismatch[] => {
    const data = loadDB();
    let r = data.reconciliation_mismatches;
    if (resolved !== undefined) r = r.filter(m => (m.resolved === 1) === resolved);
    return r.slice(-10).reverse();
  },
  insertMismatch: (m: Omit<ReconciliationMismatch, 'id'>): void => {
    const data = loadDB();
    data._counters.recon++;
    data.reconciliation_mismatches.push({ ...m, id: data._counters.recon });
    saveDB(data);
  },
};

export default db;
