import { useMemo, useState } from 'react'
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  Bell,
  Check,
  ChevronRight,
  CircleDollarSign,
  Gauge,
  Gem,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
  Timer,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react'
import heroImage from '../assets/hero-showroom.webp'
import gt3Image from '../assets/gt3-dark.webp'
import aventadorImage from '../assets/aventador-garage.webp'
import lineupImage from '../assets/huracan-lineup.webp'
import '../App.css'

type SignalTone = 'buy' | 'hold' | 'wait'

type Car = {
  id: string
  name: string
  year: string
  category: string
  fairValue: number
  annualReturn: number
  confidence: number
  liquidity: number
  specPremium: number
  carryCost: number
  signal: string
  tone: SignalTone
  trend: number[]
  note: string
  options: string[]
}

const cars: Car[] = [
  {
    id: 'pista',
    name: 'Ferrari 488 Pista',
    year: '2020',
    category: 'Limited-production exotic',
    fairValue: 478,
    annualReturn: 6.7,
    confidence: 91,
    liquidity: 71,
    specPremium: 18,
    carryCost: 16.8,
    signal: 'Accumulate selectively',
    tone: 'buy',
    trend: [412, 418, 426, 421, 435, 442, 449, 455, 462, 468, 471, 478],
    note: 'Low build visibility, strong options sensitivity, and thin public supply keep quality cars bid.',
    options: ['Carbon fiber wheels', 'Atelier paint', 'Suspension lifter', 'Telemetry'],
  },
  {
    id: 'gt3t',
    name: 'Porsche 911 GT3 Touring',
    year: '2022',
    category: 'Modern collectible',
    fairValue: 268,
    annualReturn: 4.8,
    confidence: 88,
    liquidity: 84,
    specPremium: 12,
    carryCost: 8.4,
    signal: 'Buy the right spec',
    tone: 'buy',
    trend: [231, 236, 242, 239, 246, 249, 253, 257, 260, 263, 265, 268],
    note: 'Manual demand remains durable, but mileage bands and paint-to-sample premiums matter more than model averages.',
    options: ['6-speed manual', 'Paint to Sample', 'PCCB', 'Lightweight buckets'],
  },
  {
    id: 'huracan',
    name: 'Lamborghini Huracán EVO RWD',
    year: '2021',
    category: 'V10 exotic',
    fairValue: 238,
    annualReturn: 2.1,
    confidence: 82,
    liquidity: 77,
    specPremium: 6,
    carryCost: 11.2,
    signal: 'Hold / negotiate',
    tone: 'hold',
    trend: [219, 224, 229, 227, 232, 235, 233, 236, 234, 237, 236, 238],
    note: 'Clean driver-quality cars are liquid, but undifferentiated inventory is taking longer to clear.',
    options: ['Style Package', 'Lift system', 'Ad Personam paint', 'Forged wheels'],
  },
  {
    id: '720s',
    name: 'McLaren 720S Performance',
    year: '2019',
    category: 'Supercar benchmark',
    fairValue: 252,
    annualReturn: -3.2,
    confidence: 76,
    liquidity: 64,
    specPremium: 4,
    carryCost: 14.6,
    signal: 'Wait for capitulation',
    tone: 'wait',
    trend: [281, 276, 272, 268, 265, 261, 259, 257, 255, 253, 252, 252],
    note: 'Depreciation is slowing, but buyers are rewarding service history and punishing deferred maintenance.',
    options: ['MSO paint', 'Carbon exterior', 'Track telemetry', 'Stealth pack'],
  },
  {
    id: 'blackseries',
    name: 'Mercedes-AMG GT Black Series',
    year: '2023',
    category: 'Track-focused flagship',
    fairValue: 389,
    annualReturn: 5.4,
    confidence: 86,
    liquidity: 69,
    specPremium: 14,
    carryCost: 10.7,
    signal: 'Buy on pullbacks',
    tone: 'buy',
    trend: [344, 351, 358, 355, 362, 367, 371, 375, 379, 383, 386, 389],
    note: 'Track hardware and limited allocation support values; colors and aero options create wide sale dispersion.',
    options: ['AMG One paint', 'Ceramic brakes', 'Track package', 'Burmester audio'],
  },
]

