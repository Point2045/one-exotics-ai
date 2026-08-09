import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  Check,
  Database,
  ExternalLink,
  Gauge,
  KeyRound,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  X,
} from 'lucide-react'
import { trpc } from '@/providers/trpc'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '../../api/router'
import '../App.css'

type RouterOutputs = inferRouterOutputs<AppRouter>
type Deal = RouterOutputs['highline']['deals'][number]

type ActionFilter = 'all' | 'pursue' | 'inspect' | 'negotiate' | 'pass'
type DealAction = Exclude<ActionFilter, 'all'>

const makeFilters = ['All', 'Ferrari', 'Lamborghini', 'Aston Martin', 'Mercedes-Benz', 'Porsche']
const actionFilters: Array<{ value: ActionFilter; label: string }> = [
  { value: 'all', label: 'All signals' },
  { value: 'pursue', label: 'Pursue' },
  { value: 'inspect', label: 'Inspect' },
  { value: 'negotiate', label: 'Negotiate' },
  { value: 'pass', label: 'Pass' },
]

const domPresets = [
  { value: 'any', label: 'Any DOM', min: undefined, max: undefined },
  { value: 'fresh', label: 'Fresh · <14d', min: undefined, max: 14 },
  { value: 'mid', label: '14–45d', min: 14, max: 45 },
  { value: 'stale', label: 'Stale · 45d+', min: 45, max: undefined },
] as const
type DomPreset = (typeof domPresets)[number]['value']

function FilterNumberInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs text-slate-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^0-9]/g, ''))}
        inputMode="numeric"
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-white/[0.08] bg-black/25 px-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-[#d7b56d]/50"
      />
    </label>
  )
}

function ToggleChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-xs transition ${active ? 'border-[#d7b56d]/50 bg-[#d7b56d]/12 text-[#f0d692]' : 'border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-white'}`}
    >
      {children}
    </button>
  )
}

function money(value?: number | null) {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

function miles(value?: number | null) {
  if (value == null) return '—'
  return `${new Intl.NumberFormat('en-US').format(value)} mi`
}

function pct(value?: string | number | null) {
  if (value == null || value === '') return '—'
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '—'
  return `${parsed >= 0 ? '+' : ''}${parsed.toFixed(1)}%`
}

function dateTime(value?: Date | string | null) {
  if (!value) return 'Never'
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function actionClasses(action?: DealAction) {
  if (action === 'pursue') return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
  if (action === 'inspect') return 'border-sky-400/30 bg-sky-400/10 text-sky-300'
  if (action === 'negotiate') return 'border-amber-300/30 bg-amber-300/10 text-amber-200'
  return 'border-white/10 bg-white/[0.04] text-slate-400'
}

function actionLabel(action?: DealAction) {
  if (!action) return 'Unrated'
  return action.charAt(0).toUpperCase() + action.slice(1)
}

function daysListed(listedAt?: Date | string | null) {
  if (!listedAt) return null
  const days = Math.max(0, Math.round((Date.now() - new Date(listedAt).getTime()) / 86_400_000))
  return days
}

function ProvenanceBadges({ deal }: { deal: Deal }) {
  const dom = daysListed(deal.listedAt)
  const accidents = deal.accidentCount ?? 0
  const usage = deal.usageType?.toLowerCase() ?? ''
  const fleet = usage.includes('rental') || usage.includes('fleet') || usage.includes('commercial')
  return (
    <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
      {dom != null && (
        <span
          className={`rounded-full border px-2.5 py-1 ${dom >= 60 ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : dom >= 21 ? 'border-amber-300/25 bg-amber-300/10 text-amber-200' : 'border-white/[0.08] bg-white/[0.04] text-slate-400'}`}
        >
          {dom === 0 ? 'Listed today' : `${dom}d on market`}
        </span>
      )}
      {deal.cpo && <span className="rounded-full border border-[#d7b56d]/30 bg-[#d7b56d]/10 px-2.5 py-1 text-[#f0d692]">Factory CPO</span>}
      {accidents > 0 && (
        <span className="rounded-full border border-rose-400/25 bg-rose-400/10 px-2.5 py-1 text-rose-300">
          {accidents} accident{accidents > 1 ? 's' : ''}
        </span>
      )}
      {deal.ownerCount === 1 && <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-slate-300">1 owner</span>}
      {(deal.ownerCount ?? 0) >= 4 && (
        <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-amber-200">{deal.ownerCount} owners</span>
      )}
      {fleet && <span className="rounded-full border border-rose-400/25 bg-rose-400/10 px-2.5 py-1 text-rose-300">Fleet / rental history</span>}
    </div>
  )
}

function RadarHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-white/[0.06] bg-[#08080a]/84 backdrop-blur-2xl">
      <div className="mx-auto flex h-[76px] max-w-[1500px] items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-4">
          <Link to="/" className="outline-button !px-3 !py-2" aria-label="Back to landing page">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <p className="text-[11px] uppercase tracking-[0.3em] text-[#d7b56d]">Highline Index</p>
            <h1 className="mt-1 text-lg font-semibold text-white">Live Deal Radar</h1>
          </div>
        </div>
        <div className="hidden items-center gap-3 text-xs text-slate-400 md:flex">
          <Link to="/markets" className="rounded-full border border-[#d7b56d]/30 bg-[#d7b56d]/10 px-3 py-1.5 text-[#f0d692] transition hover:bg-[#d7b56d]/20">
            Markets
          </Link>
          <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5">United States</span>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-emerald-300">Auto.dev-ready</span>
        </div>
      </div>
    </header>
  )
}

function ProviderPanel({ refresh }: { refresh: () => void }) {
  const summary = trpc.highline.summary.useQuery(undefined, { refetchInterval: 60_000 })
  const configured = summary.data?.provider.configured
  const persistence = summary.data?.persistence

  return (
    <section className={`rounded-[2rem] border p-6 ${configured ? 'border-emerald-400/20 bg-emerald-400/[0.06]' : 'border-amber-200/20 bg-amber-200/[0.06]'}`}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${configured ? 'bg-emerald-400/10 text-emerald-300' : 'bg-amber-300/10 text-amber-200'}`}>
            {configured ? <Database className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
          </span>
          <div>
            <p className={`text-xs uppercase tracking-[0.24em] ${configured ? 'text-emerald-300' : 'text-amber-200'}`}>
              {configured ? 'Live provider configured' : 'Demo mode · API key required'}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              {configured ? 'Auto.dev ingestion is ready.' : 'Add the server-side Auto.dev key to activate real listings.'}
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
              {configured
                ? 'Refresh pulls the first U.S. results across all Ferrari, Lamborghini, Aston Martin, G-Class, and Porsche 911 search groups, then scores all-in edge.'
                : 'The database and valuation pipeline are built. Set AUTO_DEV_API_KEY in the server environment, press refresh, and demo listings will be retired automatically when live inventory arrives.'}
            </p>
            {persistence ? (
              <p className="mt-3 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1 text-xs text-slate-400">
                <Database className="h-3.5 w-3.5" />
                Persistence: {persistence.label}
              </p>
            ) : null}
            {summary.data?.integrations && (
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {([
                  ['Auto.dev · listings', summary.data.integrations.autoDev],
                  ['MarketCheck · sell-through', summary.data.integrations.marketCheck],
                  ['BaT · sold comps', summary.data.integrations.parseBotBat],
                ] as const).map(([label, on]) => (
                  <span
                    key={label}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 ${on ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-300' : 'border-white/[0.08] bg-white/[0.04] text-slate-500'}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${on ? 'bg-emerald-300' : 'bg-slate-600'}`} />
                    {label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <button type="button" onClick={refresh} className="luxury-button shrink-0 justify-center px-5 py-3">
          <RefreshCw className="h-4 w-4" />
          Refresh listings
        </button>
      </div>
    </section>
  )
}

function SummaryStrip() {
  const summary = trpc.highline.summary.useQuery(undefined, { refetchInterval: 60_000 })
  const data = summary.data
  const cards = [
    ['Supported variants', data?.supportedModels ?? '—'],
    ['Active listings', data?.activeListings ?? '—'],
    ['Pursue signals', data?.actionCounts.pursue ?? '—'],
    ['Last refresh', dateTime(data?.lastRun?.startedAt)],
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(([label, value]) => (
        <div key={label} className="rounded-3xl border border-white/[0.08] bg-white/[0.035] p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{label}</p>
          <p className="mt-2 truncate text-2xl font-semibold text-white">{value}</p>
        </div>
      ))}
    </div>
  )
}

function VinDecoder() {
  const [vin, setVin] = useState('')
  const [submittedVin, setSubmittedVin] = useState('')
  const decoded = trpc.highline.decodeVin.useQuery(
    { vin: submittedVin },
    { enabled: submittedVin.length === 17, retry: false },
  )

  const submit = () => {
    const normalized = vin.trim().toUpperCase()
    if (normalized.length === 17) setSubmittedVin(normalized)
  }

  return (
    <section className="rounded-[2rem] border border-white/[0.08] bg-white/[0.03] p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-[#d7b56d]/10 text-[#f0d692]">
          <Gauge className="h-5 w-5" />
        </span>
        <div>
          <h2 className="text-xl font-semibold text-white">VIN intelligence report</h2>
          <p className="text-sm text-slate-500">Auto.dev decode + NHTSA vPIC, recalls & owner complaints.</p>
        </div>
      </div>
      <div className="mt-5 flex gap-3">
        <input
          value={vin}
          onChange={(event) => setVin(event.target.value.toUpperCase())}
          maxLength={17}
          placeholder="Enter 17-character VIN"
          className="h-12 min-w-0 flex-1 rounded-2xl border border-white/[0.08] bg-black/25 px-4 text-sm uppercase tracking-[0.08em] text-white outline-none placeholder:text-slate-600 focus:border-[#d7b56d]/50"
        />
        <button type="button" onClick={submit} className="luxury-button px-5">
          Decode
        </button>
      </div>
      {decoded.isFetching && <p className="mt-4 text-sm text-slate-400">Decoding…</p>}
      {decoded.error && <p className="mt-4 text-sm text-rose-300">{decoded.error.message}</p>}
      {decoded.data && <VinReportCard report={decoded.data} />}
    </section>
  )
}

type VinReport = RouterOutputs['highline']['decodeVin']

function VinReportCard({ report }: { report: VinReport }) {
  return (
    <div className="mt-5 space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        {report.checksum === true && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-emerald-300">
            <Check className="h-3 w-3" /> Checksum valid
          </span>
        )}
        {report.checksum === false && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/25 bg-rose-400/10 px-2.5 py-1 text-rose-300">
            <ShieldAlert className="h-3 w-3" /> Fails checksum — possible typo or cloned VIN
          </span>
        )}
        {report.origin && <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-slate-300">{report.origin}</span>}
        {report.recalls.length > 0 ? (
          <span className="rounded-full border border-amber-300/25 bg-amber-300/10 px-2.5 py-1 text-amber-200">
            {report.recalls.length} open recall{report.recalls.length > 1 ? 's' : ''}
          </span>
        ) : (
          <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-emerald-300">No open recalls</span>
        )}
        <span className={`rounded-full border px-2.5 py-1 ${report.complaints.count > 10 ? 'border-amber-300/25 bg-amber-300/10 text-amber-200' : 'border-white/[0.08] bg-white/[0.04] text-slate-300'}`}>
          {report.complaints.count} owner complaint{report.complaints.count === 1 ? '' : 's'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        {[
          ['Vehicle', `${report.year ?? ''} ${report.make ?? ''} ${report.model ?? ''}`],
          ['Trim', report.trim],
          ['Body', report.bodyClass],
          ['Drive', report.driveType],
          ['Engine', report.engine ?? (report.engineCylinders ? `${report.engineCylinders} cyl` : undefined)],
          ['Transmission', report.transmission],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-white/[0.04] p-3">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="mt-1 font-medium text-white">{value || '—'}</p>
          </div>
        ))}
      </div>

      {report.recalls.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">Open recalls</p>
          {report.recalls.slice(0, 4).map((recall) => (
            <div key={recall.campaignNumber ?? recall.component} className="rounded-2xl border border-amber-300/15 bg-amber-300/[0.05] p-3 text-sm">
              <p className="font-medium text-amber-100">{recall.component ?? 'Component unknown'}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{recall.summary}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                {[recall.campaignNumber, recall.date, recall.parkIt ? 'Park it — do not drive' : null].filter(Boolean).join(' · ')}
              </p>
            </div>
          ))}
        </div>
      )}

      {report.complaints.samples.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Complaint themes</p>
          {report.complaints.samples.map((complaint, index) => (
            <div key={index} className="rounded-2xl bg-white/[0.035] p-3 text-sm">
              <p className="text-xs font-medium text-slate-300">{complaint.components ?? 'General'}</p>
              <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{complaint.summary}</p>
            </div>
          ))}
        </div>
      )}

      <p className="text-[11px] leading-5 text-slate-600">
        Sources: {report.sources.join(' · ') || 'none'}
        {report.errors.length > 0 ? ` — degraded: ${report.errors[0]}` : ''}
      </p>
    </div>
  )
}

function DealImage({ imageUrl, title }: { imageUrl?: string | null; title: string }) {
  if (!imageUrl) {
    return (
      <div className="grid h-full min-h-52 place-items-center bg-gradient-to-br from-[#20180b] via-[#0d0d10] to-[#08080a]">
        <Gauge className="h-10 w-10 text-[#d7b56d]/60" />
      </div>
    )
  }
  return <img src={imageUrl} alt={title} className="h-full min-h-52 w-full object-cover" loading="lazy" />
}

function DealCard({ deal, selected, onSelect }: { deal: Deal; selected: boolean; onSelect: () => void }) {
  const valuation = deal.valuation
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group overflow-hidden rounded-[1.75rem] border text-left transition duration-200 hover:-translate-y-1 ${selected ? 'border-[#d7b56d]/55 bg-[#d7b56d]/[0.08] shadow-[0_24px_70px_rgba(0,0,0,0.32)]' : 'border-white/[0.08] bg-white/[0.035] hover:border-[#d7b56d]/30'}`}
    >
      <div className="grid md:grid-cols-[220px_1fr]">
        <div className="relative overflow-hidden">
          <DealImage imageUrl={deal.imageUrl} title={deal.title} />
          <span className="absolute left-4 top-4 rounded-full bg-black/55 px-3 py-1 text-xs text-white backdrop-blur-xl">{deal.source}</span>
        </div>
        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold text-white">{deal.title}</h3>
              <p className="mt-1 text-sm text-slate-500">
                {[deal.city, deal.state].filter(Boolean).join(', ') || 'Location unavailable'} · {deal.sellerName || 'Seller unavailable'}
              </p>
            </div>
            <span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${actionClasses(valuation?.action)}`}>
              {actionLabel(valuation?.action)}
            </span>
          </div>

          <ProvenanceBadges deal={deal} />

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-xs text-slate-500">Ask</p>
              <p className="mt-1 text-lg font-semibold text-white">{money(deal.price)}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Fair range</p>
              <p className="mt-1 text-sm font-semibold text-white">
                {money(valuation?.fairValueLow)}–{money(valuation?.fairValueHigh)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Net edge</p>
              <p className={`mt-1 text-lg font-semibold ${Number(valuation?.netEdgePct) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                {pct(valuation?.netEdgePct)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Confidence</p>
              <p className="mt-1 text-lg font-semibold text-white">{valuation?.confidence ?? '—'}%</p>
            </div>
          </div>

          <p className="mt-4 line-clamp-2 text-sm leading-6 text-slate-400">{valuation?.rationale}</p>
        </div>
      </div>
    </button>
  )
}

function DetailPanel({ id, onClose }: { id: number; onClose: () => void }) {
  const detail = trpc.highline.listing.useQuery({ id })
  const data = detail.data
  const valuation = data?.valuations?.[0]
  const modelId = data?.supportedModel?.id
  const batComps = trpc.highline.batComps.useQuery({ modelId: modelId ?? 0 }, { enabled: Boolean(modelId), staleTime: 300_000 })
  const vin = data?.vin && data.vin.length === 17 ? data.vin : undefined
  const vinHistory = trpc.highline.vinHistory.useQuery({ vin: vin ?? '' }, { enabled: Boolean(vin), staleTime: 300_000 })

  return (
    <aside className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-auto rounded-[2rem] border border-white/[0.08] bg-[#0d0d10] p-6 shadow-[0_30px_100px_rgba(0,0,0,0.42)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-[#d7b56d]">Decision memo</p>
          <h2 className="mt-2 text-2xl font-semibold text-white">{data?.title ?? 'Loading…'}</h2>
        </div>
        <button type="button" onClick={onClose} className="outline-button !p-2" aria-label="Close detail">
          <X className="h-4 w-4" />
        </button>
      </div>

      {detail.isLoading && <p className="mt-6 text-sm text-slate-400">Loading listing detail…</p>}
      {data && (
        <div className="mt-6 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/[0.04] p-4">
              <p className="text-xs text-slate-500">All-in acquisition</p>
              <p className="mt-1 text-lg font-semibold text-white">{money(valuation?.acquisitionCost)}</p>
            </div>
            <div className="rounded-2xl bg-white/[0.04] p-4">
              <p className="text-xs text-slate-500">Estimated selling cost</p>
              <p className="mt-1 text-lg font-semibold text-white">{money(valuation?.sellingCost)}</p>
            </div>
            <div className="rounded-2xl bg-white/[0.04] p-4">
              <p className="text-xs text-slate-500">Mileage</p>
              <p className="mt-1 text-lg font-semibold text-white">{miles(data.mileage)}</p>
            </div>
            <div className="rounded-2xl bg-white/[0.04] p-4">
              <p className="text-xs text-slate-500">Risk score</p>
              <p className="mt-1 text-lg font-semibold text-white">{valuation?.riskScore ?? '—'}/100</p>
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-5 w-5 text-amber-200" />
              <h3 className="font-semibold text-white">Why this call</h3>
            </div>
            <p className="mt-3 text-sm leading-6 text-slate-400">{valuation?.rationale}</p>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Provenance</h3>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/[0.04] p-4">
                <p className="text-xs text-slate-500">Days on market</p>
                <p className="mt-1 text-lg font-semibold text-white">
                  {daysListed(data.listedAt) != null ? `${daysListed(data.listedAt)}d` : '—'}
                </p>
              </div>
              <div className="rounded-2xl bg-white/[0.04] p-4">
                <p className="text-xs text-slate-500">Reported accidents</p>
                <p className={`mt-1 text-lg font-semibold ${(data.accidentCount ?? 0) > 0 ? 'text-rose-300' : 'text-white'}`}>
                  {data.accidentCount ?? '—'}
                </p>
              </div>
              <div className="rounded-2xl bg-white/[0.04] p-4">
                <p className="text-xs text-slate-500">Prior owners</p>
                <p className="mt-1 text-lg font-semibold text-white">{data.ownerCount ?? '—'}</p>
              </div>
              <div className="rounded-2xl bg-white/[0.04] p-4">
                <p className="text-xs text-slate-500">Use history</p>
                <p className="mt-1 text-lg font-semibold capitalize text-white">{data.usageType?.toLowerCase() ?? '—'}</p>
              </div>
              <div className="rounded-2xl bg-white/[0.04] p-4">
                <p className="text-xs text-slate-500">Photos</p>
                <p className={`mt-1 text-lg font-semibold ${data.photoCount != null && data.photoCount < 8 ? 'text-amber-200' : 'text-white'}`}>
                  {data.photoCount ?? '—'}
                </p>
              </div>
              <div className="rounded-2xl bg-white/[0.04] p-4">
                <p className="text-xs text-slate-500">Certification</p>
                <p className={`mt-1 text-lg font-semibold ${data.cpo ? 'text-[#f0d692]' : 'text-white'}`}>{data.cpo ? 'Factory CPO' : 'None'}</p>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Spec</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {[data.exteriorColor, data.interiorColor, data.transmission, data.drivetrain, data.supportedModel?.variant].filter(Boolean).map((item) => (
                <span key={String(item)} className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300">
                  {String(item)}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Price observations</h3>
            <div className="mt-3 space-y-2">
              {data.priceHistory.slice(0, 5).map((history) => (
                <div key={history.id} className="flex items-center justify-between rounded-2xl bg-white/[0.035] px-4 py-3 text-sm">
                  <span className="text-slate-400">{dateTime(history.observedAt)}</span>
                  <span className="font-semibold text-white">{money(history.price)}</span>
                </div>
              ))}
            </div>
          </div>

          {batComps.data?.configured === true && batComps.data.matched && (
            <div className="rounded-2xl border border-[#d7b56d]/20 bg-[#d7b56d]/[0.05] p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#f0d692]">
                Sold comps · Bring a Trailer ({batComps.data.windowYears}yr)
              </h3>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-black/25 p-2.5">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Median sold</p>
                  <p className="mt-1 text-sm font-semibold text-white">{money(batComps.data.medianSold)}</p>
                </div>
                <div className="rounded-xl bg-black/25 p-2.5">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Average</p>
                  <p className="mt-1 text-sm font-semibold text-white">{money(batComps.data.averageSold)}</p>
                </div>
                <div className="rounded-xl bg-black/25 p-2.5">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Sales</p>
                  <p className="mt-1 text-sm font-semibold text-white">{batComps.data.sampleCount ?? '—'}</p>
                </div>
              </div>
              {batComps.data.recentSales.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {batComps.data.recentSales.map((sale, index) => (
                    <div key={index} className="flex items-center justify-between gap-3 rounded-xl bg-black/25 px-3 py-2 text-xs">
                      <span className="min-w-0 truncate text-slate-400">{sale.title}</span>
                      <span className="shrink-0 font-medium text-white">
                        {money(sale.soldPrice)}
                        {sale.date ? <span className="ml-1.5 text-slate-500">{sale.date.slice(0, 10)}</span> : null}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-3 text-[10px] text-slate-600">Actual auction transact prices · {batComps.data.source}</p>
            </div>
          )}

          {vinHistory.data?.configured === true && vinHistory.data.points.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">This VIN's listing history</h3>
              <div className="mt-3 space-y-1.5">
                {[...vinHistory.data.points].slice(-6).reverse().map((point) => (
                  <div key={point.date} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.035] px-3 py-2 text-xs">
                    <span className="text-slate-500">{point.date}</span>
                    <span className="font-medium text-white">{money(point.price)}</span>
                    <span className="text-slate-500">{point.miles != null ? `${miles(point.miles)} mi` : ''}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-slate-600">Price/mileage each time this VIN was listed · {vinHistory.data.source}</p>
            </div>
          )}

          {data.url && (
            <a href={data.url} target="_blank" rel="noreferrer" className="luxury-button w-full justify-center px-5 py-3">
              Open source listing
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          {data.carfaxUrl && (
            <a href={data.carfaxUrl} target="_blank" rel="noreferrer" className="outline-button w-full justify-center px-5 py-3">
              View CARFAX report
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
      )}
    </aside>
  )
}

function RadarBody() {
  const [make, setMake] = useState('All')
  const [action, setAction] = useState<ActionFilter>('all')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [dom, setDom] = useState<DomPreset>('any')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [maxMileage, setMaxMileage] = useState('')
  const [minYear, setMinYear] = useState('')
  const [cpoOnly, setCpoOnly] = useState(false)
  const [accidentFreeOnly, setAccidentFreeOnly] = useState(false)
  const [singleOwnerOnly, setSingleOwnerOnly] = useState(false)
  const [excludeRentalFleet, setExcludeRentalFleet] = useState(false)
  const utils = trpc.useUtils()

  const activeFilterCount =
    (dom !== 'any' ? 1 : 0) +
    (minPrice ? 1 : 0) +
    (maxPrice ? 1 : 0) +
    (maxMileage ? 1 : 0) +
    (minYear ? 1 : 0) +
    (cpoOnly ? 1 : 0) +
    (accidentFreeOnly ? 1 : 0) +
    (singleOwnerOnly ? 1 : 0) +
    (excludeRentalFleet ? 1 : 0)

  const clearAttributeFilters = () => {
    setDom('any')
    setMinPrice('')
    setMaxPrice('')
    setMaxMileage('')
    setMinYear('')
    setCpoOnly(false)
    setAccidentFreeOnly(false)
    setSingleOwnerOnly(false)
    setExcludeRentalFleet(false)
  }

  const filters = useMemo(() => {
    const domRange = domPresets.find((preset) => preset.value === dom) ?? domPresets[0]
    return {
      make: make === 'All' ? undefined : make,
      action: action === 'all' ? undefined : action,
      query: query.trim() || undefined,
      limit: 60,
      minDaysOnMarket: domRange.min,
      maxDaysOnMarket: domRange.max,
      minPrice: minPrice ? Number(minPrice) : undefined,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      maxMileage: maxMileage ? Number(maxMileage) : undefined,
      minYear: minYear ? Number(minYear) : undefined,
      cpoOnly: cpoOnly || undefined,
      accidentFreeOnly: accidentFreeOnly || undefined,
      singleOwnerOnly: singleOwnerOnly || undefined,
      excludeRentalFleet: excludeRentalFleet || undefined,
    }
  }, [action, cpoOnly, accidentFreeOnly, singleOwnerOnly, excludeRentalFleet, dom, make, maxMileage, maxPrice, minPrice, minYear, query])
  const deals = trpc.highline.deals.useQuery(filters, { refetchInterval: 60_000 })
  const refresh = trpc.highline.refresh.useMutation({
    onSuccess: () => {
      utils.highline.summary.invalidate()
      utils.highline.deals.invalidate()
      utils.highline.markets.invalidate()
    },
  })

  const runRefresh = () => refresh.mutate()

  return (
    <main className="mx-auto max-w-[1500px] px-5 pb-20 pt-28 sm:px-8">
      <div className="mb-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-4xl">
          <div className="section-kicker">
            <Sparkles className="h-4 w-4" />
            Live arbitrage workflow
          </div>
          <h1 className="font-display mt-5 text-5xl leading-[0.96] tracking-[-0.035em] text-white sm:text-7xl">
            Find the ask the market missed.
          </h1>
          <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-300">
            Real listings are normalized, matched to highline variants, valued against active-market cohorts, and ranked by estimated net executable edge — not just advertised discount.
          </p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-sm text-slate-400">
          {refresh.isPending ? 'Refreshing provider data…' : 'Public dashboard · refresh limited to once per minute'}
        </div>
      </div>

      <ProviderPanel refresh={runRefresh} />
      {refresh.data && (
        <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3 text-sm text-slate-300">
          Refresh result: <strong className="text-white">{refresh.data.status}</strong>
          {refresh.data.warnings?.length
            ? ` · ${refresh.data.warnings[0]}`
            : ` · ${refresh.data.listingsUpserted} listings upserted${'listingsExpired' in refresh.data && refresh.data.listingsExpired ? ` · ${refresh.data.listingsExpired} left the market (likely sold)` : ''}${'sellThrough' in refresh.data && refresh.data.sellThrough ? ` · ${refresh.data.sellThrough.inserted} sell-through obs from MarketCheck` : ''}`}
        </div>
      )}

      <div className="mt-6">
        <SummaryStrip />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[0.72fr_0.28fr]">
        <section>
          <div className="rounded-[2rem] border border-white/[0.08] bg-white/[0.025] p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                {makeFilters.map((item) => (
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
              <label className="relative block lg:w-80">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search variant, trim, city…"
                  className="h-11 w-full rounded-full border border-white/[0.08] bg-black/25 pl-11 pr-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-[#d7b56d]/50"
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {actionFilters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setAction(item.value)}
                  className={`rounded-full border px-4 py-2 text-sm transition ${action === item.value ? 'border-[#d7b56d]/50 bg-[#d7b56d]/12 text-[#f0d692]' : 'border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-white'}`}
                >
                  {item.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setShowFilters((value) => !value)}
                className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition ${showFilters || activeFilterCount > 0 ? 'border-[#d7b56d]/50 bg-[#d7b56d]/12 text-[#f0d692]' : 'border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-white'}`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}
              </button>
            </div>

            {showFilters && (
              <div className="mt-5 space-y-5 border-t border-white/[0.06] pt-5">
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Days on market</p>
                  <div className="flex flex-wrap gap-2">
                    {domPresets.map((preset) => (
                      <ToggleChip key={preset.value} active={dom === preset.value} onClick={() => setDom(preset.value)}>
                        {preset.label}
                      </ToggleChip>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <FilterNumberInput label="Min price ($)" value={minPrice} onChange={setMinPrice} placeholder="150000" />
                  <FilterNumberInput label="Max price ($)" value={maxPrice} onChange={setMaxPrice} placeholder="450000" />
                  <FilterNumberInput label="Max miles" value={maxMileage} onChange={setMaxMileage} placeholder="12000" />
                  <FilterNumberInput label="Min year" value={minYear} onChange={setMinYear} placeholder="2019" />
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Provenance</p>
                  <div className="flex flex-wrap gap-2">
                    <ToggleChip active={cpoOnly} onClick={() => setCpoOnly((value) => !value)}>CPO only</ToggleChip>
                    <ToggleChip active={accidentFreeOnly} onClick={() => setAccidentFreeOnly((value) => !value)}>No accidents</ToggleChip>
                    <ToggleChip active={singleOwnerOnly} onClick={() => setSingleOwnerOnly((value) => !value)}>One owner</ToggleChip>
                    <ToggleChip active={excludeRentalFleet} onClick={() => setExcludeRentalFleet((value) => !value)}>No rental/fleet</ToggleChip>
                  </div>
                </div>
                {activeFilterCount > 0 && (
                  <button type="button" onClick={clearAttributeFilters} className="text-xs text-slate-500 underline decoration-slate-700 underline-offset-4 transition hover:text-white">
                    Clear all attribute filters
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="mt-5 space-y-4">
            {deals.isLoading && (
              <div className="rounded-[2rem] border border-white/[0.08] bg-white/[0.03] p-8 text-slate-400">Loading deal radar…</div>
            )}
            {deals.error && (
              <div className="rounded-[2rem] border border-rose-400/20 bg-rose-400/[0.06] p-8">
                <div className="flex items-start gap-4">
                  <AlertTriangle className="mt-1 h-6 w-6 text-rose-300" />
                  <div>
                    <h3 className="text-xl font-semibold text-white">Deal radar is waiting on the database.</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      The API is reachable, but the database query failed. This is usually a temporary platform database connection issue. Message: {deals.error.message}
                    </p>
                  </div>
                </div>
              </div>
            )}
            {deals.data?.length === 0 && !deals.isLoading && (
              <div className="rounded-[2rem] border border-white/[0.08] bg-white/[0.03] p-8 text-slate-400">
                No listings match these filters. Broaden the search or refresh the provider.
              </div>
            )}
            {deals.data?.map((deal) => (
              <DealCard key={deal.id} deal={deal} selected={selectedId === deal.id} onSelect={() => setSelectedId(deal.id)} />
            ))}
          </div>
        </section>

        <div className="space-y-6">
          <VinDecoder />
          {selectedId ? (
            <DetailPanel id={selectedId} onClose={() => setSelectedId(null)} />
          ) : (
            <div className="rounded-[2rem] border border-white/[0.08] bg-white/[0.03] p-6 text-sm leading-6 text-slate-400">
              Select a listing to open its decision memo, acquisition-cost model, risk score, price observations, and source link.
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

export default function Radar() {
  return (
    <main className="min-h-screen bg-[#08080a] text-white">
      <RadarHeader />
      <RadarBody />
      <footer className="border-t border-white/[0.06] px-5 py-8 text-center text-xs leading-5 text-slate-500 sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-center gap-2 sm:flex-row">
          <span className="inline-flex items-center gap-2"><Bell className="h-4 w-4" /> Arbitrage estimates are decision support, not guarantees.</span>
          <span className="hidden sm:inline">·</span>
          <span className="inline-flex items-center gap-2"><Check className="h-4 w-4" /> Verify title, condition, service history, fees, taxes, and exit liquidity before acting.</span>
          <span className="hidden sm:inline">·</span>
          <span className="inline-flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Demo rows are retired when live provider data arrives.</span>
        </div>
      </footer>
    </main>
  )
}
