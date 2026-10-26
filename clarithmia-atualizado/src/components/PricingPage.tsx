import { useState } from 'react';
import type { Language, Translation } from '@/i18n';
import { AuIcon } from '@/components/AuthShell';
import { PlanGrid, type Cycle, type PlanId } from '@/components/PlanGrid';

function PricingPage({
  t,
  language,
  onLanguageChange,
  onBack,
  onSignIn,
  onSubscribe,
  onStartFree,
}: {
  t: Translation;
  language: Language;
  onLanguageChange: (language: Language) => void;
  onBack: () => void;
  onSignIn: () => void;
  onSubscribe: (plan: PlanId, cycle: Cycle) => void;
  onStartFree: () => void;
}) {
  const b = t.billing;
  const [cycle, setCycle] = useState<Cycle>('monthly');
  return (
    <div className="au-shell pp-shell">
      <header className="au-top pp-top">
        <button type="button" className="au-back" onClick={onBack}>
          <AuIcon name="arrowLeft" size={16} />
          {t.auth.backToSite}
        </button>
        <div className="pp-top-right">
          <div className="ob-lang" role="group" aria-label="Language">
            {(['en', 'pt'] as Language[]).map((l) => (
              <button
                key={l}
                type="button"
                className={language === l ? 'active' : ''}
                aria-pressed={language === l}
                onClick={() => onLanguageChange(l)}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
          <button type="button" className="ob-skip" onClick={onSignIn}>{t.actions.signIn}</button>
        </div>
      </header>

      <main className="pp-main bl-view">
        <span className="ob-brand au-brand"><i />ClarithmIA</span>
        <header className="ws-head pp-head">
          <p className="ws-kicker">{b.publicKicker}</p>
          <h1>{b.publicTitle}</h1>
          <p className="ws-sub">{b.publicSubtitle}</p>
        </header>
        <PlanGrid
          t={t}
          cycle={cycle}
          onCycleChange={setCycle}
          current={null}
          heading={<p className="pp-note">{b.pricesNote}</p>}
          onAction={(plan, action) => {
            if (action === 'free') onStartFree();
            else if (action === 'subscribe') onSubscribe(plan, cycle);
          }}
        />
      </main>
    </div>
  );
}

export default PricingPage;
