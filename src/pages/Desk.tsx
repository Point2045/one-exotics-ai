import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, ArrowUpDown, Building2, CheckCircle2, Gauge, History, Radar as RadarIcon, TrendingDown, TrendingUp } from 'lucide-react'
import { trpc } from '@/providers/trpc'
import '../App.css'

function money(value?: number | null) {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function miles(value?: number | null) {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US').format(value)
}

type SortKey = 'price' | 'vsMarketPct' | 'mileage'

function VerdictChip({ verdict, pct, matched }: { verdict: 'rich' | 'market' | 'opportunity' | 'untracked'; pct: number | null; matched: boolean }) {
  const config = {
    rich: { label: pct != null ? `Rich +${pct.toFixed(1)}%` : 'Rich', tone: 'border-rose-400/25 bg-rose-400/10 text-rose-300', Icon: TrendingUp },
    market: { label: pct != null ? `At market ${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%` : 'At market', tone: 'border-white/[0.08] bg-white/[0.04] text-slate-300', Icon: CheckCircle2 },
    opportunity: { label: pct != null ? `Under market ${pct.toFixed(1)}%` : 'Under market', tone: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300', Icon: TrendingDown },
    untracked: { label: matched ? 'No market data yet' : 'Untracked variant', tone: 'border-white/[0.06] bg-white/[0.02] text-slate-500', Icon: CheckCircle2 },
  }[verdict]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${config.tone}`}>
      <config.Icon className="h-3 w-3" />
      {config.label}
    </span>
  )
}

function DemandChip({ signal }: { signal: 'fast' | 'balanced' | 'slow' | null }) {
  if (!signal) return <span className="text-slate-600">—</span>
  const tone =
    signal === 'fast'
      ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
      : signal === 'balanced'
        ? 'border-amber-300/25 bg-amber-300/10 text-amber-200'
        : 'border-rose-400/25 bg-rose-400/10 text-rose-300'
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}><Gauge className="h-3 w-3" />{signal}</span>
}

function DeskBody() {
  const desk = trpc.highline.desk.useQuery(undefined, { staleTime: 600_000 })
  const [sortKey, setSortKey] = useState<SortKey>('price')
  const [sortAsc, setSortAsc] = useState(false)
  const data = desk.data

  const units = useMemo(() => {
    const rows = [...(data?.units ?? [])]
    rows.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return sortAsc ? av - bv : bv - av
    })
    return rows
  }, [data, sortKey, sortAsc])

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc((value) => !value)
    else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  const verdictCounts = useMemo(() => {
    const counts = { rich: 0, market: 0, opportunity: 0, untracked: 0 }
    for (const unit of data?.units ?? []) counts[unit.verdict] += 1
    return counts
  }, [data])

  return (
    <main className="mx-auto max-w-[1500px] px-5 pb-20 pt-28 sm:px-8">
      <div className="mb-10 max-w-4xl">
        <div className="section-kicker">
          <Building2 className="h-4 w-4" />
          Dealer desk · One Exotics Tampa
        </div>
        <h1 className="font-display mt-5 text-5xl leading-[0.96] tracking-[-0.035em] text-white sm:text-7xl">
          Your inventory, priced against the whole market.
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">
          Every unit on the floor scored against live tracked-market medians and observed sell-through velocity —
          what&apos;s priced rich, what&apos;s priced to move, and what the desk actually turns.
        </p>
      </div>

      {data && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ['Units on floor', `${data.summary.activeUnits}${data.summary.pendingSales ? ` · ${data.summary.pendingSales} pending` : ''}`],
            ['Total ask', money(data.summary.totalAsk)],
            ['Median ask', money(data.summary.medianAsk)],
            ['Priced rich', `${verdictCounts.rich} unit${verdictCounts.rich === 1 ? '' : 's'}`],
            ['Priced to move', `${verdictCounts.opportunity} unit${verdictCounts.opportunity === 1 ? '' : 's'}`],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-500">{label}</p>
              <p className="mt-1.5 text-xl font-semibold text-white">{value}</p>
            </div>
          ))}
        </div>
      )}

      {data && (
        <div className="mt-4 flex flex-wrap gap-2">
          {data.summary.makes.map((make) => (
            <span key={make.make} className="rounded-full bg-white/[0.045] px-3 py-1.5 text-xs text-slate-300">
              {make.make} <span className="text-slate-500">· {make.units} ({make.sharePct}%)</span>
            </span>
          ))}
        </div>
      )}

      <div className="mt-8 overflow-x-auto rounded-[2rem] border border-white/[0.08] bg-white/[0.025]">
        <table className="w-full min-w-[1220px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-xs uppercase tracking-[0.16em] text-slate-500">
              <th className="px-5 py-4 font-medium">Unit</th>
              {(
                [
                  ['price', 'Ask'],
                  ['mileage', 'Miles'],
                  ['vsMarketPct', 'Vs market'],
                ] as Array<[SortKey, string]>
              ).map(([key, label]) => (
                <th key={key} className="px-4 py-4 font-medium">
                  <button type="button" onClick={() => toggleSort(key)} className={`inline-flex items-center gap-1.5 transition hover:text-white ${sortKey === key ? 'text-[#d9a8f2]' : ''}`}>
                    {label}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
              ))}
              <th className="px-4 py-4 font-medium">Market median</th>
              <th className="px-4 py-4 font-medium">Demand</th>
              <th className="px-5 py-4 font-medium">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {units.map((unit) => (
              <tr key={unit.id} className="border-b border-white/[0.04] transition hover:bg-white/[0.03]">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    {unit.imageUrl && <img src={unit.imageUrl} alt="" className="h-11 w-16 rounded-lg object-cover" loading="lazy" />}
                    <div>
                      <a href={unit.url ?? '#'} target="_blank" rel="noreferrer" className="font-semibold text-white hover:underline">
                        {unit.year} {unit.make} {unit.model}
                      </a>
                      <p className="mt-0.5 max-w-[420px] truncate text-xs text-slate-500">
                        {unit.trim}
                        {unit.stockno ? ` · #${unit.stockno}` : ''}
                        {unit.pendingSale ? ' · pending sale' : ''}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5 font-semibold text-white">{money(unit.price)}</td>
                <td className="px-4 py-3.5 text-slate-300">{miles(unit.mileage)}</td>
                <td className="px-4 py-3.5">
                  {unit.vsMarketPct != null ? (
                    <span className={unit.vsMarketPct >= 0 ? 'text-rose-300' : 'text-emerald-300'}>
                      {unit.vsMarketPct >= 0 ? '+' : ''}{unit.vsMarketPct.toFixed(1)}%
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                  {unit.marketSample != null && <span className="ml-1.5 text-xs text-slate-600">n={unit.marketSample}</span>}
                </td>
                <td className="px-4 py-3.5 text-slate-300">
                  {money(unit.marketMedian)}
                  {unit.marketBasis === 'year cohort' && <span className="ml-1.5 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-500">±1yr</span>}
                </td>
                <td className="px-4 py-3.5"><DemandChip signal={unit.demandSignal} /></td>
                <td className="px-5 py-3.5"><VerdictChip verdict={unit.verdict} pct={unit.vsMarketPct} matched={Boolean(unit.matchedVariant)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {desk.isLoading && <p className="p-8 text-slate-400">Pulling the dealer feed and scoring the floor…</p>}
        {desk.error && <p className="p-8 text-rose-300">Desk feed unavailable: {desk.error.message}</p>}
      </div>

      {data && data.feedSource === 'tracked listings' && (
        <p className="mt-4 rounded-2xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-xs leading-5 text-amber-200">
          Dealer site feed is unreachable from our servers right now ({data.feedError ?? 'blocked'}), so the floor below is
          reconstructed from tracked aggregator listings carrying the dealer&apos;s name — coverage may be partial. Sold-mix
          history is unavailable in this mode.
        </p>
      )}

      {data && data.soldMix.length > 0 && (
        <div className="mt-12">
          <h2 className="font-display text-3xl tracking-[-0.02em] text-white">What the desk actually turns</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            {data.summary.soldRecords} sold records from the dealer feed, grouped by model line — the desk&apos;s proven wheelhouse.
            Their feed carries no sale dates, so dated velocity starts accumulating from our own snapshots.
          </p>
          <div className="mt-5 overflow-x-auto rounded-[2rem] border border-white/[0.08] bg-white/[0.025]">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-xs uppercase tracking-[0.16em] text-slate-500">
                  <th className="px-5 py-4 font-medium">Model line</th>
                  <th className="px-4 py-4 font-medium">Sold</th>
                  <th className="px-4 py-4 font-medium">Share</th>
                  <th className="px-5 py-4 font-medium">Median price</th>
                </tr>
              </thead>
              <tbody>
                {data.soldMix.slice(0, 15).map((row) => (
                  <tr key={`${row.make}-${row.model}`} className="border-b border-white/[0.04]">
                    <td className="px-5 py-3.5 font-semibold text-white">{row.make} {row.model}</td>
                    <td className="px-4 py-3.5 text-white">{row.count}</td>
                    <td className="px-4 py-3.5 text-slate-400">{Math.round((row.count / data.summary.soldRecords) * 1000) / 10}%</td>
                    <td className="px-5 py-3.5 text-slate-300">{money(row.medianPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="mt-8 text-xs leading-5 text-slate-600">
        Source: oneexoticstampa.com live feed · Market medians and demand signals from tracked-market listings and observed
        sell-through (excludes the dealer&apos;s own units). Verdict bands: rich ≥ +5% over median, under market ≤ −5%.
      </p>
    </main>
  )
}

export default function Desk() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="hero-orb hero-orb-one" />
      <div className="hero-orb hero-orb-two" />
      <header className="absolute inset-x-0 top-0 z-20">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-5 py-5 sm:px-8">
          <Link to="/" className="outline-button !px-3 !py-2" aria-label="Back to landing page">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Highline Index</span>
          </Link>
          <nav className="flex items-center gap-2 text-xs font-medium sm:gap-3 sm:text-sm">
            <Link to="/radar" className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-slate-300 transition hover:bg-white/[0.08]">
              <RadarIcon className="mr-1 inline h-3.5 w-3.5" />
              Radar
            </Link>
            <Link to="/markets" className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-slate-300 transition hover:bg-white/[0.08]">
              Markets
            </Link>
            <Link to="/sold" className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-slate-300 transition hover:bg-white/[0.08]">
              <History className="mr-1 inline h-3.5 w-3.5" />
              Sold
            </Link>
          </nav>
        </div>
      </header>
      <DeskBody />
    </div>
  )
}
