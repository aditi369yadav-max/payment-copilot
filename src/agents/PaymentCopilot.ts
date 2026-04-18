import { GoogleGenAI } from '@google/genai';
import { ALL_TOOLS }   from '../tools/paymentTools';
import { logger }      from '../utils/logger';

const SYSTEM_PROMPT = `You are a Payment Operations Copilot for a fintech team. Use tools to get real data before answering. Be specific with transaction IDs, failure codes, and timestamps.`;

export interface Message { role: 'user' | 'assistant'; content: string; }
export interface CopilotResponse { message: string; toolsCalled: string[]; }

const toolDeclarations = ALL_TOOLS.map(t => ({
  name: t.name, description: t.description,
  parameters: { type: 'OBJECT' as any, properties: t.parameters }
}));

export class PaymentCopilot {
  private ai: GoogleGenAI;
  private sessions: Map<string, Message[]> = new Map();

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async chat(sessionId: string, userMessage: string): Promise<CopilotResponse> {
    if (!this.sessions.has(sessionId)) this.sessions.set(sessionId, []);
    const history = this.sessions.get(sessionId)!;
    const toolsCalled: string[] = [];
    let finalText = '';

    const contents: any[] = [
      ...history.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
      { role: 'user', parts: [{ text: userMessage }] },
    ];

    try {
      let iterations = 0;
      while (iterations < 5) {
        iterations++;
        const response = await this.ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents,
          config: {
            systemInstruction: SYSTEM_PROMPT,
            tools: [{ functionDeclarations: toolDeclarations }],
          },
        });

        const parts = response.candidates?.[0]?.content?.parts ?? [];
        const funcCalls = parts.filter((p: any) => p.functionCall);
        parts.filter((p: any) => p.text).forEach((p: any) => { finalText += p.text; });

        if (funcCalls.length === 0) break;

        const funcResults: any[] = [];
        for (const part of funcCalls) {
          const { name, args } = part.functionCall;
          logger.info(`Tool: ${name}`);
          toolsCalled.push(name);
          const tool = ALL_TOOLS.find(t => t.name === name);
          const result = tool ? tool.execute(args) : { error: 'Unknown tool' };
          funcResults.push({ functionResponse: { name, response: { content: JSON.stringify(result) } } });
        }

        contents.push({ role: 'model', parts });
        contents.push({ role: 'user', parts: funcResults });
      }

      history.push({ role: 'user', content: userMessage });
      history.push({ role: 'assistant', content: finalText });
      return { message: finalText || 'No response generated.', toolsCalled };

    } catch (error: any) {
      logger.error('Copilot error', { error: error.message });
      if (error.message?.includes('429')) return { message: 'Rate limit hit. Wait a moment.', toolsCalled };
      return { message: `Error: ${error.message}`, toolsCalled };
    }
  }

  clearSession(s: string) { this.sessions.set(s, []); }
  getSuggestedQuestions() {
    return [
      "What payment failures happened in the last hour?",
      "Are there any banks with high failure rates?",
      "Show me all HDFC timeouts recently",
      "What are the top failure reasons today?",
      "Any reconciliation mismatches I should know about?",
      "Detect failure patterns in the last 2 hours",
      "What's the overall payment success rate?",
      "Show me all fraud-flagged transactions",
    ];
  }
}