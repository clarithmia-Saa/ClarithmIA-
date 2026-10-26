import { sha256Hex } from './auth.ts';
import type { FeedbackAuthor, NormalizedFeedback } from './types.ts';

const MAX_TEXT = 5000;
const MAX_SUBJECT = 300;
const MAX_META_KEYS = 20;
const MAX_META_STRING = 200;

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };

/** Strips HTML and control characters, collapses whitespace and bounds the length. */
export function cleanText(input: unknown, max = MAX_TEXT): string {
  if (input === null || input === undefined) return '';
  const raw = typeof input === 'string' ? input : typeof input === 'number' || typeof input === 'boolean' ? String(input) : '';
  return raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (entity) => ENTITIES[entity] ?? entity)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Accepts ISO strings, epoch seconds/milliseconds (number or numeric string). */
export function toIso(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  let ms: number;
  if (typeof value === 'number') ms = value < 1e11 ? value * 1000 : value;
  else if (typeof value === 'string' && /^\d{9,13}$/.test(value.trim())) {
    const n = Number(value.trim());
    ms = n < 1e11 ? n * 1000 : n;
  } else if (typeof value === 'string') ms = Date.parse(value);
  else return null;
  if (!Number.isFinite(ms)) return null;
  const date = new Date(ms);
  const year = date.getUTCFullYear();
  return year >= 2000 && year <= 2100 ? date.toISOString() : null;
}

/** Maps 1-5, 0-10 and 0-100 style ratings to the 1..5 scale. */
export function normalizeRating(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  if (!Number.isFinite(n) || n < 0) return undefined;
  let scaled: number;
  if (n <= 5) scaled = n;
  else if (n <= 10) scaled = n / 2;
  else if (n <= 100) scaled = n / 20;
  else return undefined;
  const rounded = Math.round(scaled * 10) / 10;
  return rounded < 1 ? 1 : rounded;
}

function sanitizeSlug(value: unknown, fallback: string): string {
  const slug = cleanText(value, 40).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : fallback;
}

function shallowMetadata(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (count >= MAX_META_KEYS) break;
    const safeKey = key.slice(0, 60);
    if (typeof item === 'string') out[safeKey] = item.slice(0, MAX_META_STRING);
    else if (typeof item === 'number' || typeof item === 'boolean') out[safeKey] = item;
    else continue;
    count += 1;
  }
  return out;
}

async function build(input: {
  source: string;
  channel: string;
  externalId: string;
  author: FeedbackAuthor;
  subject?: string;
  text: string;
  rating?: number;
  url?: string;
  language?: string;
  createdAt: string;
  receivedAt: string;
  metadata: Record<string, unknown>;
}): Promise<NormalizedFeedback> {
  const dedupeKey = await sha256Hex(`${input.source}:${input.externalId}`);
  return {
    id: `${input.source}:${input.externalId}`,
    dedupeKey,
    source: input.source,
    channel: input.channel,
    externalId: input.externalId,
    author: input.author,
    ...(input.subject ? { subject: input.subject } : {}),
    text: input.text,
    ...(input.rating !== undefined ? { rating: input.rating } : {}),
    ...(input.url ? { url: input.url } : {}),
    ...(input.language ? { language: input.language } : {}),
    createdAt: input.createdAt,
    receivedAt: input.receivedAt,
    metadata: input.metadata,
  };
}

/* ------------------------------- Zendesk -------------------------------- */

export interface ZendeskTicket {
  id?: number | string;
  subject?: string | null;
  description?: string | null;
  status?: string;
  priority?: string | null;
  type?: string | null;
  requester_id?: number | string | null;
  assignee_id?: number | string | null;
  created_at?: string;
  updated_at?: string;
  tags?: string[];
  via?: { channel?: string };
  satisfaction_rating?: { score?: string } | null;
}

export interface ZendeskUser {
  id?: number | string;
  name?: string;
  email?: string;
}

