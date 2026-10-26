import { intEnv } from './env.ts';
import type { AiAnalysis, NormalizedFeedback, ProcessedFeedback, Sentiment, UrgencyLevel } from './types.ts';

/**
 * Deterministic stand-in for the real AI pipeline: a bilingual (EN/PT) lexicon
 * model that produces sentiment, category and urgency with the same shape the
 * production model will return. Swap `analyze` for an LLM call later.
 */
export const AI_MODEL = 'clarithmia-sim-1';

const POSITIVE: Record<string, number> = {
  love: 2, loved: 2, great: 1.5, awesome: 2, amazing: 2, excellent: 2, fantastic: 2, perfect: 2, thanks: 1, thank: 1,
  helpful: 1.5, fast: 1, quick: 1, easy: 1, intuitive: 1.5, smooth: 1.5, happy: 1.5, recommend: 1.5, beautiful: 1.5,
  gorgeous: 2, nice: 1, good: 1, best: 1.5, wonderful: 2, impressed: 1.5, solved: 1.5, resolved: 1,
  amei: 2, adorei: 2, otimo: 2, excelente: 2, perfeito: 2, obrigado: 1, obrigada: 1, rapido: 1, facil: 1,
  maravilhoso: 2, parabens: 1.5, bom: 1, melhor: 1.5, incrivel: 2, gostei: 1.5,
};

const NEGATIVE: Record<string, number> = {
  terrible: -2, awful: -2, horrible: -2, worst: -2.5, hate: -2, slow: -1.5, broken: -2, bug: -1.5, bugs: -1.5,
  crash: -2, crashes: -2, crashing: -2, error: -1.5, errors: -1.5, fail: -1.5, failed: -1.5, failing: -1.5,
  frustrated: -2, frustrating: -2, disappointed: -2, useless: -2, unusable: -2.5, annoying: -1.5, confusing: -1.5,
  laggy: -1.5, lag: -1, freeze: -1.5, freezes: -1.5, stuck: -1.5, lost: -1.5, refund: -1, cancel: -1, scam: -3,
  ridiculous: -2, unacceptable: -2.5, angry: -2, problem: -1, problems: -1, issue: -0.8, issues: -0.8, forever: -1.5,
  waiting: -0.8, abandoned: -1,
  pessimo: -2.5, horrivel: -2, pior: -2.5, lento: -1.5, trava: -2, travando: -2, travou: -2, erro: -1.5, falha: -1.5,
  frustrado: -2, frustrante: -2, decepcionado: -2, inutil: -2, cancelar: -1, reembolso: -1, problema: -1, ruim: -1.5,
  demora: -1.5, quebrado: -2,
};

const NEGATIVE_PHRASES: [string, number][] = [
  ['charged twice', -2.5], ['double charged', -2.5], ['cobrado duas vezes', -2.5], ['not working', -2],
  ['doesnt work', -2], ['nao funciona', -2], ['no response', -1.5], ['sem resposta', -1.5], ['takes forever', -2],
  ['waste of', -2], ['cant log in', -1.5], ['cannot log in', -1.5], ['unable to log in', -1.5], ['nao consigo entrar', -1.5],
];

const NEGATORS = new Set(['not', 'no', 'never', 'cant', 'cannot', 'dont', 'doesnt', 'didnt', 'wont', 'isnt', 'nao', 'nunca', 'nem']);
const INTENSIFIERS = new Set(['very', 'really', 'extremely', 'so', 'super', 'totally', 'muito', 'extremamente']);

interface CategoryRule {
  name: string;
  keywords: string[];
  urgencyBonus: number;
}