const tickerItems = [
  ['Ferrari 812 Competizione', '+2.8%', 'strong bid depth'],
  ['Porsche 911 Sport Classic', '+1.9%', 'manual premium widening'],
  ['Lamborghini Revuelto', '-1.1%', 'new allocation pressure'],
  ['McLaren Senna', '+3.4%', 'thin public supply'],
  ['Aston Martin DBS 770', '+0.8%', 'GT demand stable'],
  ['Ferrari F8 Tributo', '-0.6%', 'supply normalizing'],
]

const dealRadar = [
  {
    model: '2020 Ferrari 488 Pista',
    ask: 456,
    fair: 478,
    edge: '-4.6%',
    reason: 'Rare color, complete records, 22 days listed',
    tone: 'buy' as SignalTone,
  },
  {
    model: '2022 Porsche 911 GT3 Touring',
    ask: 259,
    fair: 268,
    edge: '-3.4%',
    reason: 'PTS Gulf Blue, buckets, front lift, one owner',
    tone: 'buy' as SignalTone,
  },
  {
    model: '2021 Lamborghini Huracán EVO RWD',
    ask: 246,
    fair: 238,
    edge: '+3.4%',
    reason: 'High ask for driver-grade spec; negotiate below band',
    tone: 'wait' as SignalTone,
  },
]

const categoryCards = [
  {
    title: 'Exotics',
    copy: 'Ferrari, Lamborghini, McLaren, Pagani and limited VIN-level variants.',
    image: aventadorImage,
    metric: '412 tracked variants',
  },
  {
    title: 'Modern collectibles',
    copy: 'GT cars, manual specials, anniversary models and allocation-only trims.',
    image: gt3Image,
    metric: '386 tracked variants',
  },
  {
    title: 'Luxury flagships',
    copy: 'High-spec GTs, performance limousines and rare coachbuilt commissions.',
    image: lineupImage,
    metric: '274 tracked variants',
  },
]

const featureCards = [
  {
    icon: Gem,
    title: 'Spec premium engine',
    copy: 'Separates model averages from what colors, transmissions, carbon packages, seats and provenance actually do to value.',
  },
  {
    icon: ShieldCheck,
    title: 'Provenance score',
    copy: 'Weights ownership count, service cadence, accident history, mileage bands, originality and documentation quality.',
  },
  {
    icon: Gauge,
    title: 'Liquidity-adjusted values',
    copy: 'A fair number is only useful if the market can clear it. Highline Index shows bid depth and days-to-sell pressure.',
  },
  {
    icon: CircleDollarSign,
    title: 'True ownership cost',
    copy: 'Adds insurance, storage, service, registration, financing and expected reconditioning into the buy decision.',
  },
]

const comparisonRows = [
  ['Model average', 'One blended value', 'VIN, spec and mileage bands'],
  ['Market signal', 'Generic appreciation arrow', 'Buy / hold / wait with confidence'],
  ['Options', 'Often ignored', 'Option-by-option premium model'],
  ['Timing', 'Historical chart', 'Seasonality, liquidity and carry cost'],
  ['Deal discovery', 'Listing feed', 'Undervalued asks ranked by edge'],
]

const plans = [
  {
    name: 'Scout',
    price: '$0',
    note: 'For watching the market',
    cta: 'Start free',
    features: ['Browse the highline index', 'Current sample values', 'Three watchlist slots', 'Weekly market snapshot'],
  },
  {
    name: 'Insider',
    price: '$29',
    note: 'For active buyers',
    cta: 'Choose Insider',
    featured: true,
    features: ['Full sale history', 'Spec premium breakdown', 'Deal radar and alerts', 'Liquidity and carry-cost scores', 'Compare up to five cars'],
  },
  {
    name: 'Concours',
    price: '$79',
    note: 'For serious collectors',
    cta: 'Choose Concours',
    features: ['Portfolio outlook', 'Provenance scoring', 'Collection concentration risk', 'Private sale timing notes', 'Quarterly market briefing'],
  },
]

const horizonOptions = [12, 24, 60]