export async function normalizeZendeskTicket(
  ticket: ZendeskTicket,
  requesters: Map<string, ZendeskUser>,
  ctx: { subdomain: string; baseUrl: string; receivedAt: string },
): Promise<NormalizedFeedback | { skip: string }> {
  if (ticket.id === undefined || ticket.id === null) return { skip: 'missing_id' };
  if (ticket.status === 'deleted') return { skip: 'deleted' };
  const subject = cleanText(ticket.subject, MAX_SUBJECT);
  const text = cleanText(ticket.description ?? ticket.subject);
  if (text.length < 2) return { skip: 'empty_text' };
  const createdAt = toIso(ticket.created_at);
  if (!createdAt) return { skip: 'invalid_date' };

  const requesterId = ticket.requester_id !== undefined && ticket.requester_id !== null ? String(ticket.requester_id) : undefined;
  const requester = requesterId ? requesters.get(requesterId) : undefined;
  const csat = ticket.satisfaction_rating?.score;
  const rating = csat === 'good' ? 5 : csat === 'bad' ? 1 : undefined;

  return build({
    source: 'zendesk',
    channel: 'support',
    externalId: String(ticket.id),
    author: {
      ...(requesterId ? { id: requesterId } : {}),
      name: cleanText(requester?.name, 120) || (requesterId ? `Requester ${requesterId}` : 'Unknown requester'),
      ...(requester?.email ? { email: cleanText(requester.email, 160).toLowerCase() } : {}),
    },
    ...(subject ? { subject } : {}),
    text,
    ...(rating !== undefined ? { rating } : {}),
    url: `${ctx.baseUrl}/agent/tickets/${ticket.id}`,
    createdAt,
    receivedAt: ctx.receivedAt,
    metadata: {
      status: ticket.status ?? 'unknown',
      priority: ticket.priority ?? 'none',
      type: ticket.type ?? 'none',
      viaChannel: ticket.via?.channel ?? 'unknown',
      tags: (ticket.tags ?? []).slice(0, 15),
      updatedAt: toIso(ticket.updated_at) ?? null,
      subdomain: ctx.subdomain,
    },
  });
}

/* --------------------------------- X ------------------------------------ */

export interface TweetV2 {
  id?: string;
  text?: string;
  author_id?: string;
  created_at?: string;
  lang?: string;
  conversation_id?: string;
  in_reply_to_user_id?: string;
  referenced_tweets?: { type?: string; id?: string }[];
  public_metrics?: Record<string, number>;
}

export interface TwitterUserV2 {
  id?: string;
  username?: string;
  name?: string;
  verified?: boolean;
  public_metrics?: Record<string, number>;
}

export async function normalizeTweet(
  tweet: TweetV2,
  users: Map<string, TwitterUserV2>,
  ctx: { ownUserId: string; receivedAt: string },
): Promise<NormalizedFeedback | { skip: string }> {
  if (!tweet.id) return { skip: 'missing_id' };
  if (tweet.author_id && tweet.author_id === ctx.ownUserId) return { skip: 'own_tweet' };
  const text = cleanText(tweet.text);
  if (text.length < 2) return { skip: 'empty_text' };
  const createdAt = toIso(tweet.created_at);
  if (!createdAt) return { skip: 'invalid_date' };
  const author = tweet.author_id ? users.get(tweet.author_id) : undefined;
  const handle = author?.username ? `@${author.username}` : undefined;

  return build({
    source: 'twitter',
    channel: 'twitter',
    externalId: tweet.id,
    author: {
      ...(tweet.author_id ? { id: tweet.author_id } : {}),
      name: cleanText(author?.name, 120) || handle || (tweet.author_id ? `User ${tweet.author_id}` : 'Unknown user'),
      ...(handle ? { handle } : {}),
    },
    text,
    url: author?.username ? `https://x.com/${author.username}/status/${tweet.id}` : `https://x.com/i/web/status/${tweet.id}`,
    ...(tweet.lang && /^[a-z]{2,3}$/i.test(tweet.lang) ? { language: tweet.lang.toLowerCase() } : {}),
    createdAt,
    receivedAt: ctx.receivedAt,
    metadata: {
      conversationId: tweet.conversation_id ?? null,
      referencedTypes: (tweet.referenced_tweets ?? []).map((ref) => ref.type ?? 'unknown').slice(0, 5),
      ...(tweet.public_metrics ? { publicMetrics: tweet.public_metrics } : {}),
      verifiedAuthor: author?.verified ?? false,
      authorFollowers: author?.public_metrics?.followers_count ?? null,
    },
  });
}

