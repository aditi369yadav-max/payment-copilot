import { v4 as uuid } from 'uuid';
import { db } from './database';

const BANKS         = ['HDFC', 'AXIS', 'SBI', 'ICICI', 'KOTAK'];
const METHODS       = ['UPI', 'CARD', 'NETBANKING', 'WALLET'];
const FAILURE_CODES = [
  { code: 'INSUFFICIENT_BALANCE',  reason: 'User has insufficient balance' },
  { code: 'BANK_TIMEOUT',          reason: 'Bank gateway did not respond within timeout' },
  { code: 'INVALID_VPA',           reason: 'UPI Virtual Payment Address is invalid' },
  { code: 'TRANSACTION_DECLINED',  reason: 'Bank declined the transaction' },
  { code: 'DUPLICATE_TRANSACTION', reason: 'Duplicate transaction detected by bank' },
  { code: 'FRAUD_SUSPECTED',       reason: 'Transaction flagged by fraud detection' },
  { code: 'DAILY_LIMIT_EXCEEDED',  reason: 'User daily transaction limit exceeded' },
  { code: 'NETWORK_ERROR',         reason: 'Network connectivity issue' },
];

const past = (m: number) => new Date(Date.now() - m * 60000).toISOString();

db.clearAll();
console.log('Seeding payment data...');

// ── Recent failures ───────────────────────────────────────────
for (let i = 0; i < 10; i++) {
  const id = `TXN_FAIL_${uuid().slice(0,8).toUpperCase()}`;
  const f  = FAILURE_CODES[i % FAILURE_CODES.length];
  const bank = BANKS[i % BANKS.length];
  const method = METHODS[i % METHODS.length];
  const amount = Math.floor(Math.random() * 5000) + 100;
  const t = past(Math.floor(Math.random() * 60));

  db.insertTransaction({ id, user_id: `user_${100+i}`, amount, currency: 'INR', status: 'FAILED',
    payment_method: method, bank_code: bank, failure_reason: f.reason, failure_code: f.code,
    retry_count: 0, created_at: t, updated_at: t, metadata: null });
  db.insertAuditLog({ transaction_id: id, from_status: null, to_status: 'INITIATED', event: 'PAYMENT_INITIATED', details: `Amount: ₹${amount}`, created_at: t });
  db.insertAuditLog({ transaction_id: id, from_status: 'INITIATED', to_status: 'PROCESSING', event: 'SENT_TO_BANK', details: `Bank: ${bank}`, created_at: t });
  db.insertAuditLog({ transaction_id: id, from_status: 'PROCESSING', to_status: 'FAILED', event: 'BANK_RESPONSE', details: f.reason, created_at: t });
  db.insertBankCallback({ transaction_id: id, bank_code: bank, bank_status: 'FAILED', bank_reference: null, error_code: f.code, received_at: t });
}

// ── Successful ────────────────────────────────────────────────
for (let i = 0; i < 15; i++) {
  const id = `TXN_SUCC_${uuid().slice(0,8).toUpperCase()}`;
  const bank = BANKS[i % BANKS.length];
  const amount = Math.floor(Math.random() * 10000) + 500;
  const t = past(Math.floor(Math.random() * 1440));
  const ref = `BANK_REF_${Math.random().toString(36).slice(2,10).toUpperCase()}`;

  db.insertTransaction({ id, user_id: `user_${200+i}`, amount, currency: 'INR', status: 'SUCCESS',
    payment_method: METHODS[i%METHODS.length], bank_code: bank, failure_reason: null, failure_code: null,
    retry_count: 0, created_at: t, updated_at: t, metadata: null });
  db.insertAuditLog({ transaction_id: id, from_status: null, to_status: 'INITIATED', event: 'PAYMENT_INITIATED', details: `Amount: ₹${amount}`, created_at: t });
  db.insertAuditLog({ transaction_id: id, from_status: 'PROCESSING', to_status: 'SUCCESS', event: 'BANK_CONFIRMED', details: `Reference: ${ref}`, created_at: t });
  db.insertBankCallback({ transaction_id: id, bank_code: bank, bank_status: 'SUCCESS', bank_reference: ref, error_code: null, received_at: t });
}

