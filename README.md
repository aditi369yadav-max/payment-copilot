# Payment Operations Copilot

An LLM-powered AI agent that helps payment operations engineers debug transaction failures, detect anomalies, and analyze reconciliation mismatches — in plain English.

## What It Does

Ask questions like:
- *"Why did transaction TXN_123 fail?"*
- *"Are there any banks with high failure rates right now?"*
- *"Show me all HDFC timeouts in the last 30 minutes"*
- *"Detect any failure patterns in the last hour"*

The AI agent queries your real payment database, analyzes the data, and gives you actionable answers.

## Architecture

```
User Question
     │
     ▼
Gemini 1.5 Flash (LLM)
     │
     ├── Decides which tool to call
     │
     ▼
Tool Execution (queries SQLite DB)
├── get_transaction_details
├── query_failed_transactions
├── get_failure_stats
├── get_reconciliation_mismatches
├── get_audit_trail
└── detect_patterns
     │
     ▼
Results sent back to Gemini
     │
     ▼
Human-readable answer with insights
```

## Quick Start

```bash
npm install

# Add your Gemini API key
cp .env.example .env
# Edit .env and add GEMINI_API_KEY=your_key

# Seed the database with sample payment data
npm run seed

# Start the server
npm run dev
# Open http://localhost:3001
```

## Tech Stack
Node.js · TypeScript · Express · Gemini 1.5 Flash · SQLite · Tool Use / Function Calling
