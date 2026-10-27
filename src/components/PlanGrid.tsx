import type { ReactNode } from 'react';
import type { Translation } from '@/i18n';

export type PlanId = 'free' | 'pro' | 'ultra';
export type Cycle = 'monthly' | 'annual';
export type BlIconName = 'check' | 'card' | 'x';
export type PlanAction = 'upgrade' | 'downgrade' | 'manage' | 'subscribe' | 'free' | 'current';

export const BL_PLANS: PlanId[] = ['free', 'pro', 'ultra'];
export const BL_RECOMMENDED: PlanId = 'pro';
export const BL_RANK: Record<PlanId, number> = { free: 0, pro: 1, ultra: 2 };
export const BL_PRICE: Record<PlanId, Record<Cycle, number>> = {
  free: { monthly: 0, annual: 0 },
  pro: { monthly: 49, annual: 39 },
  ultra: { monthly: 149, annual: 119 },
};
export const BL_SEATS: Record<PlanId, number | null> = { free: 3, pro: 15, ultra: null };
export const BL_FEEDBACK: Record<PlanId, number | null> = { free: 1000, pro: 25000, ultra: null };

export const BL_ICONS: Record<BlIconName, ReactNode> = {
  check: <path d="M20 6 9 17l-5-5" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  card: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </>
  ),
};

export function BlIcon({ name, size = 14 }: { name: BlIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {BL_ICONS[name]}
    </svg>
  );
}

export function blMoney(locale: string, value: number) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}


export function PlanGrid({
  t,
  cycle,
  onCycleChange,
  current,
  heading,
  onAction,
}: {
  t: Translation;
  cycle: Cycle;
  onCycleChange: (cycle: Cycle) => void;
  current: PlanId | null;
  heading?: ReactNode;
  onAction: (plan: PlanId, action: PlanAction) => void;
}) {
  const b = t.billing;
  const locale = b.locale;
  return (
    <div className="bl-plans">
      <div className="bl-plans-head">
        {heading ?? <span />}
        <div className="bl-cycle" role="group" aria-label={b.cycle}>
          <button type="button" className={cycle === 'monthly' ? 'active' : ''} aria-pressed={cycle === 'monthly'} onClick={() => onCycleChange('monthly')}>
            {b.monthly}
          </button>
          <button type="button" className={cycle === 'annual' ? 'active' : ''} aria-pressed={cycle === 'annual'} onClick={() => onCycleChange('annual')}>
            {b.annual}
            <em>{b.save}</em>
          </button>
        </div>
      </div>

      <div className="bl-grid" role="list">
        {BL_PLANS.map((p) => {
          const recommended = p === BL_RECOMMENDED;
          const price = BL_PRICE[p][cycle];
          const isCurrent = current !== null && p === current;
          const higher = current !== null && BL_RANK[p] > BL_RANK[current];

          let action: PlanAction;
          let label: string;
          let btnClass: string;
          if (current === null) {
            action = p === 'free' ? 'free' : 'subscribe';
            label = p === 'free' ? b.getStartedFree : b.subscribe;
            btnClass = p === 'free' ? 'ws-btn ghost' : recommended ? 'ws-btn primary glow' : 'ws-btn outline';
          } else if (isCurrent) {
            action = p === 'free' ? 'current' : 'manage';
            label = p === 'free' ? b.currentBtn : b.manage;
            btnClass = p === 'free' ? 'ws-btn ghost' : recommended ? 'ws-btn primary glow' : 'ws-btn outline';
          } else if (higher) {
            action = 'upgrade';
            label = b.upgrade;
            btnClass = recommended ? 'ws-btn primary glow' : 'ws-btn outline';
          } else {
            action = 'downgrade';
            label = b.downgrade;
            btnClass = 'ws-btn ghost';
          }

          return (
            <article key={p} role="listitem" className={`bl-plan ${recommended ? 'recommended' : ''} ${isCurrent ? 'current' : ''}`}>
              {recommended && <span className="bl-ribbon">{b.recommended}</span>}
              <div className="bl-plan-head">
                <h3>{b.plans[p].name}</h3>
                {isCurrent && <span className="bl-current-badge">{b.currentBadge}</span>}
              </div>
              <p className="bl-tagline">{b.plans[p].tagline}</p>
              <div className="bl-price">
                <strong>{blMoney(locale, price)}</strong>
                <span>{b.perMonth}</span>
              </div>
              <small className="bl-price-note">{p === 'free' ? b.freeForever : cycle === 'annual' ? b.billedAnnually : b.billedMonthly}</small>
              <button
                type="button"
                className={`${btnClass} bl-cta`}
                disabled={action === 'current'}
                onClick={() => onAction(p, action)}
              >
                {label}
              </button>
              <ul className="bl-features">
                {b.plans[p].features.map((feature) => (
                  <li key={feature}>
                    <span className="bl-check"><BlIcon name="check" size={12} /></span>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </div>
  );
}
