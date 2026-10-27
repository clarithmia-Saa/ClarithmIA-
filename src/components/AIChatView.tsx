import { useEffect, useRef, useState } from 'react';
import type { Translation } from '@/i18n';
import { Icon } from '@/components/icons';

type Role = 'user' | 'ai';
type BlockKind = 'heading' | 'topic' | 'note' | 'actions';
type NavTarget = 'inbox' | 'main' | 'sources' | 'reports' | 'settings' | 'billing';
type ActionItem = { label: string; target: NavTarget };

type Block = {
  kind: BlockKind;
  text: string;
  meta?: string;
  items?: readonly string[];
  actions?: readonly ActionItem[];
};

type Message = {
  id: number;
  role: Role;
  blocks?: readonly Block[];
  text?: string;
};

type PromptId = 'criticalBugs' | 'xRequests' | 'priorityReport';
type ChatMode = 'analytical' | 'build';

const RESPONSE_ACTIONS: Record<PromptId | 'metrics', NavTarget[]> = {
  criticalBugs: ['inbox'],
  xRequests: ['inbox'],
  priorityReport: ['reports'],
  metrics: ['main', 'inbox'],
};

function actionBlock(t: Translation, targets: readonly NavTarget[]): Block {
  return { kind: 'actions', text: '', actions: targets.map((target) => ({ label: t.aichat.actionLabels[target], target })) };
}

function buildResponse(t: Translation, prompt: PromptId | 'metrics'): readonly Block[] {
  const r = t.aichat.responses[prompt];
  const blocks: Block[] = [
    { kind: 'heading', text: r.heading },
    { kind: 'note', text: r.intro },
    { kind: 'topic', text: r.topic1Title, meta: r.topic1Meta, items: r.topic1Items },
    { kind: 'topic', text: r.topic2Title, meta: r.topic2Meta, items: r.topic2Items },
    { kind: 'topic', text: r.topic3Title, meta: r.topic3Meta, items: r.topic3Items },
    { kind: 'note', text: r.closing },
    actionBlock(t, RESPONSE_ACTIONS[prompt]),
  ];
  return blocks;
}

function buildNavResponse(t: Translation, target: NavTarget): readonly Block[] {
  return [{ kind: 'note', text: t.aichat.nav[target] }, actionBlock(t, [target])];
}

type Intent =
  | { kind: 'prompt'; id: PromptId }
  | { kind: 'metrics' }
  | { kind: 'nav'; target: NavTarget }
  | null;

const NAV_VERB = /\b(open|go to|go|take me|navigate|show|view|see|abrir|abra|abre|ir para|ir|v[aá] para|me leve|mostr\w*|ver)\b/;
const NAV_TARGETS: { target: NavTarget; pattern: RegExp }[] = [
  { target: 'billing', pattern: /billing|\bplans?\b|subscription|invoice|upgrade|assinatura|\bplanos?\b|cobran|fatura/ },
  { target: 'settings', pattern: /workspace|\bteam\b|members?|settings|invite|equipe|membros|configura|convid/ },
  { target: 'sources', pattern: /sources?|integrations?|connect|\bfontes?\b|integra|conectar/ },
  { target: 'reports', pattern: /reports?|relat[oó]rios?/ },
  { target: 'main', pattern: /dashboard|painel/ },
  { target: 'inbox', pattern: /inbox|caixa de entrada|feedbacks?/ },
];

function resolveIntent(input: string, t: Translation): Intent {
  const lower = input.toLowerCase().trim();
  const words = lower.split(/\s+/).filter(Boolean);
  const wantsNav = NAV_VERB.test(lower) || words.length <= 3;
  if (wantsNav) {
    for (const { target, pattern } of NAV_TARGETS) {
      if (!pattern.test(lower)) continue;
      if (target === 'inbox' && /bug|cr[ií]tic|crash|request|pedid|top\b/.test(lower)) continue;
      return { kind: 'nav', target };
    }
  }
  const labels: Record<PromptId, string> = {
    criticalBugs: t.aichat.prompts.criticalBugs,
    xRequests: t.aichat.prompts.xRequests,
    priorityReport: t.aichat.prompts.priorityReport,
  };
  for (const id of Object.keys(labels) as PromptId[]) {
    if (lower.includes(labels[id].toLowerCase().split(' ').slice(0, 2).join(' '))) return { kind: 'prompt', id };
  }
  if (/bug|cr[ií]tic|erro|error|falha|crash/.test(lower)) return { kind: 'prompt', id: 'criticalBugs' };
  if (/relat|report|priorid|priorit|executiv|engenharia|engineering/.test(lower)) return { kind: 'prompt', id: 'priorityReport' };
  if (/metric|m[eé]trica|kpi|satisf|summary|resumo|snapshot|numbers|n[uú]meros|quantos|how many|overview|vis[aã]o geral/.test(lower)) return { kind: 'metrics' };
  if (/feedback|usu[aá]rio|user|pedid|request|pedem|asking|feature|recurso/.test(lower)) return { kind: 'prompt', id: 'xRequests' };
  return null;
}

function Greeting({ text }: { text: string }) {
  const parts = text.split(/(feedbacks?|Marina)/i);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <span key={i} className="ai-accent">{part}</span> : <span key={i}>{part}</span>
      )}
    </>
  );
}

