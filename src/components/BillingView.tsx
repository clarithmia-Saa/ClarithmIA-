import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { Translation } from '@/i18n';
import {
  BL_FEEDBACK,
  BL_PRICE,
  BL_RANK,
  BL_RECOMMENDED,
  BL_SEATS,
  BlIcon,
  PlanGrid,
  blMoney,
  type Cycle,
  type PlanId,
} from '@/components/PlanGrid';

export type { Cycle, PlanId };
export type SubscriptionStatus = 'active' | 'canceling';
export type BillingState = { plan: PlanId; cycle: Cycle; status: SubscriptionStatus };
export type PendingPlan = { plan: PlanId; cycle: Cycle };

type ModalState = { kind: 'change'; plan: PlanId } | { kind: 'manage' } | null;

export const BILLING_DEFAULT: BillingState = { plan: 'pro', cycle: 'monthly', status: 'active' };

const BL_FEEDBACK_USED = 12842;
const BL_RENEWAL = new Date(2026, 10, 14);

function blDate(locale: string, date: Date) {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

function BlMeter({
  label,
  used,
  limit,
  locale,
  unlimitedText,
  limitText,
}: {
  label: string;
  used: number;
  limit: number | null;
  locale: string;
  unlimitedText: string;
  limitText: string;
}) {
  const nf = new Intl.NumberFormat(locale);
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  const over = limit !== null && used >= limit;
  return (
    <div className="bl-meter">
      <div className="bl-meter-head">
        <span>{label}</span>
        <strong>{limit ? `${nf.format(used)} / ${nf.format(limit)}` : `${nf.format(used)} · ${unlimitedText}`}</strong>
      </div>
      {limit ? (
        <div className="bl-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
          <i className={over ? 'over' : ''} style={{ width: `${pct}%` }} />
        </div>
      ) : (
        <div className="bl-track unlimited" aria-hidden="true"><i /></div>
      )}
      {over && <small className="bl-meter-warn">{limitText}</small>}
    </div>
  );
}

function BillingView({
  t,
  billing,
  onBillingChange,
  workspaceName,
  seatsUsed,
  checkout,
  onCheckoutHandled,
}: {
  t: Translation;
  billing: BillingState;
  onBillingChange: Dispatch<SetStateAction<BillingState>>;
  workspaceName: string;
  seatsUsed: number;
  checkout?: PendingPlan | null;
  onCheckoutHandled?: () => void;
}) {
  const b = t.billing;
  const locale = b.locale;

  const [viewCycle, setViewCycle] = useState<Cycle>(billing.cycle);
  const [modal, setModal] = useState<ModalState>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);

  const current = billing.plan;
  const isPaid = current !== 'free';
  const currentPrice = BL_PRICE[current][billing.cycle];
  const renewalDate = blDate(locale, BL_RENEWAL);
  const invoiceAmount = billing.cycle === 'annual' ? currentPrice * 12 : currentPrice;

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!checkout) return;
    setViewCycle(checkout.cycle);
    if (checkout.plan !== billing.plan) {
      setModal({ kind: 'change', plan: checkout.plan });
    } else {
      showToast(b.alreadyOnPlan.replace('{plan}', b.plans[checkout.plan].name));
    }
    onCheckoutHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!modal) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeModal();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [modal]);

  function closeModal() {
    setModal(null);
    setConfirmCancel(false);
  }

  function openChange(plan: PlanId) {
    setModal({ kind: 'change', plan });
  }

  function openManage() {
    setConfirmCancel(false);
    setModal({ kind: 'manage' });
  }

  function confirmChange(plan: PlanId) {
    onBillingChange({ plan, cycle: viewCycle, status: 'active' });
    closeModal();
    showToast(b.toastChanged.replace('{plan}', b.plans[plan].name));
  }

  function cancelSubscription() {
    onBillingChange((prev) => ({ ...prev, status: 'canceling' }));
    closeModal();
    showToast(b.toastCanceled.replace('{date}', renewalDate));
  }

  function resumeSubscription() {
    onBillingChange((prev) => ({ ...prev, status: 'active' }));
    closeModal();
    showToast(b.toastResumed);
  }

  const statusKey = !isPaid ? 'free' : billing.status;
  const statusText =
    statusKey === 'free' ? b.status.free : statusKey === 'canceling' ? b.status.canceling.replace('{date}', renewalDate) : b.status.active;

  const summaryLine = !isPaid
    ? b.noPaymentRequired
    : billing.status === 'canceling'
      ? b.endsOn.replace('{date}', renewalDate)
      : `${b.renewsOn.replace('{date}', renewalDate)} · ${blMoney(locale, currentPrice)}${b.perMonth} · ${billing.cycle === 'annual' ? b.billedAnnually : b.billedMonthly}`;

  const changePlan = modal && modal.kind === 'change' ? modal.plan : null;
  const isUpgrade = changePlan ? BL_RANK[changePlan] > BL_RANK[current] : false;
  const newSeatLimit = changePlan ? BL_SEATS[changePlan] : null;
  const seatWarning = changePlan && !isUpgrade && newSeatLimit !== null && seatsUsed > newSeatLimit;

  return (
    <div className="ws-view bl-view">
      <header className="ws-head">
        <p className="ws-kicker">{b.kicker}</p>
        <h1>{b.title}</h1>
        <p className="ws-sub">{b.subtitle}</p>
      </header>

      {/* ===== Current plan ===== */}
      <section className="ws-card bl-summary" aria-labelledby="bl-current-title">
        <div className="bl-summary-main">
          <p className="bl-label">{b.currentPlan} · {workspaceName}</p>
          <div className="bl-summary-title">
            <h2 id="bl-current-title">{b.plans[current].name}</h2>
            <span className={`bl-status ${statusKey}`}>
              <i />
              {statusText}
            </span>
          </div>
          <p className="bl-summary-sub">{summaryLine}</p>
          <div className="bl-summary-actions">
            {isPaid ? (
              <button type="button" className="ws-btn outline" onClick={openManage}>{b.manage}</button>
            ) : (
              <button type="button" className="ws-btn primary glow" onClick={() => openChange(BL_RECOMMENDED)}>{b.upgrade}</button>
            )}
          </div>
        </div>

        <div className="bl-usage">
          <h3>{b.usage}</h3>
          <BlMeter
            label={b.seats}
            used={seatsUsed}
            limit={BL_SEATS[current]}
            locale={locale}
            unlimitedText={b.unlimited}
            limitText={b.limitReached}
          />
          <BlMeter
            label={b.feedbackVolume}
            used={BL_FEEDBACK_USED}
            limit={BL_FEEDBACK[current]}
            locale={locale}
            unlimitedText={b.unlimited}
            limitText={b.limitReached}
          />
        </div>
      </section>

      {/* ===== Plans ===== */}
      <section aria-labelledby="bl-plans-title">
        <PlanGrid
          t={t}
          cycle={viewCycle}
          onCycleChange={setViewCycle}
          current={current}
          heading={
            <div>
              <h2 id="bl-plans-title">{b.comparePlans}</h2>
              <p>{b.pricesNote}</p>
            </div>
          }
          onAction={(plan, action) => {
            if (action === 'manage') openManage();
            else if (action !== 'current') openChange(plan);
          }}
        />
      </section>

      {/* ===== Change plan modal ===== */}
      {changePlan && (
        <div
          className="ws-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="ws-modal" role="dialog" aria-modal="true" aria-labelledby="bl-change-title">
            <div className="ws-modal-head">
              <div>
                <h2 id="bl-change-title">
                  {(isUpgrade ? b.confirmUpgradeTitle : b.confirmDowngradeTitle).replace('{plan}', b.plans[changePlan].name)}
                </h2>
                <p>{isUpgrade ? b.confirmUpgradeDesc : b.confirmDowngradeDesc}</p>
              </div>
              <button type="button" className="ws-icon-btn" aria-label={b.close} onClick={closeModal}>
                <BlIcon name="x" size={18} />
              </button>
            </div>

            <dl className="bl-rows">
              <div><dt>{b.rowNewPlan}</dt><dd>{b.plans[changePlan].name}</dd></div>
              <div><dt>{b.cycle}</dt><dd>{viewCycle === 'annual' ? b.annual : b.monthly}</dd></div>
              <div>
                <dt>{b.rowPrice}</dt>
                <dd>{blMoney(locale, BL_PRICE[changePlan][viewCycle])}{b.perMonth}</dd>
              </div>
              <div><dt>{b.rowEffective}</dt><dd>{b.immediately}</dd></div>
            </dl>

            {seatWarning && newSeatLimit !== null && (
              <p className="bl-warning">
                {b.seatWarning.replace('{count}', String(seatsUsed)).replace('{limit}', String(newSeatLimit)).replace('{plan}', b.plans[changePlan].name)}
              </p>
            )}

            <div className="ws-modal-actions">
              <button type="button" className="ws-btn ghost" onClick={closeModal}>{b.cancel}</button>
              <button type="button" className="ws-btn primary" onClick={() => confirmChange(changePlan)}>{b.confirm}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Manage subscription modal ===== */}
      {modal && modal.kind === 'manage' && (
        <div
          className="ws-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal();
          }}
        >
          <div className="ws-modal" role="dialog" aria-modal="true" aria-labelledby="bl-manage-title">
            <div className="ws-modal-head">
              <div>
                <h2 id="bl-manage-title">{b.manageTitle}</h2>
                <p>{b.manageDesc}</p>
              </div>
              <button type="button" className="ws-icon-btn" aria-label={b.close} onClick={closeModal}>
                <BlIcon name="x" size={18} />
              </button>
            </div>

            <dl className="bl-rows">
              <div>
                <dt>{b.rowPlan}</dt>
                <dd>{b.plans[current].name} · {billing.cycle === 'annual' ? b.annual : b.monthly}</dd>
              </div>
              <div>
                <dt>{b.rowStatus}</dt>
                <dd><span className={`bl-status ${statusKey}`}><i />{statusText}</span></dd>
              </div>
              <div>
                <dt>{billing.status === 'canceling' ? b.rowAccessEnds : b.rowNextInvoice}</dt>
                <dd>
                  {billing.status === 'canceling' ? renewalDate : `${renewalDate} · ${blMoney(locale, invoiceAmount)}`}
                </dd>
              </div>
              <div>
                <dt>{b.rowPayment}</dt>
                <dd className="bl-payment">
                  <span><BlIcon name="card" size={16} /> Visa •••• 4242</span>
                  <button type="button" className="bl-link" onClick={() => showToast(b.toastPayment)}>{b.updatePayment}</button>
                </dd>
              </div>
            </dl>

            {confirmCancel ? (
              <div className="bl-cancel-box">
                <p>{b.cancelConfirmText.replace('{date}', renewalDate)}</p>
                <div className="ws-modal-actions">
                  <button type="button" className="ws-btn ghost" onClick={() => setConfirmCancel(false)}>{b.keepPlan}</button>
                  <button type="button" className="ws-btn danger" onClick={cancelSubscription}>{b.cancelConfirm}</button>
                </div>
              </div>
            ) : (
              <div className="ws-modal-actions">
                {billing.status === 'canceling' ? (
                  <button type="button" className="ws-btn primary" onClick={resumeSubscription}>{b.resume}</button>
                ) : (
                  <button type="button" className="ws-btn danger-ghost" onClick={() => setConfirmCancel(true)}>{b.cancelSub}</button>
                )}
                <button type="button" className="ws-btn ghost" onClick={closeModal}>{b.close}</button>
              </div>
            )}
          </div>
        </div>
      )}

      {toast && (
        <div className="ws-toast" role="status" aria-live="polite">
          <BlIcon name="check" size={15} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}

export default BillingView;
