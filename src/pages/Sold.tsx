import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, ArrowUpDown, Gavel, History, Radar as RadarIcon, TrendingDown, TrendingUp } from 'lucide-react'
import { trpc } from '@/providers/trpc'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '../../api/router'
import '../App.css'

type RouterOutputs = inferRouterOutputs<AppRouter>
type SoldListing = RouterOutputs['highline']['sold']['listings'][number]

type WindowDays = 30 | 90 | 180
type SortKey = 'exitCount' | 'medianExitAsk' | 'medianDaysToSell' | 'medianActiveAsk' | 'askDriftPct'

const windowOptions: Array<{ value: WindowDays; label: string }> = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '6 months' },
]

const columns: Array<{ key: SortKey; label: string }> = [
  { key: 'exitCount', label: 'Exits' },
  { key: 'medianExitAsk', label: 'Median exit ask' },
  { key: 'medianDaysToSell', label: 'Days to sell' },
  { key: 'medianActiveAsk', label: 'Median ask now' },
  { key: 'askDriftPct', label: 'Ask drift' },
]

function money(value?: number | null) {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function miles(value?: number | null) {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US').format(value)
}

function shortDate(iso?: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function DriftChip({ pct, suffix }: { pct: number | null; suffix?: string }) {
  if (pct == null) return <span className="text-slate-600">—</span>
  const appreciating = pct >= 2
  const depreciating = pct <= -2
  const tone = appreciating
    ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
    : depreciating
      ? 'border-rose-400/25 bg-rose-400/10 text-rose-300'
      : 'border-white/[0.08] bg-white/[0.04] text-slate-400'
  const Icon = appreciating ? TrendingUp : depreciating ? TrendingDown : TrendingUp
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${tone}`}>
      <Icon className="h-3 w-3" />
      {pct >= 0 ? '+' : ''}
      {pct.toFixed(1)}%{suffix ?? ''}
    </span>
  )
}

/** On-demand BaT sold-trend loader — each load costs 2 parse.bot credits (cached 24h server-side). */
function BatTrendCell({ modelId }: { modelId: number }) {
  const [requested, setRequested] = useState(false)
  const trend = trpc.highline.batTrendCompare.useQuery({ modelId }, { enabled: requested, staleTime: 600_000, retry: false })

  if (!requested) {
    return (
      <button type="button" onClick={() => setRequested(true)} className="outline-button !px-3 !py-1.5 text-xs">
        <Gavel className="h-3 w-3" />
        BaT sold trend
      </button>
    )
  }
  if (trend.isLoading || trend.isFetching) return <span className="text-xs text-slate-500">Loading sold prices…</span>
  const data = trend.data
  if (!data || data.configured === false) return <span className="text-xs text-slate-600">Parse.bot key not set</span>
  if (!data.matched) return <span className="max-w-40 text-xs text-slate-600">{data.error ?? 'No BaT coverage'}</span>

  return (
    <div className="space-y-1 text-xs">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold text-white">{money(data.recentMedian)}</span>
        <span className="text-slate-500">
          last {data.recentCount ?? '—'} sales{data.recentSpanStart ? ` · since ${data.recentSpanStart.slice(0, 7)}` : ''}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-slate-300">{money(data.allTimeMedian)}</span>
        <span className="text-slate-500">all-time · {data.allTimeCount ?? '—'} sales</span>
      </div>
      <DriftChip pct={data.driftPct} suffix=" vs norm" />
    </div>
  )
}

function SoldHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-[#08080a]/84 backdrop-blur-2xl">
      <div className="mx-auto flex h-[76px] max-w-[1500px] items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-4">
          <Link to="/" className="outline-button !px-3 !py-2" aria-label="Back to landing page">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-[#d7b56d]">Highline Index</p>
            <h1 className="mt-1 text-lg font-semibold text-white">Sold &amp; Departed</h1>
          </div>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <Link
            to="/markets"
            className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/[0.08]"
          >
            Markets
          </Link>
          <Link
            to="/radar"
            className="flex items-center gap-2 rounded-full border border-[#d7b56d]/30 bg-[#d7b56d]/10 px-3 py-1.5 text-xs text-[#f0d692] transition hover:bg-[#d7b56d]/20"
          >
            <RadarIcon className="h-3.5 w-3.5" />
            Deal Radar
          </Link>
        </div>
      </div>
    </header>
  )
}

function SoldFeedCard({ listing }: { listing: SoldListing }) {
  const body = (
    <>
      <div className="relative h-40 overflow-hidden bg-gradient-to-br from-[#20180b] via-[#0d0d10] to-[#08080a]">
        {listing.imageUrl ? (
          <img src={listing.imageUrl} alt={listing.title} className="h-full w-full object-cover opacity-80" loading="lazy" />
        ) : (
          <div className="grid h-full place-items-center">
            <History className="h-8 w-8 text-[#d7b56d]/50" />
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-full border border-white/[0.1] bg-black/60 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-300 backdrop-blur">
          left {shortDate(listing.leftMarketAt)}
        </span>
      </div>
      <div className="p-4">
        <p className="truncate font-semibold text-white">{listing.title}</p>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {[listing.variant, listing.city && listing.state ? `${listing.city}, ${listing.state}` : listing.state].filter(Boolean).join(' · ')}
        </p>
        <div className="mt-3 flex items-end justify-between gap-2 text-sm">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Last ask</p>
            <p className="font-semibold text-white">{money(listing.price)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Sold in</p>
            <p className="font-semibold text-white">{listing.daysToSell != null ? `${listing.daysToSell}d` : '—'}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Miles</p>
            <p className="font-semibold text-white">{miles(listing.mileage)}</p>
          </div>
        </div>
        <p className="mt-3 text-[10px] uppercase tracking-[0.14em] text-slate-600">{listing.source}</p>
      </div>
    </>
  )
  const className =
    'block overflow-hidden rounded-[1.5rem] border border-white/[0.08] bg-white/[0.03] transition hover:border-[#d7b56d]/30'
  return listing.url ? (
    <a href={listing.url} target="_blank" rel="noreferrer" className={className}>
      {body}
    </a>
  ) : (
    <div className={className}>{body}</div>
  )
}

function SoldBody() {
  const [windowDays, setWindowDays] = useState<WindowDays>(90)
  const [make, setMake] = useState('All')
  const [sortKey, setSortKey] = useState<SortKey>('exitCount')
  const [sortAsc, setSortAsc] = useState(false)

  const sold = trpc.highline.sold.useQuery({ days: windowDays, limit: 200 }, { refetchInterval: 120_000 })
  const data = sold.data

  const makes = useMemo(() => ['All', ...new Set((data?.trends ?? []).map((trend) => trend.make))], [data])
  const rows = useMemo(() => {
    const filtered = (data?.trends ?? []).filter((trend) => make === 'All' || trend.make === make)
    return [...filtered].sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      return sortAsc ? av - bv : bv - av
    })
  }, [data, make, sortKey, sortAsc])

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) setSortAsc((value) => !value)
    else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  return (
    <main className="mx-auto max-w-[1500px] px-5 pb-20 pt-28 sm:px-8">
      <div className="mb-10 max-w-4xl">
        <div className="section-kicker">
          <History className="h-4 w-4" />
          Exit history &amp; value trajectory
        </div>
        <h1 className="font-display mt-5 text-5xl leading-[0.96] tracking-[-0.035em] text-white sm:text-7xl">
          What sold, how fast, and which way the money is moving.
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">
          Cars that left the market — usually sold, occasionally withdrawn — with their last advertised ask and time-to-sell.
          For true transaction prices and 1–3 year appreciation, load the Bring a Trailer sold trend per variant.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-2">
          {windowOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setWindowDays(option.value)}
              className={`rounded-full px-4 py-2 text-sm transition ${windowDays === option.value ? 'bg-[#d7b56d] font-semibold text-black' : 'bg-white/[0.045] text-slate-300 hover:bg-white/[0.08]'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          {data ? `${data.totalExits} exits in window · ${data.variantsWithExits} variants` : 'Loading…'}
          {data ? ` · computed ${new Date(data.computedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {makes.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setMake(item)}
            className={`rounded-full px-4 py-2 text-sm transition ${make === item ? 'bg-[#d7b56d] font-semibold text-black' : 'bg-white/[0.045] text-slate-300 hover:bg-white/[0.08]'}`}
          >
            {item === 'Mercedes-Benz' ? 'G-Class' : item}
          </button>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto rounded-[2rem] border border-white/[0.08] bg-white/[0.025]">
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead>
            <tr className="border-b border-white/[0.06] text-xs uppercase tracking-[0.16em] text-slate-500">
              <th className="px-5 py-4 font-medium">Variant</th>
              {columns.map((column) => (
                <th key={column.key} className="px-4 py-4 font-medium">
                  <button type="button" onClick={() => toggleSort(column.key)} className={`inline-flex items-center gap-1.5 transition hover:text-white ${sortKey === column.key ? 'text-[#f0d692]' : ''}`}>
                    {column.label}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
              ))}
              <th className="px-5 py-4 font-medium">Sold-price trend (BaT)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((trend) => (
              <tr key={trend.modelId} className="border-b border-white/[0.04] transition hover:bg-white/[0.03]">
                <td className="px-5 py-4">
                  <p className="font-semibold text-white">
                    {trend.modelFamily.toLowerCase() === trend.make.toLowerCase() ? trend.make : `${trend.make} ${trend.modelFamily}`}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {trend.variant}
                    {trend.generation ? ` · ${trend.generation}` : ''}
                  </p>
                </td>
                <td className="px-4 py-4 text-white">{trend.exitCount}</td>
                <td className="px-4 py-4 font-semibold text-white">{money(trend.medianExitAsk)}</td>
                <td className="px-4 py-4 text-slate-300">{trend.medianDaysToSell != null ? `${trend.medianDaysToSell}d` : '—'}</td>
                <td className="px-4 py-4 text-slate-300">{money(trend.medianActiveAsk)}</td>
                <td className="px-4 py-4">
                  <DriftChip pct={trend.askDriftPct} />
                </td>
                <td className="px-5 py-4">
                  <BatTrendCell modelId={trend.modelId} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {sold.isLoading && <p className="p-8 text-slate-400">Compiling exit history…</p>}
        {sold.error && <p className="p-8 text-rose-300">Exit history unavailable: {sold.error.message}</p>}
        {data && rows.length === 0 && !sold.isLoading && (
          <p className="p-8 text-slate-400">No exits recorded in this window yet — history builds with every refresh.</p>
        )}
      </div>

      <p className="mt-4 max-w-3xl text-xs leading-5 text-slate-600">
        Ask drift compares today's median ask to the median ask of cars that left — positive means asks are climbing, but cheap-cars-sell-first mix shifts can move it too. The BaT trend compares actual median sold prices over 1 vs 3 years (the 3-year window includes the last year, so it's smoothed momentum, not a clean CAGR).
      </p>

      <h2 className="font-display mt-14 text-3xl tracking-[-0.02em] text-white sm:text-4xl">Recently departed</h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {(data?.listings ?? [])
          .filter((listing) => make === 'All' || listing.make === make)
          .slice(0, 60)
          .map((listing) => (
            <SoldFeedCard key={listing.id} listing={listing} />
          ))}
      </div>
      {data && data.listings.length === 0 && !sold.isLoading && (
        <p className="mt-6 rounded-[2rem] border border-white/[0.08] bg-white/[0.03] p-8 text-slate-400">
          No departed cars in this window yet.
        </p>
      )}
    </main>
  )
}

export default function Sold() {
  return (
    <main className="min-h-screen bg-[#08080a] text-white">
      <SoldHeader />
      <SoldBody />
    </main>
  )
}
