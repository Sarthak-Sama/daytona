'use client';
import type { BugReport } from '@/lib/types';

const label = 'font-mono text-[10px] font-medium uppercase tracking-[.16em]';

export default function ReportCard({ report, onEvidence }: { report: BugReport; onEvidence?: (step: number) => void }) {
  const pct = Math.round(report.confidence * 100);
  const tone = pct >= 75 ? 'text-lime-200 border-lime-200/40 bg-lime-200/10' : pct >= 40 ? 'text-amber-200 border-amber-200/40 bg-amber-200/10' : 'text-red-200 border-red-200/40 bg-red-200/10';
  return (
    <section className="mt-5 overflow-hidden rounded-xl border border-lime-200/25 bg-gradient-to-b from-lime-200/[.06] to-transparent" aria-label="Investigation report">
      <header className="border-b border-white/8 p-5">
        <div className="flex items-center justify-between gap-3">
          <span className={`${label} text-lime-200`}>Diagnosis</span>
          <span className={`rounded-full border px-2.5 py-1 font-mono text-[10px] ${tone}`} aria-label="Report confidence">{pct}% confident</span>
        </div>
        <h3 className="mt-3 text-xl font-semibold leading-snug text-stone-50">{report.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-stone-300">{report.observedError}</p>
      </header>

      <div className="space-y-5 p-5">
        <div>
          <h4 className={`${label} text-stone-400`}>Root cause</h4>
          <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-stone-100">{report.rootCause}</p>
        </div>

        <div className="rounded-lg border border-lime-200/25 bg-lime-200/[.07] p-4">
          <h4 className={`${label} text-lime-200`}>Suggested fix</h4>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone-100">{report.suggestedFix}</p>
        </div>

        {report.evidence.length > 0 && (
          <div>
            <h4 className={`${label} text-stone-400`}>Evidence · {report.evidence.length}</h4>
            <ul className="mt-2 space-y-2">
              {report.evidence.map((e, i) => (
                <li key={i}>
                  <a href={`#agent-step-${e.step}`} aria-label={`Evidence from step ${e.step}: ${e.excerpt}`} onClick={event => { if (onEvidence) { event.preventDefault(); onEvidence(e.step); } }}
                    className="group flex items-start gap-3 rounded-lg border border-white/8 bg-black/30 p-3 transition hover:border-lime-200/40 focus-visible:outline-2 focus-visible:outline-lime-200">
                    <span className="mt-0.5 shrink-0 rounded bg-white/8 px-1.5 py-0.5 font-mono text-[10px] text-lime-200">step {e.step}</span>
                    <code className="min-w-0 flex-1 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-stone-300">{e.excerpt}</code>
                    <span className="shrink-0 text-xs text-stone-500 transition group-hover:text-lime-200" aria-hidden>↗</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {report.reproSteps.length > 0 && (
          <div>
            <h4 className={`${label} text-stone-400`}>Reproduce</h4>
            <ol className="mt-2 space-y-1.5">
              {report.reproSteps.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm leading-relaxed text-stone-300">
                  <span className="mt-0.5 font-mono text-[10px] text-stone-500">{i + 1}</span>
                  <span className="min-w-0 flex-1 break-words">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {report.uncertainty && (
          <p className="border-t border-white/8 pt-4 text-xs leading-relaxed text-stone-400">
            <span className="font-medium text-stone-300">Not confirmed: </span>{report.uncertainty}
          </p>
        )}
      </div>
    </section>
  );
}
