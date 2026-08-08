import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowLeft, ArrowUpDown, BarChart3, Gauge, Radar as RadarIcon, ShieldCheck } from 'lucide-react'
import { trpc } from '@/providers/trpc'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '../../api/router'
import '../App.css'

type RouterOutputs = inferRouterOutputs<AppRouter>
type Market = RouterOutputs['highline']['markets']['markets'][number]

type SortKey = 'activeCount' | 'medianAsk' | 'medianMileage' | 'avgDaysOnMarket' | 'medianDaysToSell' | 'goneLast30d' | 'bestEdgePct'

function money(value?: number | null) {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function miles(value?: number | null) {
  if (value == null) return '—'
  return `${new Intl.NumberFormat('en-US').format(value)}`
}

const columns: Array<{ key: SortKey; label: string }> = [
  { key: 'activeCount', label: 'Inventory' },
  { key: 'medianAsk', label: 'Median ask' },
  { key: 'medianMileage', label: 'Median miles' },
  { key: 'avgDaysOnMarket', label: 'Avg DOM' },
  { key: 'medianDaysToSell', label: 'Days to sell' },
  { key: 'goneLast30d', label: 'Gone ≤30d' },
  { key: 'bestEdgePct', label: 'Best net edge' },
]

function DemandCell({ market }: { market: Market }) {
  if (market.medianDaysToSell == null) {
    return <span className="text-slate-500" title="Not enough sell-through history yet — builds with each refresh">collecting…</span>
  }
  const tone =
    market.demandSignal === 'fast'
      ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300'
      : market.demandSignal === 'balanced'
        ? 'border-amber-300/25 bg-amber-300/10 text-amber-200'
        : 'border-rose-400/25 bg-rose-400/10 text-rose-300'
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="font-semibold text-white">{market.medianDaysToSell}d</span>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] ${tone}`}>{market.demandSignal}</span>
      </div>
      {market.staleCount != null && market.staleCount > 0 && (
        <p className="mt-1 text-[11px] text-amber-200/80">{market.staleCount} stale now</p>
      )}
    </div>
  )
}

function SignalChips({ market }: { market: Market }) {
  const { pursue, inspect, negotiate, pass } = market.actionCounts
  return (
    <div className="flex flex-wrap gap-1.5 text-[11px]">
      {pursue > 0 && <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 text-emerald-300">{pursue} pursue</span>}
      {inspect > 0 && <span className="rounded-full border border-sky-400/25 bg-sky-400/10 px-2 py-0.5 text-sky-300">{inspect} inspect</span>}
      {negotiate > 0 && <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2 py-0.5 text-amber-200">{negotiate} negotiate</span>}
      {pursue + inspect + negotiate === 0 && <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-slate-500">{pass} pass</span>}
    </div>
  )
}

function MarketsHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-[#08080a]/84 backdrop-blur-2xl">
      <div className="mx-auto flex h-[76px] max-w-[1500px] items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-4">
          <Link to="/" className="outline-button !px-3 !py-2" aria-label="Back to landing page">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-[#d7b56d]">Highline Index</p>
            <h1 className="mt-1 text-lg font-semibold text-white">Variant Markets</h1>
          </div>
        </div>
        <Link
          to="/radar"
          className="hidden items-center gap-2 rounded-full border border-[#d7b56d]/30 bg-[#d7b56d]/10 px-3 py-1.5 text-xs text-[#f0d692] transition hover:bg-[#d7b56d]/20 md:flex"
        >
          <RadarIcon className="h-3.5 w-3.5" />
          Deal Radar
        </Link>
      </div>
    </header>
  )
}

function MarketsBody() {
  const marketsQuery = trpc.highline.markets.useQuery(undefined, { refetchInterval: 60_000 })
  const [sortKey, setSortKey] = useState<SortKey>('activeCount')
  const [sortAsc, setSortAsc] = useState(false)
  const [make, setMake] = useState('All')

  const data = marketsQuery.data
  const makes = useMemo(() => ['All', ...new Set((data?.markets ?? []).map((market) => market.make))], [data])

  const rows = useMemo(() => {
    const filtered = (data?.markets ?? []).filter((market) => make === 'All' || market.make === make)
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
          <BarChart3 className="h-4 w-4" />
          Per-variant market reads
        </div>
        <h1 className="font-display mt-5 text-5xl leading-[0.96] tracking-[-0.035em] text-white sm:text-7xl">
          Know the market before the ask.
        </h1>
        <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">
          Every tracked variant, priced against its own live inventory: ask distribution, mileage, days-on-market pressure, and where the current signals sit.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Variants tracked', data?.trackedModels ?? '—'],
          ['Variants with inventory', data?.modelsWithInventory ?? '—'],
          ['Active listings', data?.totalActiveListings ?? '—'],
          ['Computed', data ? new Date(data.computedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '—'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-3xl border border-white/[0.08] bg-white/[0.035] p-5">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
            <p className="mt-2 truncate text-2xl font-semibold text-white">{value}</p>
          </div>
        ))}
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
        <table className="w-full min-w-[1080px] text-left text-sm">
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
              <th className="px-4 py-4 font-medium">Ask spread (P25–P75)</th>
              <th className="px-5 py-4 font-medium">Signals</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((market) => (
              <tr key={market.modelId} className="border-b border-white/[0.04] transition hover:bg-white/[0.03]">
                <td className="px-5 py-4">
                  <p className="font-semibold text-white">
                    {market.modelFamily.toLowerCase() === market.make.toLowerCase() ? market.make : `${market.make} ${market.modelFamily}`}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {market.variant}
                    {market.generation ? ` · ${market.generation}` : ''}
                  </p>
                </td>
                <td className="px-4 py-4 text-white">{market.activeCount}</td>
                <td className="px-4 py-4 font-semibold text-white">{money(market.medianAsk)}</td>
                <td className="px-4 py-4 text-slate-300">{miles(market.medianMileage)}</td>
                <td className="px-4 py-4">
                  {market.avgDaysOnMarket == null ? (
                    <span className="text-slate-500">—</span>
                    ) : (
                    <span className={market.avgDaysOnMarket >= 45 ? 'text-emerald-300' : 'text-slate-300'}>{market.avgDaysOnMarket}d</span>
                  )}
                </td>
                <td className="px-4 py-4">
                  <DemandCell market={market} />
                </td>
                <td className="px-4 py-4 text-slate-300">
                  {market.goneLast30d}
                  <span className="ml-1.5 text-[11px] text-slate-500">of {market.delistedObserved} obs</span>
                </td>
                <td className="px-4 py-4">
                  {market.bestEdgePct == null ? (
                    <span className="text-slate-500">—</span>
                  ) : (
                    <span className={`font-semibold ${market.bestEdgePct >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                      {market.bestEdgePct >= 0 ? '+' : ''}
                      {market.bestEdgePct.toFixed(1)}%
                    </span>
                  )}
                </td>
                <td className="px-4 py-4 text-slate-300">
                  {money(market.p25Ask)}–{money(market.p75Ask)}
                </td>
                <td className="px-5 py-4">
                  <SignalChips market={market} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {marketsQuery.isLoading && <p className="p-8 text-slate-400">Computing variant markets…</p>}
        {marketsQuery.error && <p className="p-8 text-rose-300">Market stats unavailable: {marketsQuery.error.message}</p>}
        {data && rows.length === 0 && !marketsQuery.isLoading && (
          <p className="p-8 text-slate-400">No live inventory for this filter yet — run a refresh on the Deal Radar.</p>
        )}
      </div>

      <div className="mt-8 flex flex-col items-start justify-between gap-4 rounded-[2rem] border border-white/[0.08] bg-white/[0.03] p-6 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-[#f0d692]" />
          <p className="max-w-2xl text-sm leading-6 text-slate-400">
            High days-on-market with flat ask spreads means sellers are anchoring — that's where negotiate signals concentrate. Tight spreads with low DOM mean efficient pricing; edge there is rare and usually provenance-driven.
          </p>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">
            <span className="text-slate-400">Days to sell</span> is the observed median time a variant's listings sat before leaving the feed — usually sold, occasionally withdrawn. "Gone ≤30d" counts recent exits; "stale now" flags live listings sitting past 1.5× the typical sell time. History builds with every refresh.
          </p>
        </div>
        <Link to="/radar" className="luxury-button shrink-0 px-5 py-3">
          <Gauge className="h-4 w-4" />
          Open Deal Radar
        </Link>
      </div>
    </main>
  )
}

export default function Markets() {
  return (
    <main className="min-h-screen bg-[#08080a] text-white">
      <MarketsHeader />
      <MarketsBody />
    </main>
  )
}
