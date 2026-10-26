import { useState } from 'react';
import {
  FileText,
  MessageSquare,
  Star,
  ShieldCheck,
  BarChart3,
  Download,
  TrendingUp,
  TrendingDown,
  Cloud,
  Star as StarIcon,
  Tag,
  Check,
} from 'lucide-react';
import type { Translation } from '@/i18n';

type RangeId = '7d' | '30d' | 'quarter';

function XIcon({ size = 15 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 3h3l-7.1 8.1L21.7 21h-6l-4.7-6.1L5.6 21H2.5l7.6-8.7L2.3 3h6.1l4.3 5.6L17.5 3zm-1 16h1.7L7.5 4.7H5.7L16.5 19z" /></svg>;
}

function ReportsView({ t }: { t: Translation }) {
  const [range, setRange] = useState<RangeId>('30d');
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);
  const [exportDone, setExportDone] = useState(false);

  function handleExport(format: 'csv' | 'pdf') {
    setExporting(format);
    setExportDone(false);
    setTimeout(() => {
      setExporting(null);
      setExportDone(true);
      setTimeout(() => setExportDone(false), 2400);
    }, 1300);
  }

  const rangeOptions = [
    { id: '7d' as RangeId, label: t.reports.period7d },
    { id: '30d' as RangeId, label: t.reports.period30d },
    { id: 'quarter' as RangeId, label: t.reports.periodQuarter },
  ];

  const channelNames = t.reports.channelNames as readonly string[];
  const channelValues = t.reports.channelValues as readonly number[];
  const channelColors = ['#8de7d2', '#7ba8e8', '#7cc8db', '#d4a84a'];
  const channelIcons = [Cloud, XIcon, StarIcon, Tag];
  const channelMax = Math.max(...channelValues);

  const trendDays = t.reports.trendDays as readonly string[];
  const trendData = [
    { positive: [62, 65, 68, 64, 70, 74, 78], negative: [22, 20, 18, 24, 16, 14, 12] },
    { positive: [55, 58, 61, 59, 63, 66, 69, 67, 71, 74, 72, 76], negative: [28, 26, 24, 27, 22, 20, 19, 21, 17, 15, 18, 14] },
    { positive: [48, 52, 55, 58, 56, 60, 63, 61, 65, 68, 66, 70], negative: [32, 30, 28, 26, 29, 25, 23, 24, 21, 19, 22, 18] },
  ];
  const trendIndex = range === '7d' ? 0 : range === '30d' ? 1 : 2;
  const currentTrend = trendData[trendIndex];

  return (
    <div className="reports-view">
      <div className="reports-header">
        <div>
          <p className="panel-kicker"><FileText size={13} /> {t.reports.kicker}</p>
          <h1 className="reports-title">{t.reports.title}</h1>
          <p className="reports-subtitle">{t.reports.subtitle}</p>
        </div>
        <div className="reports-actions">
          <div className="reports-range" role="tablist">
            {rangeOptions.map((opt) => (
              <button
                key={opt.id}
                className={`reports-range-pill ${range === opt.id ? 'active' : ''}`}
                onClick={() => setRange(opt.id)}
                role="tab"
                aria-selected={range === opt.id}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="reports-metrics">
        <div className="report-metric-card">
          <div className="metric-icon cyan"><MessageSquare size={19} /></div>
          <div className="metric-content">
            <span>{t.reports.totalVolume}</span>
            <div><strong>{t.reports.totalVolumeValue}</strong><i><TrendingUp size={10} /> +18.4%</i></div>
            <small className="metric-note">{t.reports.totalVolumeNote}</small>
          </div>
        </div>
        <div className="report-metric-card">
          <div className="metric-icon gold"><Star size={19} /></div>
          <div className="metric-content">
            <span>{t.reports.npsScore}</span>
            <div><strong>{t.reports.npsValue}</strong><small>/100</small><i><TrendingUp size={10} /> +6.2</i></div>
            <small className="metric-note">{t.reports.npsNote}</small>
          </div>
        </div>
        <div className="report-metric-card">
          <div className="metric-icon cyan"><ShieldCheck size={19} /></div>
          <div className="metric-content">
            <span>{t.reports.bugResolution}</span>
            <div><strong>{t.reports.bugResolutionValue}</strong><i className="down"><TrendingDown size={10} /> -12.5%</i></div>
            <small className="metric-note">{t.reports.bugResolutionNote}</small>
          </div>
        </div>
        <div className="report-metric-card">
          <div className="metric-icon gold"><BarChart3 size={19} /></div>
          <div className="metric-content">
            <span>{t.reports.channelDist}</span>
            <div><strong>{t.reports.channelDistValue}</strong><i><TrendingUp size={10} /> +2</i></div>
            <small className="metric-note">{t.reports.channelDistNote}</small>
          </div>
        </div>
      </div>

      <div className="reports-charts">
        <section className="panel reports-chart-panel">
          <div className="panel-header">
            <div>
              <span className="panel-kicker"><TrendingUp size={13} /> {t.reports.trendKicker}</span>
              <h2>{t.reports.trendTitle}</h2>
            </div>
            <div className="legend">
              <span><i className="legend-dot positive" /> {t.dashboard.positive}</span>
              <span><i className="legend-dot negative" /> {t.dashboard.negative}</span>
            </div>
          </div>
          <div className="chart-summary">
            <div>
              <strong>{t.reports.trendSummary}</strong>
              <span><TrendingUp size={14} /> {t.reports.trendChange}</span>
            </div>
            <div className="summary-caption">{t.reports.trendCaption}</div>
          </div>
          <TrendChart days={trendDays} positive={currentTrend.positive} negative={currentTrend.negative} />
        </section>

        <section className="panel reports-channel-panel">
          <div className="panel-header">
            <div>
              <span className="panel-kicker"><BarChart3 size={13} /> {t.reports.channelKicker}</span>
              <h2>{t.reports.channelTitle}</h2>
            </div>
          </div>
          <div className="channel-bars">
            {channelNames.map((name, index) => {
              const Icon = channelIcons[index];
              const pct = (channelValues[index] / channelMax) * 100;
              return (
                <div className="channel-bar-row" key={name}>
                  <span className={`source-icon ${['green', 'blue', 'sky', 'gold'][index]}`}><Icon size={15} /></span>
                  <span className="channel-bar-label">{name}</span>
                  <div className="channel-bar-track">
                    <div className="channel-bar-fill" style={{ width: `${pct}%`, background: channelColors[index] }} />
                  </div>
                  <strong>{channelValues[index]}%</strong>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="panel reports-export-panel">
        <div className="reports-export-info">
          <span className="panel-kicker"><Download size={13} /> {t.reports.exportKicker}</span>
          <h2>{t.reports.exportTitle}</h2>
          <p>{t.reports.exportDesc}</p>
        </div>
        <div className="reports-export-actions">
          <button
            className={`reports-export-btn ${exporting === 'csv' ? 'loading' : ''}`}
            onClick={() => handleExport('csv')}
            disabled={exporting !== null}
          >
            {exporting === 'csv' ? (
              <><span className="export-spinner" /> {t.reports.exporting}</>
            ) : exportDone ? (
              <><Check size={16} /> {t.reports.exportDone}</>
            ) : (
              <><Download size={16} /> {t.reports.exportCsv}</>
            )}
          </button>
          <button
            className={`reports-export-btn pdf ${exporting === 'pdf' ? 'loading' : ''}`}
            onClick={() => handleExport('pdf')}
            disabled={exporting !== null}
          >
            {exporting === 'pdf' ? (
              <><span className="export-spinner" /> {t.reports.exporting}</>
            ) : exportDone ? (
              <><Check size={16} /> {t.reports.exportDone}</>
            ) : (
              <><Download size={16} /> {t.reports.exportPdf}</>
            )}
          </button>
        </div>
      </section>
    </div>
  );
}

function TrendChart({ days, positive, negative }: { days: readonly string[]; positive: number[]; negative: number[] }) {
  const w = 700;
  const h = 200;
  const pad = 10;
  const stepX = (w - pad * 2) / (days.length - 1);
  const toY = (val: number) => h - pad - (val / 100) * (h - pad * 2);

  const positivePoints = positive.map((v, i) => [pad + i * stepX, toY(v)] as const);
  const negativePoints = negative.map((v, i) => [pad + i * stepX, toY(v)] as const);

  const smoothPath = (pts: readonly (readonly [number, number])[]) => {
    if (pts.length < 2) return '';
    let d = `M ${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) {
      const [px, py] = pts[i - 1];
      const [cx, cy] = pts[i];
      const mx = (px + cx) / 2;
      d += ` C ${mx},${py} ${mx},${cy} ${cx},${cy}`;
    }
    return d;
  };

  const posPath = smoothPath(positivePoints);
  const negPath = smoothPath(negativePoints);
  const posFill = `${posPath} L ${positivePoints[positivePoints.length - 1][0]},${h} L ${positivePoints[0][0]},${h} Z`;

  return (
    <div className="chart-wrap">
      <div className="chart-y"><span>100%</span><span>75%</span><span>50%</span><span>25%</span><span>0%</span></div>
      <svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="trendPosFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#8de7d2" stopOpacity=".22" />
            <stop offset="1" stopColor="#8de7d2" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={posFill} fill="url(#trendPosFill)" />
        <path className="line-negative" d={negPath} />
        <path className="line-positive" d={posPath} />
        <circle cx={positivePoints[positivePoints.length - 1][0]} cy={positivePoints[positivePoints.length - 1][1]} r="4" className="point-positive" />
        <circle cx={negativePoints[negativePoints.length - 1][0]} cy={negativePoints[negativePoints.length - 1][1]} r="4" className="point-negative" />
      </svg>
      <div className="chart-x">{days.map((day) => <span key={day}>{day}</span>)}</div>
    </div>
  );
}

export default ReportsView;
