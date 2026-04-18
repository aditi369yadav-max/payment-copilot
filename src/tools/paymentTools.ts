import { db } from '../utils/database';

export interface Tool {
  name: string; description: string;
  parameters: Record<string, any>;
  execute: (params: any) => any;
}

const since = (h: number) => new Date(Date.now() - h * 3600000).toISOString();

export const getTransactionDetails: Tool = {
  name: 'get_transaction_details',
  description: 'Fetch complete details of a specific transaction including status, amount, failure reason, and audit trail',
  parameters: { transaction_id: { type: 'string', description: 'The transaction ID' } },
  execute: ({ transaction_id }: any) => {
    const txn = db.getTransaction(transaction_id);
    if (!txn) return { error: `Transaction ${transaction_id} not found` };
    return {
      transaction: txn,
      audit_trail: db.getAuditLogs(transaction_id),
      bank_responses: db.getBankCallbacks(transaction_id),
    };
  }
};

export const queryFailedTransactions: Tool = {
  name: 'query_failed_transactions',
  description: 'Get recent failed transactions, optionally filtered by bank or failure code',
  parameters: {
    bank_code:    { type: 'string', description: 'Filter by bank (HDFC, AXIS, SBI, ICICI, KOTAK)' },
    failure_code: { type: 'string', description: 'Filter by failure code' },
    limit:        { type: 'number', description: 'Max results (default 10)' },
    hours_ago:    { type: 'number', description: 'Look back N hours (default 24)' },
  },
  execute: ({ bank_code, failure_code, limit = 10, hours_ago = 24 }: any) => {
    const cutoff = since(hours_ago);
    let txns = db.getAllTransactions()
      .filter(t => t.status === 'FAILED' && t.created_at >= cutoff);
    if (bank_code)    txns = txns.filter(t => t.bank_code === bank_code);
    if (failure_code) txns = txns.filter(t => t.failure_code === failure_code);
    txns = txns.sort((a,b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
    return { count: txns.length, transactions: txns, summary: `Found ${txns.length} failed transactions in last ${hours_ago}h` };
  }
};

export const getFailureStats: Tool = {
  name: 'get_failure_stats',
  description: 'Get aggregated failure statistics by bank, failure code, and payment method',
  parameters: { hours_ago: { type: 'number', description: 'Analysis window in hours (default 24)' } },
  execute: ({ hours_ago = 24 }: any) => {
    const cutoff = since(hours_ago);
    const txns   = db.getAllTransactions().filter(t => t.created_at >= cutoff);
    const failed = txns.filter(t => t.status === 'FAILED');

    const byBank: Record<string, any> = {};
    txns.forEach(t => {
      if (!t.bank_code) return;
      if (!byBank[t.bank_code]) byBank[t.bank_code] = { bank_code: t.bank_code, total: 0, failures: 0 };
      byBank[t.bank_code].total++;
      if (t.status === 'FAILED') byBank[t.bank_code].failures++;
    });
    Object.values(byBank).forEach((b: any) => {
      b.failure_rate = ((b.failures / b.total) * 100).toFixed(1) + '%';
    });

    const byCode: Record<string, number> = {};
    failed.forEach(t => { if (t.failure_code) byCode[t.failure_code] = (byCode[t.failure_code]||0)+1; });

    return {
      window_hours: hours_ago,
      total_transactions: txns.length,
      failure_rate: txns.length > 0 ? ((failed.length/txns.length)*100).toFixed(1)+'%' : '0%',
      by_bank: Object.values(byBank),
      by_failure_code: Object.entries(byCode).map(([code,count])=>({failure_code:code,count})).sort((a,b)=>b.count-a.count),
    };
  }
};

export const getReconciliationMismatches: Tool = {
  name: 'get_reconciliation_mismatches',
  description: 'Get transactions where our system status differs from bank status',
  parameters: {
    resolved: { type: 'boolean', description: 'Filter resolved or unresolved mismatches' },
    limit:    { type: 'number',  description: 'Max results' },
  },
  execute: ({ resolved, limit = 10 }: any) => {
    const m = db.getMismatches(resolved).slice(0, limit);
    return { count: m.length, mismatches: m };
  }
};

export const getAuditTrail: Tool = {
  name: 'get_audit_trail',
  description: 'Get the complete state history of a transaction',
  parameters: { transaction_id: { type: 'string', description: 'Transaction ID' } },
  execute: ({ transaction_id }: any) => {
    const logs = db.getAuditLogs(transaction_id);
    if (!logs.length) return { error: `No audit trail for ${transaction_id}` };
    return { transaction_id, event_count: logs.length, events: logs };
  }
};

export const detectPatterns: Tool = {
  name: 'detect_patterns',
  description: 'Detect failure patterns — bank outages, sudden spikes, timeout clusters',
  parameters: { hours_ago: { type: 'number', description: 'Analysis window in hours (default 1)' } },
  execute: ({ hours_ago = 1 }: any) => {
    const cutoff = since(hours_ago);
    const txns   = db.getAllTransactions().filter(t => t.created_at >= cutoff);
    const failed = txns.filter(t => t.status === 'FAILED');

    const bankMap: Record<string, {total:number,fail:number}> = {};
    txns.forEach(t => {
      if (!t.bank_code) return;
      if (!bankMap[t.bank_code]) bankMap[t.bank_code] = { total: 0, fail: 0 };
      bankMap[t.bank_code].total++;
      if (t.status === 'FAILED') bankMap[t.bank_code].fail++;
    });

    const patterns: any[] = [];
    Object.entries(bankMap).forEach(([bank, s]) => {
      const rate = (s.fail / s.total) * 100;
      if (rate > 50) patterns.push({
        type: 'HIGH_BANK_FAILURE_RATE', severity: rate > 80 ? 'CRITICAL' : 'WARNING',
        message: `${bank} has ${rate.toFixed(0)}% failure rate (${s.fail}/${s.total} txns)`,
      });
    });

    const timeouts = failed.filter(t => t.failure_code === 'BANK_TIMEOUT').length;
    if (timeouts >= 3) patterns.push({
      type: 'TIMEOUT_SPIKE', severity: 'WARNING',
      message: `${timeouts} bank timeouts detected — possible gateway outage`,
    });

    return {
      window_hours: hours_ago, patterns_found: patterns.length, patterns,
      total_in_window: txns.length, failures_in_window: failed.length,
    };
  }
};

export const ALL_TOOLS: Tool[] = [
  getTransactionDetails, queryFailedTransactions, getFailureStats,
  getReconciliationMismatches, getAuditTrail, detectPatterns,
];

export const getToolDefinitions = () => ({
  function_declarations: ALL_TOOLS.map(t => ({
    name: t.name, description: t.description,
    parameters: { type: 'object', properties: t.parameters }
  }))
});
