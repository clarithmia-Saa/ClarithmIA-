import { useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Bell,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Cloud,
  Database,
  FileText,
  Globe2,
  Inbox,
  LayoutDashboard,
  Lightbulb,
  LifeBuoy,
  LogOut,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { getTranslation, type Language, type Translation } from '@/i18n';
import InboxView from '@/components/InboxView';
import SourcesView from '@/components/SourcesView';
import ReportsView from '@/components/ReportsView';
import AIChatView from '@/components/AIChatView';
import ErrorBoundary from '@/components/ErrorBoundary';
import WorkspaceView, { WS_DEFAULTS, WS_MEMBERS, type Member, type WorkspaceSettings } from '@/components/WorkspaceView';
import type { FeedbackActionState } from '@/components/FeedbackDetailModal';
import { MenuDrawer, MobileNav } from '@/components/AppNav';
import SignIn from '@/components/SignIn';
import SignUp, { type SignUpResult } from '@/components/SignUp';
import OnboardingWizard, { type OnboardingResult } from '@/components/OnboardingWizard';
import BillingView, { BILLING_DEFAULT, type BillingState, type PendingPlan } from '@/components/BillingView';
import PricingPage from '@/components/PricingPage';
import { PlanGrid, type Cycle, type PlanId } from '@/components/PlanGrid';
import { supabase, isSupabaseConfigured, type Session } from '@/lib/supabase';

function userInitials(name?: string, email?: string): string {
  const text = (name && name.trim()) || email || 'User';
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand ${compact ? 'brand-compact' : ''}`} aria-label="ClarithmIA">
      <img className="brand-logo" src={compact ? '/clarithmia-c.svg' : '/1792066275005.png'} alt="ClarithmIA" />
    </div>
  );
}

function LanguageSwitcher({ language, onChange }: { language: Language; onChange: (language: Language) => void }) {
  return (
    <label className="language-switcher">
      <Globe2 size={14} aria-hidden="true" />
      <select aria-label="Language" value={language} onChange={(event) => onChange(event.target.value as Language)}>
        <option value="en">EN</option>
        <option value="pt">PT</option>
      </select>
      <ChevronDown size={12} aria-hidden="true" />
    </label>
  );
}

function LandingPage({
  onEnter,
  onSignIn,
  onPricing,
  onSubscribe,
  language,
  onLanguageChange,
  t,
}: {
  onEnter: () => void;
  onSignIn: () => void;
  onPricing: () => void;
  onSubscribe: (plan: PlanId, cycle: Cycle) => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  t: Translation;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [planCycle, setPlanCycle] = useState<Cycle>('monthly');
  const navItems: { label: string; href: string; action?: () => void }[] = [
    { label: t.nav.features, href: '#recursos' },
    { label: t.nav.method, href: '#como-funciona' },
    { label: t.nav.pricing, href: '#preços', action: onPricing },
    { label: t.nav.contact, href: '#contato' },
  ];
  return (
    <div className="landing">
      <header className="site-header">
        <a className="brand-link" href="#top">
          <Brand />
        </a>
        <nav className={`site-nav ${menuOpen ? 'open' : ''}`}>
          {navItems.map((item) => (
            <a
              href={item.href}
              key={item.href}
              onClick={(e) => {
                if (item.action) {
                  e.preventDefault();
                  item.action();
                }
                setMenuOpen(false);
              }}
            >
              {item.label}
            </a>
          ))}
          <div className="mobile-actions">
            <LanguageSwitcher language={language} onChange={onLanguageChange} />
            <button className="text-button" onClick={onSignIn}>
              {t.actions.signIn}
            </button>
            <button className="button button-primary" onClick={onEnter}>
              {t.actions.startNow} <ArrowRight size={16} />
            </button>
          </div>
        </nav>
        <div className="header-actions">
          <LanguageSwitcher language={language} onChange={onLanguageChange} />
          <button className="text-button" onClick={onSignIn}>
            {t.actions.signIn}
          </button>
          <button className="button button-primary small" onClick={onEnter}>
            {t.actions.startNow} <ArrowRight size={15} />
          </button>
        </div>
        <button
          className="menu-toggle"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        >
          {menuOpen ? <X /> : <Menu />}
        </button>
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-glow glow-one" />
          <div className="hero-glow glow-two" />
          <div className="hero-content">
            <div className="eyebrow">
              <span className="pulse-dot" /> {t.landing.eyebrow}
            </div>
            <h1>
              {t.landing.heroTitle}
              <br />
              <em>{t.landing.heroTitleAccent}</em>
            </h1>
            <p className="hero-subtitle">
              {t.landing.heroSubtitle}
              <strong>{t.landing.heroSubtitleStrong}</strong>
            </p>
            <div className="hero-actions">
              <button className="button button-primary hero-button" onClick={onEnter}>
                {t.actions.explorePlatform} <ArrowRight size={17} />
              </button>
              <a className="play-link" href="#como-funciona">
                <span className="play-icon">▶</span> {t.actions.seeHow}
              </a>
            </div>
            <div className="trusted">
              <span>{t.landing.trusted}</span>
              <div className="trust-logos">
                {t.landing.trustProducts.map((product) => (
                  <span key={product}>{product}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="hero-visual" aria-hidden="true">
            <div className="orbit orbit-a" />
            <div className="orbit orbit-b" />
            <div className="signal-card signal-main">
              <div className="signal-header">
                <span className="live-dot" /> {t.landing.signalLive} <span>•••</span>
              </div>
              <div className="signal-wave">
                {Array.from({ length: 12 }, (_, index) => (
                  <span key={index} />
                ))}
              </div>
              <div className="signal-foot">
                <span>
                  +24.8% <small>{t.landing.positiveSentiment}</small>
                </span>
                <span className="signal-period">{t.landing.lastSevenDays}</span>
              </div>
            </div>
            <div className="floating-card card-sentiment">
              <span className="mini-icon cyan">
                <SmileIcon />
              </span>
              <div>
                <small>{t.landing.overallSentiment}</small>
                <strong>
                  84.6 <i>+6.2%</i>
                </strong>
              </div>
            </div>
            <div className="floating-card card-mention">
              <div className="avatar-stack">
                <span>AM</span>
                <span>RS</span>
                <span>JL</span>
              </div>
              <div>
                <strong>1,248</strong>
                <small>{t.landing.newFeedback}</small>
              </div>
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="scroll-cue">
            <span>{t.landing.scrollExplore}</span>
            <div />
          </div>
        </section>

        <section className="logo-strip">
          <span>{t.landing.logoStrip}</span>
          {t.landing.trustProducts.map((product) => (
            <strong key={product}>{product}</strong>
          ))}
        </section>
        <section className="section features-section" id="recursos">
          <div className="section-heading">
            <div>
              <span className="kicker">{t.landing.systemKicker}</span>
              <h2>
                {t.landing.systemTitle}
                <br />
                <em>{t.landing.systemTitleAccent}</em>
              </h2>
            </div>
            <p>{t.landing.systemDescription}</p>
          </div>
          <div className="feature-grid">
            {t.landing.featureLabels.map((label, index) => {
              const icons = [Inbox, BrainCircuit, TrendingUp];
              const IconComponent = icons[index];
              return (
                <article className={`feature-card feature-${['cyan', 'white', 'blue'][index]}`} key={label}>
                  <div className="feature-top">
                    <span className="feature-number">0{index + 1}</span>
                    <IconComponent size={22} strokeWidth={1.5} />
                  </div>
                  <h3>{label}</h3>
                  <p>{t.landing.featureTexts[index]}</p>
                  <a href="#dashboard">
                    {t.actions.explore} <ArrowUpRightIcon />
                  </a>
                </article>
              );
            })}
          </div>
        </section>
        <section className="section method-section" id="como-funciona">
          <div className="method-copy">
            <span className="kicker">{t.landing.methodKicker}</span>
            <h2>
              {t.landing.methodTitle}
              <br />
              <em>{t.landing.methodTitleAccent}</em>
            </h2>
            <p>{t.landing.methodDescription}</p>
            <button className="inline-link" onClick={onEnter}>
              {t.actions.meetWorkspace} <ArrowRight size={16} />
            </button>
          </div>
          <div className="method-visual">
            <div className="radar-grid">
              <div className="radar-ring ring-1" />
              <div className="radar-ring ring-2" />
              <div className="radar-ring ring-3" />
              <div className="radar-line line-1" />
              <div className="radar-line line-2" />
              <div className="radar-shape" />
              {t.landing.radarLabels.map((label, index) => (
                <span className={`radar-label label-${['top', 'right', 'bottom', 'left'][index]}`} key={label}>
                  {label}
                </span>
              ))}
            </div>
          </div>
        </section>
        <section className="landing-plans" id="plans">
          <div className="landing-plans-head">
            <span className="kicker">{t.billing.publicKicker}</span>
            <h2>{t.billing.publicTitle}</h2>
            <p>{t.billing.publicSubtitle}</p>
          </div>
          <PlanGrid
            t={t}
            cycle={planCycle}
            onCycleChange={setPlanCycle}
            current={null}
            onAction={(plan, action) => {
              if (action === 'free') onEnter();
              else if (action === 'subscribe') onSubscribe(plan, planCycle);
            }}
          />
        </section>
        <section className="cta-section" id="preços">
          <div className="cta-line" />
          <span className="kicker">{t.landing.ctaKicker}</span>
          <h2>
            {t.landing.ctaTitle}
            <br />
            <em>{t.landing.ctaTitleAccent}</em>
          </h2>
          <button className="button button-primary" onClick={onEnter}>
            {t.actions.startFree} <ArrowRight size={17} />
          </button>
        </section>
      </main>

      <footer className="site-footer" id="contato">
        <div className="footer-top">
          <Brand />
          <p>
            {t.landing.footerDescription.split('\n').map((line) => (
              <span key={line}>
                {line}
                <br />
              </span>
            ))}
          </p>
          <div className="footer-links">
            <div>
              <span>{t.landing.footerGroups.product}</span>
              <a href="#recursos">{t.landing.footerLinks[0]}</a>
              <a href="#como-funciona">{t.landing.footerLinks[1]}</a>
              <a
                href="#preços"
                onClick={(e) => {
                  e.preventDefault();
                  onPricing();
                }}
              >
                {t.landing.footerLinks[2]}
              </a>
            </div>
            <div>
              <span>{t.landing.footerGroups.company}</span>
              <a href="#contato">{t.landing.footerLinks[3]}</a>
              <a href="#contato">{t.landing.footerLinks[4]}</a>
              <a href="#contato">{t.landing.footerLinks[5]}</a>
            </div>
            <div>
              <span>{t.landing.footerGroups.connect}</span>
              <a href="#contato">
                <XBrandIcon /> X
              </a>
              <a href="#contato">
                <Globe2 size={14} /> LinkedIn
              </a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>{t.landing.rights}</span>
          <LanguageSwitcher language={language} onChange={onLanguageChange} />
          <span>{t.landing.footerMade}</span>
        </div>
      </footer>
    </div>
  );
}

function BillingNavIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}

function Sidebar({
  collapsed,
  setCollapsed,
  active,
  setActive,
  t,
  workspaceName,
  account,
  onSignOut,
}: {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  active: string;
  setActive: (value: string) => void;
  t: Translation;
  workspaceName: string;
  account?: SignUpResult | null;
  onSignOut?: () => void;
}) {
  const items = [
    { id: 'insights', label: t.dashboard.aiInsights, icon: Sparkles },
    { id: 'inbox', label: t.inbox.title, icon: Inbox },
    { id: 'main', label: t.dashboard.mainDashboard, icon: LayoutDashboard },
    { id: 'sources', label: t.dashboard.dataSources, icon: Database },
    { id: 'reports', label: t.dashboard.reports, icon: FileText },
    { id: 'billing', label: t.billing.title, icon: BillingNavIcon },
  ];

  const initials = userInitials(account?.name, account?.email);
  const displayName = account?.name || 'User';
  const displayEmail = account?.email || t.dashboard.admin;

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-brand">
        <Brand compact={!collapsed} />
        <button onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
      <div className="workspace-switch">
        <div className="workspace-logo">{(workspaceName.trim().charAt(0) || 'N').toUpperCase()}</div>
        {!collapsed && (
          <>
            <div>
              <strong>{workspaceName.trim() || t.dashboard.workspaceName}</strong>
              <small>{t.dashboard.workspaceType}</small>
            </div>
            <ChevronDown size={15} />
          </>
        )}
      </div>
      <nav className="dash-nav">
        <span className="nav-label">{t.dashboard.workspace}</span>
        {items.map(({ id, label, icon: IconComponent }) => (
          <button className={active === id ? 'active' : ''} onClick={() => setActive(id)} key={id}>
            <IconComponent size={18} />
            {!collapsed && <span>{label}</span>}
            {!collapsed && id === 'insights' && <i className="nav-badge">3</i>}
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <button onClick={() => setActive('settings')}>
          <Settings size={18} />
          {!collapsed && <span>{t.dashboard.settings}</span>}
        </button>
        <button>
          <CircleHelp size={18} />
          {!collapsed && <span>{t.dashboard.help}</span>}
        </button>
        <div className="user-profile">
          <div className="user-avatar">{initials}</div>
          {!collapsed && (
            <div className="overflow-hidden">
              <strong className="truncate block max-w-[120px]">{displayName}</strong>
              <small className="truncate block max-w-[120px]">{displayEmail}</small>
            </div>
          )}
          {!collapsed && onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              title={t.auth.signOut}
              aria-label={t.auth.signOut}
              className="ml-auto p-1.5 rounded text-neutral-400 hover:text-rose-400 hover:bg-neutral-900 transition-colors"
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

function SentimentChart({ t }: { t: Translation }) {
  return (
    <div className="chart-wrap">
      <div className="chart-y">
        <span>100%</span>
        <span>75%</span>
        <span>50%</span>
        <span>25%</span>
        <span>0%</span>
      </div>
      <svg className="chart" viewBox="0 0 700 220" preserveAspectRatio="none">
        <defs>
          <linearGradient id="positiveFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#8ce3d0" stopOpacity=".24" />
            <stop offset="1" stopColor="#8ce3d0" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="negativeFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#ef8585" stopOpacity=".16" />
            <stop offset="1" stopColor="#ef8585" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0,123 C45,112 60,135 100,108 S160,96 200,112 S260,74 300,89 S360,64 400,80 S460,50 500,66 S560,42 600,48 S665,27 700,34 L700,220 L0,220Z"
          fill="url(#positiveFill)"
        />
        <path
          d="M0,173 C50,165 67,178 100,160 S160,174 200,154 S260,171 300,157 S360,168 400,140 S460,159 500,136 S560,150 600,128 S665,143 700,121 L700,220 L0,220Z"
          fill="url(#negativeFill)"
        />
        <path
          className="line-positive"
          d="M0,123 C45,112 60,135 100,108 S160,96 200,112 S260,74 300,89 S360,64 400,80 S460,50 500,66 S560,42 600,48 S665,27 700,34"
        />
        <path
          className="line-neutral"
          d="M0,145 C50,140 67,145 100,138 S160,130 200,142 S260,119 300,132 S360,112 400,123 S460,106 500,119 S560,95 600,106 S665,82 700,90"
        />
        <path
          className="line-negative"
          d="M0,173 C50,165 67,178 100,160 S160,174 200,154 S260,171 300,157 S360,168 400,140 S460,159 500,136 S560,150 600,128 S665,143 700,121"
        />
        <circle cx="600" cy="48" r="4" className="point-positive" />
        <circle cx="600" cy="106" r="4" className="point-neutral" />
        <circle cx="600" cy="128" r="4" className="point-negative" />
      </svg>
      <div className="chart-x">
        {t.dashboard.allDays.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
    </div>
  );
}

function Dashboard({
  onExit,
  initialWorkspace,
  initialTab,
  initialBilling,
  checkout,
  onCheckoutHandled,
  language,
  onLanguageChange,
  t,
  account,
  onSignOut,
}: {
  onExit: () => void;
  initialWorkspace?: WorkspaceSettings;
  initialTab?: string;
  initialBilling?: BillingState;
  checkout?: PendingPlan | null;
  onCheckoutHandled?: () => void;
  language: Language;
  onLanguageChange: (language: Language) => void;
  t: Translation;
  account?: SignUpResult | null;
  onSignOut: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState(initialTab ?? 'insights');
  const [menuOpen, setMenuOpen] = useState(false);
  const [range, setRange] = useState('7d');
  const [workspace, setWorkspace] = useState<WorkspaceSettings>(initialWorkspace ?? WS_DEFAULTS);
  const [members, setMembers] = useState<Member[]>(WS_MEMBERS);
  const [billing, setBilling] = useState<BillingState>(initialBilling ?? BILLING_DEFAULT);
  const [feedbackActions, setFeedbackActions] = useState<Record<number, FeedbackActionState>>({});
  const activeLabels: Record<string, string> = {
    main: t.dashboard.mainDashboard,
    inbox: t.inbox.title,
    sources: t.dashboard.dataSources,
    insights: t.dashboard.aiInsights,
    reports: t.dashboard.reports,
    settings: t.dashboard.settings,
    billing: t.billing.title,
  };
  const rangeOptions = [
    { id: '7d', label: t.dashboard.allRanges[0] },
    { id: '30d', label: t.dashboard.allRanges[1] },
    { id: 'quarter', label: t.dashboard.allRanges[2] },
  ];
  const insightColors = ['red', 'cyan', 'green'];
  const sourceColors = ['blue', 'sky', 'gold', 'green'];

  const initials = userInitials(account?.name, account?.email);

  return (
    <div className="dashboard-shell">
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        active={active}
        setActive={setActive}
        t={t}
        workspaceName={workspace.name}
        account={account}
        onSignOut={onSignOut}
      />
      <MobileNav
        t={t}
        active={active}
        menuOpen={menuOpen}
        onSelect={setActive}
        onOpenMenu={() => setMenuOpen(true)}
      />
      {menuOpen && (
        <MenuDrawer
          t={t}
          active={active}
          workspaceName={workspace.name}
          onSelect={(id) => {
            setActive(id);
            setMenuOpen(false);
          }}
          onClose={() => setMenuOpen(false)}
          onExit={() => {
            setMenuOpen(false);
            onExit();
          }}
        />
      )}
      <main className="dashboard-main">
        <header className="dashboard-header">
          <div className="dash-breadcrumb">
            <span>{t.dashboard.workspace}</span>
            <ChevronRight size={14} />
            <strong>{activeLabels[active]}</strong>
          </div>
          <div className="dash-header-actions">
            <LanguageSwitcher language={language} onChange={onLanguageChange} />
            <button className="search-button">
              <Search size={17} />
              <span>{t.dashboard.search}</span>
              <kbd>⌘ K</kbd>
            </button>
            <button className="icon-button">
              <Bell size={18} />
              <i />
            </button>
            <button className="top-avatar" onClick={() => setActive('settings')} aria-label={t.dashboard.settings}>
              {initials}
            </button>
          </div>
        </header>
        {active === 'inbox' ? (
          <div className="dashboard-content">
            <ErrorBoundary key="InboxView" label={activeLabels[active]}>
              <InboxView t={t} actions={feedbackActions} onActionsChange={setFeedbackActions} />
            </ErrorBoundary>
          </div>
        ) : active === 'sources' ? (
          <div className="dashboard-content">
            <ErrorBoundary key="SourcesView" label={activeLabels[active]}>
              <SourcesView t={t} />
            </ErrorBoundary>
          </div>
        ) : active === 'reports' ? (
          <div className="dashboard-content">
            <ErrorBoundary key="ReportsView" label={activeLabels[active]}>
              <ReportsView t={t} />
            </ErrorBoundary>
          </div>
        ) : active === 'insights' ? (
          <div className="dashboard-content">
            <ErrorBoundary key="AIChatView" label={activeLabels[active]}>
              <AIChatView t={t} onNavigate={setActive} />
            </ErrorBoundary>
          </div>
        ) : active === 'settings' ? (
          <div className="dashboard-content">
            <ErrorBoundary key="WorkspaceView" label={activeLabels[active]}>
              <WorkspaceView
                t={t}
                settings={workspace}
                onSettingsSave={setWorkspace}
                members={members}
                onMembersChange={setMembers}
              />
            </ErrorBoundary>
          </div>
        ) : active === 'billing' ? (
          <div className="dashboard-content">
            <ErrorBoundary key="BillingView" label={activeLabels[active]}>
              <BillingView
                t={t}
                billing={billing}
                onBillingChange={setBilling}
                workspaceName={workspace.name}
                seatsUsed={members.length}
                checkout={checkout}
                onCheckoutHandled={onCheckoutHandled}
              />
            </ErrorBoundary>
          </div>
        ) : (
          <div className="dashboard-content">
            <div className="welcome-row">
              <div>
                <p className="date-label">{t.dashboard.date}</p>
                <h1>
                  {t.dashboard.greeting} <span>✦</span>
                </h1>
                <p className="muted">{t.dashboard.welcome}</p>
              </div>
              <button className="button button-dark">
                <Plus size={17} /> {t.actions.connectSource}
              </button>
            </div>
            <div className="metric-grid">
              <MetricCard
                label={t.dashboard.processedFeedback}
                value="12,842"
                change="+18.4%"
                icon={MessageSquare}
                tone="cyan"
                note={t.dashboard.previousPeriod}
              />
              <MetricCard
                label={t.dashboard.satisfaction}
                value="84.6"
                suffix="/100"
                change="+6.2%"
                icon={Star}
                tone="gold"
                note={t.dashboard.lastSevenDaysAverage}
              />
              <MetricCard
                label={t.dashboard.criticalAlerts}
                value="07"
                change="-12.5%"
                icon={ShieldCheck}
                tone="red"
                note={t.dashboard.requireAttention}
              />
            </div>
            <div className="dashboard-grid">
              <section className="panel sentiment-panel">
                <div className="panel-header">
                  <div>
                    <span className="panel-kicker">{t.dashboard.overview}</span>
                    <h2>{t.dashboard.sentimentAnalysis}</h2>
                  </div>
                  <div className="panel-controls">
                    <div className="legend">
                      <span>
                        <i className="legend-dot positive" /> {t.dashboard.positive}
                      </span>
                      <span>
                        <i className="legend-dot neutral" /> {t.dashboard.neutral}
                      </span>
                      <span>
                        <i className="legend-dot negative" /> {t.dashboard.negative}
                      </span>
                    </div>
                    <select value={range} onChange={(event) => setRange(event.target.value)}>
                      {rangeOptions.map((option) => (
                        <option value={option.id} key={option.id}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="chart-summary">
                  <div>
                    <strong>84.6%</strong>
                    <span>
                      <TrendingUp size={14} /> 6.2% {t.dashboard.previousPeriod}
                    </span>
                  </div>
                  <div className="summary-caption">{t.dashboard.sentimentDistribution}</div>
                </div>
                <SentimentChart t={t} />
              </section>
              <section className="panel sources-panel">
                <div className="panel-header">
                  <div>
                    <span className="panel-kicker">{t.dashboard.connectivity}</span>
                    <h2>{t.dashboard.activeSources}</h2>
                  </div>
                  <button className="more-button">
                    <MoreHorizontal size={18} />
                  </button>
                </div>
                <div className="source-total">
                  <strong>08</strong>
                  <span>{t.dashboard.connectedSources}</span>
                  <div className="source-health">
                    <span /> {t.dashboard.operational}
                  </div>
                </div>
                <div className="sources-list">
                  {t.dashboard.sourceNames.map((name, index) => (
                    <SourceRow
                      key={name}
                      icon={([Cloud, Star, Tag, LifeBuoy][index] ?? Cloud) as typeof Cloud}
                      label={name}
                      count={['4,823', '2,194', '3,605', '2,220'][index]}
                      color={sourceColors[index]}
                    />
                  ))}
                </div>
                <button className="see-all">
                  {t.actions.seeAllSources} <ArrowRight size={15} />
                </button>
              </section>
            </div>
            <section className="panel insights-panel">
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">
                    <Sparkles size={13} /> {t.dashboard.artificialIntelligence}
                  </span>
                  <h2>{t.dashboard.actionableInsights}</h2>
                </div>
                <button className="see-all">
                  {t.actions.seeAll} <ArrowRight size={15} />
                </button>
              </div>
              <div className="insights-list">
                {t.dashboard.insightTitles.map((title, index) => (
                  <article className="insight-row" key={title}>
                    <div className={`insight-icon ${insightColors[index]}`}>
                      {insightColors[index] === 'red' ? (
                        <Zap size={18} />
                      ) : insightColors[index] === 'green' ? (
                        <Check size={18} />
                      ) : (
                        <Lightbulb size={18} />
                      )}
                    </div>
                    <div className="insight-copy">
                      <div>
                        <span className={`priority ${insightColors[index]}`}>{t.dashboard.insightTypes[index]}</span>
                        <span className="insight-time">{t.dashboard.hoursAgo}</span>
                      </div>
                      <h3>{title}</h3>
                      <p>{t.dashboard.insightTexts[index]}</p>
                    </div>
                    <div className="insight-side">
                      <span className="insight-trend">{['+18%', '+9%', '+14 pts'][index]}</span>
                      <span className="insight-tag">{t.dashboard.insightTags[index]}</span>
                      <button>
                        <ArrowRight size={16} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
      <button className="exit-demo" onClick={onExit}>
        <ChevronLeft size={15} /> {t.actions.backToSite}
      </button>
    </div>
  );
}

function MetricCard({
  label,
  value,
  suffix,
  change,
  icon: IconComponent,
  tone,
  note,
}: {
  label: string;
  value: string;
  suffix?: string;
  change: string;
  icon: typeof Activity;
  tone: string;
  note: string;
}) {
  return (
    <article className="metric-card">
      <div className={`metric-icon ${tone}`}>
        <IconComponent size={19} />
      </div>
      <div className="metric-content">
        <span>{label}</span>
        <div>
          <strong>{value}</strong>
          {suffix && <small>{suffix}</small>}
          <i className={tone === 'red' ? 'down' : ''}>{change}</i>
        </div>
        <small className="metric-note">{note}</small>
      </div>
      <div className="metric-spark">
        {Array.from({ length: 7 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
    </article>
  );
}

function SourceRow({
  icon: IconComponent,
  label,
  count,
  color,
}: {
  icon: (props: { size?: number }) => React.ReactNode;
  label: string;
  count: string;
  color: string;
}) {
  return (
    <div className="source-row">
      <span className={`source-icon ${color}`}>
        <IconComponent size={15} />
      </span>
      <span>{label}</span>
      <strong>{count}</strong>
      <span className="source-status" />
    </div>
  );
}

function SmileIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" />
    </svg>
  );
}

function ArrowUpRightIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 13 13 3M6 3h7v7" />
    </svg>
  );
}

function XBrandIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.5 3h3l-7.1 8.1L21.7 21h-6l-4.7-6.1L5.6 21H2.5l7.6-8.7L2.3 3h6.1l4.3 5.6L17.5 3zm-1 16h1.7L7.5 4.7H5.7L16.5 19z" />
    </svg>
  );
}

function companyFromEmail(email: string) {
  const domain = email.split('@')[1] ?? '';
  const label = domain.split('.')[0] ?? '';
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : '';
}

function App() {
  const [view, setView] = useState<'landing' | 'pricing' | 'signin' | 'signup' | 'onboarding' | 'dashboard'>('landing');
  const [language, setLanguage] = useState<Language>('en');
  const [, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<SignUpResult | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [initialWorkspace, setInitialWorkspace] = useState<WorkspaceSettings | undefined>(undefined);
  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null);
  const [dashboardTab, setDashboardTab] = useState('insights');
  const [initialBilling, setInitialBilling] = useState<BillingState | undefined>(undefined);
  const t = getTranslation(language);

  // Restore session from Supabase on mount and listen to auth changes
  useEffect(() => {
    let mounted = true;

    if (!isSupabaseConfigured()) {
      setAuthLoading(false);
      return;
    }

    supabase.auth
      .getSession()
      .then(({ data: { session: initialSession } }) => {
        if (!mounted) return;
        if (initialSession?.user) {
          setSession(initialSession);
          const fullName =
            (initialSession.user.user_metadata?.full_name as string | undefined) ||
            (initialSession.user.user_metadata?.name as string | undefined) ||
            initialSession.user.email?.split('@')[0] ||
            'User';
          setAccount({ name: fullName, email: initialSession.user.email ?? '' });
          setOnboardingDone(true);
          setView((prev) => (prev === 'landing' || prev === 'signin' || prev === 'signup' ? 'dashboard' : prev));
        }
        setAuthLoading(false);
      })
      .catch((err) => {
        console.error('[ClarithmIA Auth getSession Error]', err);
        if (mounted) setAuthLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!mounted) return;
      if (newSession?.user) {
        setSession(newSession);
        const fullName =
          (newSession.user.user_metadata?.full_name as string | undefined) ||
          (newSession.user.user_metadata?.name as string | undefined) ||
          newSession.user.email?.split('@')[0] ||
          'User';
        setAccount({ name: fullName, email: newSession.user.email ?? '' });
        if (event === 'SIGNED_IN') {
          setOnboardingDone(true);
          setView('dashboard');
        }
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setAccount(null);
        setOnboardingDone(false);
        setView('landing');
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  function openDashboard(tab: string) {
    setDashboardTab(tab);
    setView('dashboard');
  }

  function enterFromLanding() {
    setPendingPlan(null);
    if (!account) return setView('signup');
    if (!onboardingDone) return setView('onboarding');
    openDashboard('insights');
  }

  function signInFromLanding() {
    setPendingPlan(null);
    if (account) return openDashboard('insights');
    setView('signin');
  }

  function openPricing() {
    if (account) {
      setPendingPlan(null);
      return openDashboard('billing');
    }
    setView('pricing');
  }

  function subscribeToPlan(plan: PlanId, cycle: Cycle) {
    setPendingPlan({ plan, cycle });
    if (account) return openDashboard('billing');
    setView('signup');
  }

  function leaveAuth() {
    setPendingPlan(null);
    setView('landing');
  }

  function completeSignUp(result: SignUpResult) {
    setAccount(result);
    if (pendingPlan) {
      setInitialBilling({ plan: 'free', cycle: 'monthly', status: 'active' });
      setOnboardingDone(true);
      return openDashboard('billing');
    }
    setView('onboarding');
  }

  function completeSignIn(email: string) {
    setAccount((prev) => prev ?? { name: email.split('@')[0] ?? email, email });
    setOnboardingDone(true);
    openDashboard(pendingPlan ? 'billing' : 'insights');
  }

  function completeOnboarding(result: OnboardingResult) {
    setInitialWorkspace({
      ...WS_DEFAULTS,
      name: result.name,
      slug: result.slug,
      alerts: result.alerts,
      digest: result.digest,
      autoTag: result.autoTag,
    });
    setOnboardingDone(true);
    openDashboard('insights');
  }

  function skipOnboarding() {
    setOnboardingDone(true);
    openDashboard('insights');
  }

  async function handleSignOut() {
    try {
      if (isSupabaseConfigured()) {
        await supabase.auth.signOut();
      }
    } catch (err) {
      console.error('[ClarithmIA SignOut Error]', err);
    } finally {
      setSession(null);
      setAccount(null);
      setOnboardingDone(false);
      setPendingPlan(null);
      setView('landing');
    }
  }

  const noticePlan = pendingPlan ? t.billing.plans[pendingPlan.plan].name : null;

  // Initial loading state while restoring Supabase session
  if (authLoading) {
    return (
      <div className="landing flex items-center justify-center min-h-screen bg-black text-neutral-300">
        <div className="flex flex-col items-center gap-3">
          <Brand compact />
          <div className="w-6 h-6 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (view === 'landing') {
    return (
      <LandingPage
        onEnter={enterFromLanding}
        onSignIn={signInFromLanding}
        onPricing={openPricing}
        onSubscribe={subscribeToPlan}
        language={language}
        onLanguageChange={setLanguage}
        t={t}
      />
    );
  }
  if (view === 'pricing') {
    return (
      <ErrorBoundary label="Pricing">
        <PricingPage
          t={t}
          language={language}
          onLanguageChange={setLanguage}
          onBack={() => setView('landing')}
          onSignIn={() => setView('signin')}
          onSubscribe={subscribeToPlan}
          onStartFree={() => {
            setPendingPlan(null);
            setView('signup');
          }}
        />
      </ErrorBoundary>
    );
  }
  if (view === 'signin') {
    return (
      <ErrorBoundary label="Sign in">
        <SignIn
          t={t}
          language={language}
          onLanguageChange={setLanguage}
          onBack={leaveAuth}
          onSuccess={completeSignIn}
          onSwitchToSignUp={() => setView('signup')}
          planNotice={noticePlan ? t.auth.noticeSignIn.replace('{plan}', noticePlan) : undefined}
        />
      </ErrorBoundary>
    );
  }
  if (view === 'signup') {
    return (
      <ErrorBoundary label="Sign up">
        <SignUp
          t={t}
          language={language}
          onLanguageChange={setLanguage}
          onBack={leaveAuth}
          onSuccess={completeSignUp}
          onSwitchToSignIn={() => setView('signin')}
          planNotice={noticePlan ? t.auth.noticeSignUp.replace('{plan}', noticePlan) : undefined}
        />
      </ErrorBoundary>
    );
  }
  if (view === 'onboarding') {
    return (
      <ErrorBoundary label="Onboarding">
        <OnboardingWizard
          t={t}
          language={language}
          onLanguageChange={setLanguage}
          onComplete={completeOnboarding}
          onSkip={skipOnboarding}
          defaultName={account ? companyFromEmail(account.email) : undefined}
        />
      </ErrorBoundary>
    );
  }

  // Route protection for dashboard: if not authenticated in configured mode, redirect to signin
  if (!account && isSupabaseConfigured()) {
    return (
      <ErrorBoundary label="Sign in">
        <SignIn
          t={t}
          language={language}
          onLanguageChange={setLanguage}
          onBack={leaveAuth}
          onSuccess={completeSignIn}
          onSwitchToSignUp={() => setView('signup')}
          planNotice={noticePlan ? t.auth.noticeSignIn.replace('{plan}', noticePlan) : undefined}
        />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary label="Dashboard">
      <Dashboard
        onExit={handleSignOut}
        initialWorkspace={initialWorkspace}
        initialTab={dashboardTab}
        initialBilling={initialBilling}
        checkout={pendingPlan}
        onCheckoutHandled={() => setPendingPlan(null)}
        language={language}
        onLanguageChange={setLanguage}
        t={t}
        account={account}
        onSignOut={handleSignOut}
      />
    </ErrorBoundary>
  );
}

export default App;