const CATEGORIES: CategoryRule[] = [
  { name: 'Billing', urgencyBonus: 8, keywords: ['charge', 'charged', 'billing', 'invoice', 'payment', 'refund', 'subscription', 'price', 'pricing', 'cobranca', 'fatura', 'pagamento', 'reembolso', 'assinatura', 'preco'] },
  { name: 'Stability', urgencyBonus: 8, keywords: ['crash', 'crashes', 'crashing', 'bug', 'bugs', 'error', 'errors', 'broken', 'freeze', 'freezes', 'fail', 'failed', 'erro', 'falha', 'travando', 'travou', 'trava', 'quebrado'] },
  { name: 'Performance', urgencyBonus: 6, keywords: ['slow', 'lag', 'laggy', 'loading', 'load', 'performance', 'timeout', 'latency', 'speed', 'forever', 'lento', 'demora', 'carregando', 'desempenho'] },
  { name: 'UI/UX', urgencyBonus: 0, keywords: ['design', 'interface', 'layout', 'dark mode', 'button', 'screen', 'ui', 'ux', 'navigation', 'theme', 'tema', 'botao', 'tela'] },
  { name: 'Onboarding', urgencyBonus: 0, keywords: ['onboarding', 'setup', 'getting started', 'tutorial', 'signup', 'sign up', 'configuracao', 'cadastro'] },
  { name: 'Integrations', urgencyBonus: 2, keywords: ['integration', 'integrations', 'api', 'webhook', 'export', 'csv', 'sync', 'zapier', 'slack', 'integracao', 'exportar'] },
  { name: 'Features', urgencyBonus: 0, keywords: ['feature', 'request', 'wish', 'would love', 'please add', 'suggestion', 'recurso', 'sugestao', 'gostaria'] },
  { name: 'Support', urgencyBonus: 3, keywords: ['support', 'ticket', 'agent', 'response', 'waiting', 'suporte', 'atendimento', 'resposta'] },
];

const URGENT_PHRASES = [
  'urgent', 'asap', 'immediately', 'critical', 'blocker', 'blocking', 'outage', 'down', 'data loss', 'security', 'breach',
  'legal', 'lawsuit', 'lost customers', 'losing customers', 'lost money', 'charged twice', 'double charged', 'no response',
  'cant login', 'cannot login', 'cant log in', 'cannot log in', 'unable to log in', 'locked out', 'cant access', 'cannot access',
  'nao consigo entrar', 'nao consigo acessar', 'urgente', 'imediatamente', 'fora do ar', 'bloqueado', 'vazamento', 'perdi',
  'cobrado duas vezes', 'sem resposta',
];

const PRIORITY_BONUS: Record<string, number> = { urgent: 20, high: 12, normal: 0, low: -5 };

function normalizeForMatch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;

function scoreSentiment(norm: string, tokens: string[], rating: number | undefined): { score: number; label: Sentiment; hits: number } {
  let raw = 0;
  let hits = 0;
  tokens.forEach((token, index) => {
    const weight = POSITIVE[token] ?? NEGATIVE[token];
    if (weight === undefined) return;
    hits += 1;
    let value = weight;
    const previous = tokens.slice(Math.max(0, index - 2), index);
    if (previous.some((p) => NEGATORS.has(p))) value = -value * 0.8;
    if (previous.some((p) => INTENSIFIERS.has(p))) value *= 1.4;
    raw += value;
  });
  for (const [phrase, weight] of NEGATIVE_PHRASES) {
    if (norm.includes(phrase)) {
      raw += weight;
      hits += 1;
    }
  }
  const textScore = Math.tanh(raw / 3);
  const combined = rating !== undefined ? 0.55 * textScore + 0.45 * ((rating - 3) / 2) : textScore;
  const score = round(clamp(combined, -1, 1));
  const label: Sentiment = score >= 0.25 ? 'positive' : score <= -0.25 ? 'negative' : 'neutral';
  return { score, label, hits };
}

function pickCategory(norm: string, tokens: Set<string>): { name: string; topics: string[]; hits: number; bonus: number } {
  let best: { rule: CategoryRule; matched: string[] } | null = null;
  for (const rule of CATEGORIES) {
    const matched = rule.keywords.filter((keyword) => (keyword.includes(' ') ? norm.includes(keyword) : tokens.has(keyword)));
    if (matched.length === 0) continue;
    if (!best || matched.length > best.matched.length) best = { rule, matched };
  }
  if (!best) return { name: 'General', topics: [], hits: 0, bonus: 0 };
  return { name: best.rule.name, topics: [...new Set(best.matched)].slice(0, 5), hits: best.matched.length, bonus: best.rule.urgencyBonus };
}