/* ------------------------------- Webhook -------------------------------- */

const TEXT_KEYS = ['text', 'message', 'body', 'content', 'comment', 'review', 'feedback', 'description'] as const;
const ID_KEYS = ['id', 'external_id', 'externalId', 'ticket_id', 'review_id', 'uuid'] as const;
const DATE_KEYS = ['created_at', 'createdAt', 'timestamp', 'date', 'submitted_at', 'time'] as const;
const SOURCE_KEYS = ['source', 'platform', 'origin', 'system'] as const;
const URL_KEYS = ['url', 'link', 'permalink'] as const;
const RATING_KEYS = ['rating', 'stars', 'score', 'nps'] as const;

function pick(raw: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

function parseAuthor(raw: Record<string, unknown>): FeedbackAuthor {
  const candidate = pick(raw, ['author', 'user', 'customer', 'reviewer', 'from']);
  const author: FeedbackAuthor = { name: 'Anonymous' };
  const fromObject = (obj: Record<string, unknown>) => {
    const name = cleanText(pick(obj, ['name', 'full_name', 'fullName', 'display_name', 'username']), 120);
    const email = cleanText(pick(obj, ['email', 'mail']), 160).toLowerCase();
    const handle = cleanText(pick(obj, ['handle', 'username']), 60);
    const id = cleanText(pick(obj, ['id', 'user_id']), 80);
    if (name) author.name = name;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) author.email = email;
    if (handle) author.handle = handle;
    if (id) author.id = id;
  };
  if (typeof candidate === 'string') {
    const text = cleanText(candidate, 160);
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text)) {
      author.email = text.toLowerCase();
      author.name = text.split('@')[0] ?? 'Anonymous';
    } else if (text) author.name = text;
  } else if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
    fromObject(candidate as Record<string, unknown>);
  }
  const topEmail = cleanText(raw.email, 160).toLowerCase();
  if (!author.email && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(topEmail)) author.email = topEmail;
  const topName = cleanText(raw.name, 120);
  if (author.name === 'Anonymous' && topName) author.name = topName;
  return author;
}

export type WebhookNormalizeResult = { ok: true; feedback: NormalizedFeedback } | { ok: false; reason: string };

/** Maps an arbitrary external JSON object onto the canonical feedback model. */
export async function normalizeWebhookItem(
  raw: unknown,
  ctx: { defaultSource: string; receivedAt: string },
): Promise<WebhookNormalizeResult> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'item_must_be_object' };
  const item = raw as Record<string, unknown>;

  const text = cleanText(pick(item, TEXT_KEYS));
  if (text.length < 2) return { ok: false, reason: 'missing_text' };

  const createdAt = toIso(pick(item, DATE_KEYS)) ?? ctx.receivedAt;
  const source = sanitizeSlug(pick(item, SOURCE_KEYS), ctx.defaultSource);
  const subject = cleanText(pick(item, ['subject', 'title']), MAX_SUBJECT);
  const rating = normalizeRating(pick(item, RATING_KEYS));
  const url = cleanText(pick(item, URL_KEYS), 500);
  const rawId = pick(item, ID_KEYS);
  const externalId =
    typeof rawId === 'string' || typeof rawId === 'number'
      ? cleanText(rawId, 120)
      : `h_${(await sha256Hex(`${source}|${text}|${createdAt}`)).slice(0, 24)}`;
  if (!externalId) return { ok: false, reason: 'invalid_id' };

  const language = cleanText(item.language ?? item.lang, 10).toLowerCase();

  return {
    ok: true,
    feedback: await build({
      source,
      channel: sanitizeSlug(item.channel, source),
      externalId,
      author: parseAuthor(item),
      ...(subject ? { subject } : {}),
      text,
      ...(rating !== undefined ? { rating } : {}),
      ...(/^https?:\/\//i.test(url) ? { url } : {}),
      ...(/^[a-z]{2,3}(-[a-z]{2})?$/.test(language) ? { language } : {}),
      createdAt,
      receivedAt: ctx.receivedAt,
      metadata: shallowMetadata(item.metadata),
    }),
  };
}