function AIChatView({ t, onNavigate }: { t: Translation; onNavigate: (target: string) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [mode, setMode] = useState<ChatMode>('analytical');
  const [modeOpen, setModeOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const modeRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);

  useEffect(() => {
    if (messages.length === 0 && !thinking) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, thinking]);

  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  useEffect(() => {
    if (!modeOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (modeRef.current && !modeRef.current.contains(e.target as Node)) setModeOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [modeOpen]);

  function submit() {
    const val = input.trim();
    if (!val || thinking) return;
    send(val);
  }

  function send(prompt: string) {
    const intent = resolveIntent(prompt, t);

    idRef.current += 1;
    const userMsg: Message = { id: idRef.current, role: 'user', text: prompt };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setThinking(true);

    window.setTimeout(() => {
      idRef.current += 1;
      let blocks: readonly Block[];
      if (intent && intent.kind === 'nav') blocks = buildNavResponse(t, intent.target);
      else if (intent && intent.kind === 'metrics') blocks = buildResponse(t, 'metrics');
      else if (intent && intent.kind === 'prompt') blocks = buildResponse(t, intent.id);
      else blocks = t.aichat.responses.fallback as readonly Block[];
      const aiMsg: Message = { id: idRef.current, role: 'ai', blocks };
      setMessages((prev) => [...prev, aiMsg]);
      setThinking(false);
    }, 1000);
  }

  const isEmpty = messages.length === 0;
  const modeLabel = mode === 'analytical' ? t.aichat.modeAnalytical : t.aichat.modeBuild;

  return (
    <div className="ai-view">
      <div className={`ai-stage ${isEmpty ? 'is-empty' : ''}`}>
        {isEmpty ? (
          <h1 className="ai-greeting"><Greeting text={t.aichat.impactPhrase} /></h1>
        ) : (
          <div className="aichat-messages">
            {messages.map((msg) => <MessageBubble key={msg.id} message={msg} onNavigate={onNavigate} />)}
            {thinking && (
              <div className="aichat-message ai thinking">
                <div className="aichat-avatar"><Icon name="sparkles" size={15} /></div>
                <div className="aichat-bubble">
                  <span className="aichat-typing"><i /><i /><i /></span>
                </div>
              </div>
            )}
          </div>
        )}

        <form
          className="ai-input"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <textarea
            ref={taRef}
            className="ai-textarea"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={t.aichat.placeholder}
            aria-label={t.aichat.placeholder}
          />
          <div className="ai-footer">
            <button type="button" className="ai-icon-btn" aria-label={t.aichat.attach}>
              <Icon name="plus" size={20} />
            </button>
            <div className="ai-footer-right">
              <div className="ai-mode" ref={modeRef}>
                <button
                  type="button"
                  className="ai-mode-btn"
                  aria-haspopup="menu"
                  aria-expanded={modeOpen}
                  onClick={() => setModeOpen((v) => !v)}
                >
                  {modeLabel}
                  <Icon name="chevronDown" size={14} />
                </button>
                {modeOpen && (
                  <div className="ai-mode-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      className={mode === 'analytical' ? 'active' : ''}
                      onClick={() => { setMode('analytical'); setModeOpen(false); }}
                    >
                      <span className="ai-dot" />
                      {t.aichat.modeAnalytical}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className={mode === 'build' ? 'active' : ''}
                      onClick={() => { setMode('build'); setModeOpen(false); }}
                    >
                      <span className="ai-dot build" />
                      {t.aichat.modeBuild}
                    </button>
                  </div>
                )}
              </div>
              <button type="submit" className="ai-send" disabled={!input.trim() || thinking} aria-label={t.aichat.send}>
                <Icon name="send" size={16} />
              </button>
            </div>
          </div>
        </form>
        {isEmpty && <p className="ai-hint">{t.aichat.hint}</p>}
        <div ref={endRef} className="ai-end" />
      </div>
    </div>
  );
}

function MessageBubble({ message, onNavigate }: { message: Message; onNavigate: (target: string) => void }) {
  if (message.role === 'user') {
    return (
      <div className="aichat-message user">
        <div className="aichat-avatar user">MC</div>
        <div className="aichat-bubble user">{message.text}</div>
      </div>
    );
  }
  return (
    <div className="aichat-message ai">
      <div className="aichat-avatar"><Icon name="sparkles" size={15} /></div>
      <div className="aichat-bubble">
        {message.blocks?.map((block, i) => <BlockView key={i} block={block} onNavigate={onNavigate} />)}
      </div>
    </div>
  );
}

function BlockView({ block, onNavigate }: { block: Block; onNavigate: (target: string) => void }) {
  switch (block.kind) {
    case 'heading':
      return <h3 className="aichat-block-heading">{block.text}</h3>;
    case 'note':
      return <p className="aichat-block-note">{block.text}</p>;
    case 'topic':
      return (
        <div className="aichat-block-topic">
          <div className="aichat-topic-head">
            <strong>{block.text}</strong>
            {block.meta && <span className="aichat-topic-meta">{block.meta}</span>}
          </div>
          {block.items && (
            <ul className="aichat-topic-list">
              {block.items.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          )}
        </div>
      );
    case 'actions':
      return (
        <div className="aichat-actions">
          {block.actions?.map((action) => (
            <button key={action.target} type="button" className="aichat-action" onClick={() => onNavigate(action.target)}>
              {action.label}
              <Icon name="arrowRight" size={14} />
            </button>
          ))}
        </div>
      );
    default:
      return null;
  }
}

export default AIChatView;