function levelFor(score: number): UrgencyLevel {
  if (score >= 85) return 'critical';
  if (score >= 65) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}

function summarize(text: string): string {
  const firstSentence = text.split(/(?<=[.!?])\s+/)[0] ?? text;
  return firstSentence.length > 140 ? `${firstSentence.slice(0, 137)}…` : firstSentence;
}

export function analyze(feedback: NormalizedFeedback, now: () => number = Date.now): AiAnalysis {
  const started = now();
  const full = [feedback.subject, feedback.text].filter(Boolean).join('. ');
  const norm = normalizeForMatch(full);
  const tokens = norm.split(' ').filter(Boolean);
  const tokenSet = new Set(tokens);

  const sentiment = scoreSentiment(norm, tokens, feedback.rating);
  const category = pickCategory(norm, tokenSet);

  const reasons: string[] = [];
  let urgency = 10;

  const negativity = Math.max(0, -sentiment.score) * 45;
  if (negativity >= 10) reasons.push('strong negative sentiment');
  urgency += negativity;

  const padded = ` ${norm} `;
  const urgentHits = URGENT_PHRASES.filter((phrase) => padded.includes(` ${phrase} `));
  if (urgentHits.length > 0) {
    reasons.push(`urgent signals: ${urgentHits.slice(0, 3).join(', ')}`);
    urgency += Math.min(36, urgentHits.length * 12);
  }
  if (category.bonus > 0) {
    reasons.push(`${category.name.toLowerCase()} impact`);
    urgency += category.bonus;
  }
  const letters = full.replace(/[^A-Za-z]/g, '');
  if (letters.length > 15 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.5) {
    urgency += 5;
    reasons.push('shouting (all caps)');
  }
  if ((full.match(/!/g) ?? []).length >= 3) urgency += 4;
  if (feedback.rating !== undefined && feedback.rating <= 2) {
    urgency += 8;
    reasons.push('low rating');
  }
  const priority = typeof feedback.metadata.priority === 'string' ? feedback.metadata.priority : undefined;
  if (priority && PRIORITY_BONUS[priority] !== undefined) {
    urgency += PRIORITY_BONUS[priority] ?? 0;
    if ((PRIORITY_BONUS[priority] ?? 0) > 0) reasons.push(`source priority: ${priority}`);
  }
  if (sentiment.label === 'positive') urgency = Math.min(urgency, 25);
  const urgencyScore = Math.round(clamp(urgency, 0, 100));
  const level = levelFor(urgencyScore);

  let confidence = 0.55 + 0.1 * Math.min(4, sentiment.hits + category.hits);
  if (feedback.rating !== undefined) confidence += 0.1;
  if (tokens.length < 4) confidence -= 0.1;

  const finished = now();
  return {
    model: AI_MODEL,
    sentiment: { label: sentiment.label, score: sentiment.score },
    category: category.name,
    topics: category.topics,
    urgency: {
      score: urgencyScore,
      level,
      inboxLevel: level === 'critical' || level === 'high' ? 'high' : level === 'medium' ? 'medium' : 'low',
      reasons,
    },
    confidence: round(clamp(confidence, 0.5, 0.97)),
    summary: summarize(feedback.text),
    processedAt: new Date(finished).toISOString(),
    processingMs: finished - started,
  };
}

/** Runs the (simulated) AI step for a batch. `AI_SIMULATED_LATENCY_MS` mimics model latency. */
export async function analyzeBatch(items: readonly NormalizedFeedback[]): Promise<ProcessedFeedback[]> {
  const latency = intEnv('AI_SIMULATED_LATENCY_MS', 0, 0, 2000);
  if (latency > 0) await new Promise<void>((resolve) => setTimeout(resolve, latency));
  return items.map((item) => ({ ...item, analysis: analyze(item) }));
}