function formatK(value: number) {
  return `$${value.toFixed(value >= 100 ? 0 : 1)}K`
}

function toneClasses(tone: SignalTone) {
  if (tone === 'buy') return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
  if (tone === 'hold') return 'border-amber-300/30 bg-amber-300/10 text-amber-200'
  return 'border-rose-400/30 bg-rose-400/10 text-rose-300'
}

function ToneIcon({ tone }: { tone: SignalTone }) {
  if (tone === 'buy') return <TrendingUp className="h-4 w-4" />
  if (tone === 'hold') return <Activity className="h-4 w-4" />
  return <TrendingDown className="h-4 w-4" />
}

function TrendChart({ car, horizon }: { car: Car; horizon: number }) {
  const width = 680
  const height = 270
  const left = 24
  const right = 38
  const top = 24
  const bottom = 34
  const projected = car.trend[car.trend.length - 1] * (1 + (car.annualReturn * horizon) / 1200)
  const values = [...car.trend, projected]
  const min = Math.min(...values) * 0.985
  const max = Math.max(...values) * 1.015
  const innerWidth = width - left - right
  const innerHeight = height - top - bottom
  const xStep = innerWidth / (values.length - 1)

  const pointFor = (value: number, index: number) => {
    const x = left + index * xStep
    const y = top + ((max - value) / (max - min)) * innerHeight
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }

  const actualPoints = car.trend.map((value, index) => pointFor(value, index)).join(' ')
  const lastPoint = pointFor(car.trend[car.trend.length - 1], car.trend.length - 1).split(',')
  const forecastPoint = pointFor(projected, values.length - 1).split(',')
  const areaPoints = `${left},${height - bottom} ${actualPoints} ${width - right},${height - bottom}`

  return (
    <div className="chart-frame">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Fair value curve</p>
          <h3 className="mt-1 text-xl font-semibold text-white">{horizon}-month outlook</h3>
        </div>
        <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300">
          Illustrative projection
        </div>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[270px] w-full" role="img" aria-label={`${car.name} market trend chart`}>
        <defs>
          <linearGradient id="trendFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#d7b56d" stopOpacity="0.34" />
            <stop offset="100%" stopColor="#d7b56d" stopOpacity="0" />
          </linearGradient>
          <filter id="goldGlow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {[0, 1, 2, 3].map((line) => {
          const y = top + (innerHeight / 3) * line
          return <line key={line} x1={left} x2={width - right} y1={y} y2={y} stroke="rgba(255,255,255,0.08)" strokeDasharray="4 7" />
        })}
        <polygon points={areaPoints} fill="url(#trendFill)" />
        <polyline points={actualPoints} fill="none" stroke="#d7b56d" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" filter="url(#goldGlow)" />
        <line
          x1={lastPoint[0]}
          y1={lastPoint[1]}
          x2={forecastPoint[0]}
          y2={forecastPoint[1]}
          stroke={car.annualReturn >= 0 ? '#8ee8bd' : '#ff9c9c'}
          strokeWidth="3"
          strokeDasharray="7 7"
          strokeLinecap="round"
        />
        <circle cx={lastPoint[0]} cy={lastPoint[1]} r="5" fill="#0d0d10" stroke="#f2d38a" strokeWidth="3" />
        <circle cx={forecastPoint[0]} cy={forecastPoint[1]} r="5" fill={car.annualReturn >= 0 ? '#8ee8bd' : '#ff9c9c'} />
      </svg>
      <div className="grid grid-cols-3 gap-3 border-t border-white/10 pt-4 text-sm">
        <div>
          <p className="text-slate-500">Current fair value</p>
          <p className="mt-1 font-semibold text-white">{formatK(car.fairValue)}</p>
        </div>
        <div>
          <p className="text-slate-500">Projected band</p>
          <p className={`mt-1 font-semibold ${car.annualReturn >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
            {car.annualReturn >= 0 ? '+' : ''}
            {car.annualReturn.toFixed(1)}% / yr
          </p>
        </div>
        <div>
          <p className="text-slate-500">Confidence</p>
          <p className="mt-1 font-semibold text-white">{car.confidence}%</p>
        </div>
      </div>
    </div>
  )
}

function MetricBar({ label, value, display }: { label: string; value: number; display: string }) {
  return (
    <div className="metric-bar">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-slate-400">{label}</span>
        <span className="font-semibold text-white">{display}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.07]">
        <div className="h-full rounded-full bg-gradient-to-r from-[#8f6b2f] via-[#d8b56d] to-[#fff0bc]" style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
      </div>
    </div>
  )
}

function AppHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-[#08080a]/78 backdrop-blur-2xl">
      <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8">
        <a href="#top" className="group flex items-center gap-3" aria-label="Highline Index home">
          <span className="grid h-10 w-10 place-items-center rounded-full border border-[#d7b56d]/40 bg-[#d7b56d]/10 text-[#f0d692] shadow-[0_0_34px_rgba(215,181,109,0.18)]">
            <Gauge className="h-5 w-5" />
          </span>
          <span className="leading-none">
            <span className="block text-[17px] font-semibold tracking-[0.02em] text-white">Highline</span>
            <span className="mt-1 block text-[11px] uppercase tracking-[0.32em] text-[#d7b56d]">Index</span>
          </span>
        </a>
        <nav className="hidden items-center gap-8 text-sm text-slate-300 lg:flex" aria-label="Primary navigation">
          <a className="nav-link" href="#market">Market</a>
          <a className="nav-link" href="#dashboard">Dashboard</a>
          <a className="nav-link" href="#signals">Signals</a>
          <a className="nav-link" href="#pricing">Pricing</a>
        </nav>
        <div className="flex items-center gap-3">
          <span className="hidden rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs text-emerald-300 md:inline-flex">
            Concept demo · illustrative data
          </span>
          <a href="/markets" className="outline-button hidden !py-2.5 sm:inline-flex">
            Markets
          </a>
          <a href="/radar" className="luxury-button hidden sm:inline-flex">
            Open live radar
            <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section id="top" className="relative overflow-hidden pt-[132px]">
      <div className="hero-orb hero-orb-one" />
      <div className="hero-orb hero-orb-two" />
      <div className="mx-auto grid max-w-7xl gap-12 px-5 pb-20 sm:px-8 lg:grid-cols-[1.02fr_0.98fr] lg:items-center lg:pb-28">
        <div className="relative z-10">
          <div className="section-kicker">
            <Sparkles className="h-4 w-4" />
            Built for the cars generic indexes flatten
          </div>
          <h1 className="font-display mt-7 max-w-4xl text-[54px] leading-[0.92] tracking-[-0.045em] text-white sm:text-[74px] lg:text-[88px]">
            The market pulse for cars above the <em className="gold-text not-italic">ordinary.</em>
          </h1>
          <p className="mt-7 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
            Highline Index turns luxury, exotic and limited-production car activity into a sharper read on fair value, spec premiums, liquidity, timing and real ownership cost.
          </p>
          <div className="mt-9 flex flex-col gap-4 sm:flex-row">
            <a href="#dashboard" className="luxury-button justify-center px-7 py-4 text-base">
              Explore the demo
              <ArrowRight className="h-5 w-5" />
            </a>
            <a href="#signals" className="outline-button justify-center px-7 py-4 text-base">
              See what makes it different
            </a>
          </div>
          <div className="mt-10 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['$8.6B', 'sample market mapped'],
              ['1,248', 'VIN-level profiles'],
              ['214', 'limited trims'],
              ['31', 'decision signals'],
            ].map(([value, label]) => (
              <div key={label} className="stat-card">
                <p className="text-2xl font-semibold text-white">{value}</p>
                <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10">
          <div className="hero-image-card">
            <img src={heroImage} alt="Luxury performance cars in a dark showroom" className="h-[520px] w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#08080a] via-transparent to-transparent" />
            <div className="absolute left-5 top-5 rounded-full border border-white/15 bg-black/35 px-4 py-2 text-xs uppercase tracking-[0.24em] text-white backdrop-blur-xl">
              Live-feel market model
            </div>
            <div className="absolute bottom-5 left-5 right-5 grid gap-3 sm:grid-cols-[1fr_auto]">
              <div className="glass-panel p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Featured signal</p>
                    <h2 className="mt-1 text-xl font-semibold text-white">Ferrari 488 Pista</h2>
                  </div>
                  <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${toneClasses('buy')}`}>
                    <ToneIcon tone="buy" />
                    Accumulate
                  </span>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <p className="text-slate-500">Fair value</p>
                    <p className="mt-1 text-xl font-semibold text-white">$478K</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Spec premium</p>
                    <p className="mt-1 text-xl font-semibold text-[#f0d692]">+18%</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Liquidity</p>
                    <p className="mt-1 text-xl font-semibold text-emerald-300">71/100</p>
                  </div>
                </div>
              </div>
              <div className="glass-panel hidden w-40 p-4 sm:block">
                <p className="text-xs text-slate-500">90-day move</p>
                <p className="mt-2 text-3xl font-semibold text-emerald-300">+2.9%</p>
                <div className="mt-4 flex h-12 items-end gap-1.5">
                  {[34, 48, 39, 58, 52, 70, 64, 82].map((height, index) => (
                    <span key={index} className="w-full rounded-t bg-gradient-to-t from-[#745423] to-[#f0d692]" style={{ height: `${height}%` }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function MarketTicker() {
  const doubled = [...tickerItems, ...tickerItems]
  return (
    <section className="border-y border-white/[0.06] bg-white/[0.025] py-4">
      <div className="ticker-mask overflow-hidden">
        <div className="ticker-track">
          {doubled.map(([model, move, note], index) => (
            <div key={`${model}-${index}`} className="mx-5 flex min-w-max items-center gap-4 text-sm">
              <span className="font-medium text-white">{model}</span>
              <span className={move.startsWith('+') ? 'text-emerald-300' : 'text-rose-300'}>{move}</span>
              <span className="text-slate-500">{note}</span>
              <span className="h-1 w-1 rounded-full bg-[#d7b56d]" />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function CategoryShowcase() {
  return (
    <section id="market" className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32">
      <div className="grid gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
        <div>
          <div className="section-kicker">Highline coverage</div>
          <h2 className="font-display mt-5 text-5xl leading-[0.98] tracking-[-0.035em] text-white sm:text-6xl">
            Not every valuable car behaves like a collectible.
          </h2>
        </div>
        <p className="max-w-2xl text-lg leading-8 text-slate-300 lg:justify-self-end">
          The demo focuses on the segments where trim, provenance, mileage, production visibility and ownership cost can change the answer by six figures — not just the model name.
        </p>
      </div>
      <div className="mt-14 grid gap-5 lg:grid-cols-3">
        {categoryCards.map((card) => (
          <article key={card.title} className="image-card group">
            <img src={card.image} alt={`${card.title} category`} className="h-72 w-full object-cover transition duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-7">
              <p className="text-xs uppercase tracking-[0.24em] text-[#f0d692]">{card.metric}</p>
              <h3 className="mt-2 text-3xl font-semibold text-white">{card.title}</h3>
              <p className="mt-3 max-w-sm text-sm leading-6 text-slate-300">{card.copy}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function FeatureGrid() {
  return (
    <section id="signals" className="relative overflow-hidden border-y border-white/[0.06] bg-[#0d0d10] py-24 lg:py-32">
      <div className="absolute left-1/2 top-0 h-px w-[70%] -translate-x-1/2 bg-gradient-to-r from-transparent via-[#d7b56d]/60 to-transparent" />
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="max-w-3xl">
          <div className="section-kicker">A sharper lens</div>
          <h2 className="font-display mt-5 text-5xl leading-[0.98] tracking-[-0.035em] text-white sm:text-6xl">
            Better because highline cars need better questions.
          </h2>
          <p className="mt-6 text-lg leading-8 text-slate-300">
            Generic car indexes ask “What is this model worth?” Highline Index asks which exact car, in which spec, with what story, at what liquidity, and at what all-in cost.
          </p>
        </div>
        <div className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {featureCards.map((feature) => (
            <article key={feature.title} className="feature-card">
              <div className="feature-icon">
                <feature.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-6 text-xl font-semibold text-white">{feature.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-400">{feature.copy}</p>
            </article>
          ))}
        </div>

        <div className="mt-16 overflow-hidden rounded-[2rem] border border-white/[0.08] bg-white/[0.025]">
          <div className="grid border-b border-white/[0.08] bg-white/[0.03] px-6 py-4 text-sm font-medium text-slate-300 md:grid-cols-[0.8fr_1fr_1.2fr]">
            <span>Decision layer</span>
            <span className="hidden md:block">Typical index</span>
            <span className="hidden md:block">Highline Index</span>
          </div>
          {comparisonRows.map(([layer, typical, highline]) => (
            <div key={layer} className="grid gap-4 border-b border-white/[0.06] px-6 py-5 last:border-b-0 md:grid-cols-[0.8fr_1fr_1.2fr]">
              <span className="text-sm font-medium text-white">{layer}</span>
              <span className="text-sm text-slate-500">{typical}</span>
              <span className="flex items-start gap-3 text-sm text-slate-200">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#eacb86]" />
                {highline}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function DashboardDemo() {
  const [selectedId, setSelectedId] = useState(cars[0].id)
  const [query, setQuery] = useState('')
  const [horizon, setHorizon] = useState(24)

  const filteredCars = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return cars
    return cars.filter((car) => `${car.year} ${car.name} ${car.category}`.toLowerCase().includes(normalized))
  }, [query])

  const selectedCar = cars.find((car) => car.id === selectedId) ?? cars[0]

  return (
    <section id="dashboard" className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <div className="section-kicker">Interactive demo</div>
          <h2 className="font-display mt-5 text-5xl leading-[0.98] tracking-[-0.035em] text-white sm:text-6xl">
            A dashboard that explains the move, not just the number.
          </h2>
        </div>
        <div className="rounded-2xl border border-amber-200/15 bg-amber-200/[0.06] px-4 py-3 text-sm leading-6 text-amber-100/90">
          Demo data is illustrative and does not represent live market pricing or investment advice.
        </div>
      </div>

      <div className="dashboard-shell mt-12">
        <aside className="dashboard-sidebar">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Watchlist</p>
              <h3 className="mt-1 text-lg font-semibold text-white">Highline radar</h3>
            </div>
            <span className="rounded-full bg-[#d7b56d]/10 px-3 py-1 text-xs text-[#f0d692]">{cars.length} cars</span>
          </div>
          <label className="relative mt-6 block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search model, year, segment..."
              className="h-12 w-full rounded-2xl border border-white/[0.08] bg-white/[0.04] pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-[#d7b56d]/50 focus:bg-white/[0.06]"
            />
          </label>
          <div className="mt-5 space-y-3">
            {filteredCars.map((car) => {
              const active = car.id === selectedCar.id
              return (
                <button
                  key={car.id}
                  type="button"
                  onClick={() => setSelectedId(car.id)}
                  className={`model-button ${active ? 'model-button-active' : ''}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-white">{car.year} {car.name}</span>
                    <span className="mt-1 block truncate text-xs text-slate-500">{car.category}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm font-semibold text-white">{formatK(car.fairValue)}</span>
                    <span className={`mt-1 block text-xs ${car.annualReturn >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {car.annualReturn >= 0 ? '+' : ''}{car.annualReturn.toFixed(1)}%
                    </span>
                  </span>
                </button>
              )
            })}
            {filteredCars.length === 0 && (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 text-sm text-slate-400">
                No matching demo cars. Try “Porsche”, “Ferrari”, or “GT”.
              </div>
            )}
          </div>
        </aside>

        <div className="min-w-0 flex-1 p-5 sm:p-7 lg:p-8">
          <div className="flex flex-col gap-5 border-b border-white/[0.08] pb-7 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-slate-400">{selectedCar.category}</span>
                <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${toneClasses(selectedCar.tone)}`}>
                  <ToneIcon tone={selectedCar.tone} />
                  {selectedCar.signal}
                </span>
              </div>
              <h3 className="mt-4 text-3xl font-semibold tracking-[-0.02em] text-white sm:text-4xl">
                {selectedCar.year} {selectedCar.name}
              </h3>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">{selectedCar.note}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:w-[430px]">
              <div className="dashboard-stat">
                <p>Fair value</p>
                <strong>{formatK(selectedCar.fairValue)}</strong>
              </div>
              <div className="dashboard-stat">
                <p>Spec premium</p>
                <strong className="text-[#f0d692]">+{selectedCar.specPremium}%</strong>
              </div>
              <div className="dashboard-stat">
                <p>Liquidity</p>
                <strong>{selectedCar.liquidity}/100</strong>
              </div>
              <div className="dashboard-stat">
                <p>Carry cost</p>
                <strong>{formatK(selectedCar.carryCost)}/yr</strong>
              </div>
            </div>
          </div>

          <div className="mt-7 grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
            <div>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex rounded-full border border-white/[0.08] bg-white/[0.03] p-1">
                  {horizonOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setHorizon(option)}
                      className={`rounded-full px-4 py-2 text-sm transition ${horizon === option ? 'bg-[#d7b56d] text-black shadow-[0_8px_28px_rgba(215,181,109,0.22)]' : 'text-slate-400 hover:text-white'}`}
                    >
                      {option}M
                    </button>
                  ))}
                </div>
                <button type="button" className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm text-slate-300 transition hover:border-[#d7b56d]/40 hover:text-white">
                  <Bell className="h-4 w-4" />
                  Create alert
                </button>
              </div>
              <TrendChart car={selectedCar} horizon={horizon} />
            </div>

            <div className="space-y-4">
              <MetricBar label="Signal confidence" value={selectedCar.confidence} display={`${selectedCar.confidence}%`} />
              <MetricBar label="Market liquidity" value={selectedCar.liquidity} display={`${selectedCar.liquidity}/100`} />
              <MetricBar label="Spec sensitivity" value={selectedCar.specPremium * 5} display={`+${selectedCar.specPremium}%`} />
              <MetricBar label="Ownership efficiency" value={100 - selectedCar.carryCost * 3} display={formatK(selectedCar.carryCost)} />
              <div className="rounded-3xl border border-white/[0.08] bg-white/[0.035] p-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-[#d7b56d]/10 text-[#f0d692]">
                    <BadgeCheck className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">Option premiums watched</p>
                    <p className="text-xs text-slate-500">Sample VIN-level factors</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedCar.options.map((option) => (
                    <span key={option} className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300">
                      {option}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function DealRadar() {
  return (
    <section className="border-y border-white/[0.06] bg-[#0b0b0e] py-24 lg:py-32">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:items-start">
          <div className="lg:sticky lg:top-28">
            <div className="section-kicker">Deal radar</div>
            <h2 className="font-display mt-5 text-5xl leading-[0.98] tracking-[-0.035em] text-white sm:text-6xl">
              Surface the ask before the market catches up.
            </h2>
            <p className="mt-6 text-lg leading-8 text-slate-300">
              A better highline product should rank opportunities by edge, not just list price. The demo blends fair value, spec quality, days listed and seller behavior into one action call.
            </p>
          </div>
          <div className="space-y-4">
            {dealRadar.map((deal) => (
              <article key={deal.model} className="deal-card">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-xl font-semibold text-white">{deal.model}</h3>
                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${toneClasses(deal.tone)}`}>
                      <ToneIcon tone={deal.tone} />
                      {deal.tone === 'buy' ? 'Potential edge' : 'Wait'}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-400">{deal.reason}</p>
                </div>
                <div className="grid shrink-0 grid-cols-3 gap-3 text-sm sm:min-w-[360px]">
                  <div>
                    <p className="text-slate-500">Ask</p>
                    <p className="mt-1 font-semibold text-white">{formatK(deal.ask)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Fair</p>
                    <p className="mt-1 font-semibold text-white">{formatK(deal.fair)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Edge</p>
                    <p className={`mt-1 font-semibold ${deal.edge.startsWith('-') ? 'text-emerald-300' : 'text-rose-300'}`}>{deal.edge}</p>
                  </div>
                </div>
              </article>
            ))}
            <div className="rounded-[2rem] border border-[#d7b56d]/20 bg-gradient-to-br from-[#d7b56d]/12 to-white/[0.03] p-7">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.26em] text-[#f0d692]">Collector workflow</p>
                  <h3 className="mt-2 text-2xl font-semibold text-white">Turn every alert into a decision memo.</h3>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
                    See the comps, option adjustment, ownership cost, downside band and negotiation range before you call the seller.
                  </p>
                </div>
                <a href="#pricing" className="luxury-button shrink-0">
                  View plans
                  <ChevronRight className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32">
      <div className="mx-auto max-w-3xl text-center">
        <div className="section-kicker justify-center">Pricing concept</div>
        <h2 className="font-display mt-5 text-5xl leading-[0.98] tracking-[-0.035em] text-white sm:text-6xl">
          Priced around one avoided mistake.
        </h2>
        <p className="mt-6 text-lg leading-8 text-slate-300">
          A better product can move upstream from “car values” into collector decision support — where timing, provenance and negotiation edge are worth paying for.
        </p>
      </div>
      <div className="mt-14 grid gap-5 lg:grid-cols-3">
        {plans.map((plan) => (
          <article key={plan.name} className={`price-card ${plan.featured ? 'price-card-featured' : ''}`}>
            {plan.featured && <div className="absolute right-6 top-6 rounded-full bg-[#d7b56d] px-3 py-1 text-xs font-semibold text-black">Recommended</div>}
            <h3 className="text-2xl font-semibold text-white">{plan.name}</h3>
            <p className="mt-2 text-sm text-slate-500">{plan.note}</p>
            <div className="mt-7 flex items-end gap-2">
              <span className="text-5xl font-semibold tracking-[-0.04em] text-white">{plan.price}</span>
              <span className="pb-2 text-sm text-slate-500">/ month</span>
            </div>
            <ul className="mt-8 space-y-3">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-sm text-slate-300">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#eacb86]" />
                  {feature}
                </li>
              ))}
            </ul>
            <button type="button" className={`mt-9 w-full ${plan.featured ? 'luxury-button justify-center' : 'outline-button justify-center'}`}>
              {plan.cta}
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}

function ClosingCta() {
  return (
    <section className="relative overflow-hidden border-t border-white/[0.06]">
      <img src={lineupImage} alt="Dark highline performance car lineup" className="absolute inset-0 h-full w-full object-cover opacity-30" />
      <div className="absolute inset-0 bg-gradient-to-r from-black via-black/82 to-black/35" />
      <div className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:py-32">
        <div className="max-w-3xl">
          <div className="section-kicker">
            <Zap className="h-4 w-4" />
            The better category position
          </div>
          <h2 className="font-display mt-5 text-5xl leading-[0.98] tracking-[-0.035em] text-white sm:text-7xl">
            Own the decision layer for highline cars.
          </h2>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
            This concept is built to feel more exclusive, more analytical and more actionable than a broad collector-car index — with the caveat that live valuation requires a real market-data pipeline.
          </p>
          <div className="mt-9 flex flex-col gap-4 sm:flex-row">
            <a href="#dashboard" className="luxury-button justify-center px-7 py-4 text-base">
              Revisit the dashboard
              <ArrowRight className="h-5 w-5" />
            </a>
            <a href="#top" className="outline-button justify-center px-7 py-4 text-base">
              Back to top
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/[0.06] bg-[#070708]">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 text-sm text-slate-500 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full border border-[#d7b56d]/30 bg-[#d7b56d]/10 text-[#f0d692]">
            <Star className="h-4 w-4" />
          </span>
          <div>
            <p className="font-semibold text-white">Highline Index</p>
            <p className="text-xs">Luxury and exotic car market intelligence concept.</p>
          </div>
        </div>
        <div className="max-w-2xl text-xs leading-5">
          Illustrative concept demo. Vehicle values, signals, projections and plans are sample content only — not live prices, financial advice or an offer. Photography sourced from Pexels and Unsplash.
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Timer className="h-4 w-4" />
          Built for premium market decisions
        </div>
      </div>
    </footer>
  )
}

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#08080a] text-white">
      <AppHeader />
      <Hero />
      <MarketTicker />
      <CategoryShowcase />
      <FeatureGrid />
      <DashboardDemo />
      <DealRadar />
      <Pricing />
      <ClosingCta />
      <Footer />
    </main>
  )
}