// ── HDFC mass timeout ─────────────────────────────────────────
for (let i = 0; i < 5; i++) {
  const id = `TXN_HDFC_${uuid().slice(0,8).toUpperCase()}`;
  const amount = Math.floor(Math.random() * 3000) + 200;
  const t = past(30 + i * 2);

  db.insertTransaction({ id, user_id: `user_${300+i}`, amount, currency: 'INR', status: 'FAILED',
    payment_method: 'UPI', bank_code: 'HDFC', failure_reason: 'Bank gateway timeout', failure_code: 'BANK_TIMEOUT',
    retry_count: 0, created_at: t, updated_at: t, metadata: null });
  db.insertAuditLog({ transaction_id: id, from_status: 'PROCESSING', to_status: 'FAILED', event: 'TIMEOUT', details: 'HDFC gateway timeout after 30s', created_at: t });
  db.insertBankCallback({ transaction_id: id, bank_code: 'HDFC', bank_status: 'TIMEOUT', bank_reference: null, error_code: 'BANK_TIMEOUT', received_at: t });
}

// ── Reconciliation mismatches ─────────────────────────────────
for (let i = 0; i < 5; i++) {
  const id = `TXN_RECON_${uuid().slice(0,8).toUpperCase()}`;
  const bank = BANKS[i % BANKS.length];
  const amount = Math.floor(Math.random() * 8000) + 1000;
  const t = past(120 + i * 10);

  db.insertTransaction({ id, user_id: `user_${400+i}`, amount, currency: 'INR', status: 'PENDING',
    payment_method: 'CARD', bank_code: bank, failure_reason: null, failure_code: null,
    retry_count: 0, created_at: t, updated_at: t, metadata: null });
  db.insertBankCallback({ transaction_id: id, bank_code: bank, bank_status: 'SUCCESS', bank_reference: `REF_${i}`, error_code: null, received_at: t });
  db.insertMismatch({ transaction_id: id, our_status: 'PENDING', bank_status: 'SUCCESS', mismatch_type: 'STATUS_MISMATCH', amount_diff: 0, detected_at: t, resolved: 0, resolution: null });
}

// ── Fraud flagged ─────────────────────────────────────────────
for (let i = 0; i < 3; i++) {
  const id = `TXN_FRAUD_${uuid().slice(0,8).toUpperCase()}`;
  const amount = Math.floor(Math.random() * 50000) + 25000;
  const t = past(Math.floor(Math.random() * 180));

  db.insertTransaction({ id, user_id: `user_${500+i}`, amount, currency: 'INR', status: 'FAILED',
    payment_method: 'CARD', bank_code: 'ICICI', failure_reason: 'Transaction flagged by fraud detection', failure_code: 'FRAUD_SUSPECTED',
    retry_count: 0, created_at: t, updated_at: t, metadata: JSON.stringify({ risk_score: 0.92 }) });
  db.insertAuditLog({ transaction_id: id, from_status: 'PROCESSING', to_status: 'FAILED', event: 'FRAUD_FLAGGED', details: 'High risk score: 0.92', created_at: t });
  db.insertBankCallback({ transaction_id: id, bank_code: 'ICICI', bank_status: 'DECLINED', bank_reference: null, error_code: 'FRAUD_SUSPECTED', received_at: t });
}

const all = db.getAllTransactions();
console.log(`\n✅ Seeded ${all.length} transactions`);
console.log(`   Failed:  ${all.filter(t => t.status === 'FAILED').length}`);
console.log(`   Success: ${all.filter(t => t.status === 'SUCCESS').length}`);
console.log(`   Pending: ${all.filter(t => t.status === 'PENDING').length}`);
