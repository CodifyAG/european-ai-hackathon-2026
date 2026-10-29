import { type CSSProperties, type ReactNode, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
	Card as AfterglowCard,
	CardAccent,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { getRunResults } from "../api";
import {
	ErrorState,
	ExpandableText,
	LoadingState,
	OutcomeBadge,
} from "../components";
import {
	decidedLabel,
	formatDuration,
	formatPercent,
	STATUS_LABELS,
	TEAM_LABELS,
} from "../format";
import { arenaHref, navigate } from "../router";
import type {
	CaseOutcome,
	CaseSummary,
	OutcomeCounts,
	Rate,
	RunDetail,
	RunResults,
} from "../types";
import { useArenaQuery } from "../useArenaQuery";
import { ModelsUsed } from "./RunProgress";

function RateValue({
	rate,
	tone,
	label,
	color,
}: {
	rate: Rate;
	tone: string;
	label: string;
	color: string;
}) {
	return (
		<div className="flex w-full flex-col gap-4">
			<div className="flex items-baseline gap-2">
				<span
					className={cn(
						"font-mono text-3xl font-semibold tracking-tight",
						tone,
					)}
				>
					{formatPercent(rate)}
				</span>
				<span className="font-mono text-sm text-muted-foreground">
					{rate.numerator} / {rate.denominator}
				</span>
			</div>
			{rate.value === null ? (
				<Badge variant="outline">No evaluated cases</Badge>
			) : (
				<Progress
					aria-label={label}
					value={rate.value * 100}
					aria-valuetext={formatPercent(rate)}
					cells={20}
					style={{ "--phosphor": color } as CSSProperties}
				/>
			)}
		</div>
	);
}

function Panel({
	title,
	aside,
	children,
	accent = "var(--phosphor)",
}: {
	title: string;
	aside?: string;
	accent?: string;
	children: ReactNode;
}) {
	return (
		<AfterglowCard
			accent={accent}
			role="region"
			aria-label={title}
			className="gap-4 bg-card p-4"
		>
			<CardAccent />
			<CardHeader className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-0 pb-3">
				<CardTitle
					role="heading"
					aria-level={2}
					className="text-xs uppercase tracking-widest"
				>
					{title}
				</CardTitle>
				{aside && (
					<span className="text-xs text-muted-foreground">{aside}</span>
				)}
			</CardHeader>
			{children}
		</AfterglowCard>
	);
}

function Cell({
	value,
	caption,
	good,
}: {
	value: number;
	caption: string;
	good: boolean;
}) {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center rounded-none border py-4",
				good
					? "border-arena-defender/30 bg-arena-defender/10 text-arena-defender"
					: "border-arena-attacker/30 bg-arena-attacker/10 text-arena-attacker",
			)}
		>
			<span className="font-mono text-3xl font-semibold tabular-nums">
				{value}
			</span>
			<span className="text-[11px]">{caption}</span>
		</div>
	);
}

function Matrix({ matrix }: { matrix: RunResults["matrix"] }) {
	return (
		<Panel title="Expected vs. outcome" accent="var(--arena-defender)">
			<div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 text-[13px]">
				<span />
				<span className="text-center text-xs text-muted-foreground">
					Stopped / blocked
				</span>
				<span className="text-center text-xs text-muted-foreground">
					Got through / passed
				</span>
				<span className="pr-2 text-arena-attacker">Red team</span>
				<Cell value={matrix.red.stopped} caption="correct" good />
				<Cell
					value={matrix.red.got_through}
					caption="false negative"
					good={false}
				/>
				<span className="pr-2 text-arena-defender">Green team</span>
				<Cell
					value={matrix.green.blocked}
					caption="false positive"
					good={false}
				/>
				<Cell value={matrix.green.passed} caption="correct" good />
			</div>
		</Panel>
	);
}

const OUTCOME_SLICES: {
	outcome: keyof OutcomeCounts;
	team: string;
	label: string;
	color: string;
}[] = [
	{
		outcome: "succeeded",
		team: "Red",
		label: "attack succeeded",
		color: "var(--arena-attacker)",
	},
	{
		outcome: "defended",
		team: "Red",
		label: "defended",
		color: "var(--arena-defender)",
	},
	{
		outcome: "false_positive",
		team: "Green",
		label: "false positive",
		color: "var(--warning)",
	},
	{ outcome: "passed", team: "Green", label: "passed", color: "var(--azure)" },
	{ outcome: "error", team: "Both", label: "errors", color: "var(--signal)" },
];

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Surface gap between two slices, in px along the ring. */
const SLICE_GAP = 2;

function RateLabel({
	label,
	rate,
	color,
	testId,
}: {
	label: string;
	rate: Rate;
	color: string;
	testId: string;
}) {
	return (
		<div
			data-testid={testId}
			className="flex flex-col gap-2 border border-line border-l-2 bg-panel-sunken px-3 py-3"
			style={{ borderLeftColor: color }}
		>
			<span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
				{label}
			</span>
			<RateValue
				rate={rate}
				label={label}
				color={color}
				tone="text-foreground"
			/>
		</div>
	);
}

/** Donut of the decided cases by outcome, with both rates as returned by the API (R-RES-1). */
function OutcomeChart({ results }: { results: RunResults }) {
	const { counts, rates } = results;
	const total = OUTCOME_SLICES.reduce((sum, s) => sum + counts[s.outcome], 0);
	const shown = OUTCOME_SLICES.filter((s) => counts[s.outcome] > 0);
	const gap = shown.length > 1 ? SLICE_GAP : 0;
	let offset = 0;
	const arcs = shown.map((slice) => {
		const length = (counts[slice.outcome] / total) * CIRCUMFERENCE;
		const arc = {
			...slice,
			dash: Math.max(length - gap, 0.5),
			offset,
		};
		offset += length;
		return arc;
	});
	const pct = (n: number) =>
		total ? `${Math.round((n / total) * 100)}%` : "—";

	return (
		<Panel
			title="Outcomes"
			aside={`${total} decided case${total === 1 ? "" : "s"}`}
		>
			<div className="flex flex-wrap items-center gap-5">
				<svg
					viewBox="0 0 140 140"
					role="img"
					aria-label={`Outcomes: ${OUTCOME_SLICES.map((s) => `${s.team} ${s.label} ${counts[s.outcome]}`).join(", ")}`}
					className="size-36 shrink-0 -rotate-90"
				>
					<circle
						cx="70"
						cy="70"
						r={RADIUS}
						fill="none"
						stroke="var(--muted)"
						strokeWidth="12"
					/>
					<circle
						cx="70"
						cy="70"
						r="65"
						fill="none"
						stroke="var(--line)"
						strokeDasharray="1 5"
					/>
					{arcs.map((arc) => (
						<circle
							key={arc.outcome}
							data-outcome={arc.outcome}
							cx="70"
							cy="70"
							r={RADIUS}
							fill="none"
							stroke={arc.color}
							strokeWidth="12"
							strokeDasharray={`${arc.dash} ${CIRCUMFERENCE - arc.dash}`}
							strokeDashoffset={-arc.offset}
							className="transition-opacity hover:opacity-80"
						>
							<title>{`${arc.team} · ${arc.label}: ${counts[arc.outcome]} (${pct(counts[arc.outcome])})`}</title>
						</circle>
					))}
					<text
						x="70"
						y="70"
						transform="rotate(90 70 70)"
						textAnchor="middle"
						dominantBaseline="central"
						className="fill-phosphor-bright font-mono text-[26px] font-semibold"
					>
						{total}
					</text>
					<text
						x="70"
						y="91"
						transform="rotate(90 70 70)"
						textAnchor="middle"
						className="fill-muted-foreground font-mono text-[8px] tracking-widest"
					>
						CASES
					</text>
				</svg>
				<ul
					aria-label="Outcome counts"
					className="flex min-w-36 flex-1 flex-col gap-1.5 text-[13px]"
				>
					{OUTCOME_SLICES.map((slice) => (
						<li
							key={slice.outcome}
							data-outcome={slice.outcome}
							className="flex items-center gap-2 border-b border-line/50 pb-1.5 last:border-0"
						>
							<span
								aria-hidden="true"
								className="size-2.5 shrink-0 rounded-none"
								style={{ background: slice.color }}
							/>
							<span className="min-w-0 flex-1 text-foreground">
								<span className="text-muted-foreground">{slice.team}</span> ·{" "}
								{slice.label}
							</span>
							<span className="font-semibold tabular-nums">
								{counts[slice.outcome]}
							</span>
							<span className="w-9 text-right font-mono text-xs text-muted-foreground">
								{pct(counts[slice.outcome])}
							</span>
						</li>
					))}
				</ul>
			</div>
			<div className="flex flex-col gap-2">
				<RateLabel
					label="Attack success rate"
					rate={rates.attack_success}
					color="var(--arena-attacker)"
					testId="rate-attack-success"
				/>
				<RateLabel
					label="False positive rate"
					rate={rates.false_positive}
					color="var(--warning)"
					testId="rate-false-positive"
				/>
				<p className="text-xs text-muted-foreground">
					Errors are excluded from both rates.
				</p>
			</div>
		</Panel>
	);
}

function ByAttackType({ rows }: { rows: RunResults["by_attack_type"] }) {
	return (
		<Panel
			title="By attack type"
			aside="succeeded / attempts"
			accent="var(--arena-attacker)"
		>
			{rows.length === 0 ? (
				<p className="text-sm text-muted-foreground">No red cases.</p>
			) : (
				<ul className="flex flex-col gap-3">
					{rows.map((row) => (
						<li key={row.type} className="flex flex-col gap-1.5">
							<span className="flex items-baseline justify-between gap-2 text-[13px]">
								<span className="font-mono text-xs">{row.type}</span>
								<span className="font-mono text-xs text-muted-foreground">
									{row.succeeded} / {row.attempts}
									{row.errors > 0 && (
										<span className="text-muted-foreground">
											{" "}
											· {row.errors} error{row.errors === 1 ? "" : "s"}
										</span>
									)}
								</span>
							</span>
							<Progress
								aria-label={`${row.type} attack success`}
								value={row.succeeded}
								max={Math.max(1, row.attempts)}
								cells={20}
								style={
									{ "--phosphor": "var(--arena-attacker)" } as CSSProperties
								}
								aria-valuetext={`${row.succeeded} succeeded, ${row.defended} defended, ${row.errors} errors, ${row.attempts} attempts`}
							/>
							<div className="flex flex-wrap gap-1.5">
								<Badge variant="destructive">{row.succeeded} breach</Badge>
								<Badge>{row.defended} defended</Badge>
								{row.errors > 0 && (
									<Badge variant="signal">{row.errors} error</Badge>
								)}
							</div>
						</li>
					))}
				</ul>
			)}
		</Panel>
	);
}

type Filter = "all" | "false_negative" | "false_positive" | "error";

const FILTERS: { id: Filter; label: string; outcome?: CaseOutcome }[] = [
	{ id: "all", label: "All" },
	{ id: "false_negative", label: "False negatives", outcome: "succeeded" },
	{ id: "false_positive", label: "False positives", outcome: "false_positive" },
	{ id: "error", label: "Errors", outcome: "error" },
];

const FILTER_TONES: Record<Filter, string> = {
	all: "aria-pressed:border-border aria-pressed:bg-muted aria-pressed:text-white",
	false_negative:
		"text-arena-attacker aria-pressed:border-arena-attacker/30 aria-pressed:bg-arena-attacker/10 aria-pressed:text-arena-attacker",
	false_positive:
		"text-warning aria-pressed:border-warning/30 aria-pressed:bg-warning/10 aria-pressed:text-warning",
	error:
		"text-muted-foreground aria-pressed:border-border aria-pressed:bg-muted aria-pressed:text-white",
};

function CaseTable({ runId, cases }: { runId: string; cases: CaseSummary[] }) {
	const [filter, setFilter] = useState<Filter>("all");
	const outcome = FILTERS.find((f) => f.id === filter)?.outcome;
	const shown = outcome ? cases.filter((c) => c.outcome === outcome) : cases;
	const count = (f: (typeof FILTERS)[number]) =>
		f.outcome
			? cases.filter((c) => c.outcome === f.outcome).length
			: cases.length;
	const href = (item: CaseSummary) =>
		arenaHref({ name: "case", runId, caseId: item.id });

	return (
		<section
			aria-label="Cases"
			className="flex flex-col overflow-hidden rounded-none border bg-card shadow-sm"
		>
			<div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
				<h2 className="mr-1 text-sm font-semibold">Cases</h2>
				<fieldset
					aria-label="Filter cases"
					className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0"
				>
					{FILTERS.map((f) => (
						<button
							key={f.id}
							type="button"
							aria-pressed={filter === f.id}
							onClick={() => setFilter(f.id)}
							className={cn(
								"rounded-none border px-2.5 py-1 font-mono text-xs font-medium transition-colors hover:bg-accent",
								FILTER_TONES[f.id],
							)}
						>
							{f.label} {count(f)}
						</button>
					))}
				</fieldset>
				<span className="ml-auto text-xs text-muted-foreground">
					Select a row to replay it
				</span>
			</div>
			<div className="overflow-x-auto">
				<Table className="w-full min-w-[46rem] text-[13px]">
					<TableHeader>
						<TableRow className="border-b text-left text-xs text-muted-foreground">
							<TableHead className="px-4 py-2 font-medium">#</TableHead>
							<TableHead className="px-2 py-2 font-medium">Team</TableHead>
							<TableHead className="px-2 py-2 font-medium">
								Attack type
							</TableHead>
							<TableHead className="px-2 py-2 font-medium">Outcome</TableHead>
							<TableHead className="px-2 py-2 font-medium">
								Decided at
							</TableHead>
							<TableHead className="px-2 py-2 text-right font-medium">
								Turns
							</TableHead>
							<TableHead className="px-4 py-2 text-right font-medium">
								Duration
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{shown.map((item) => (
							<TableRow
								key={item.id}
								data-case={item.label}
								onClick={() => navigate(href(item))}
								className="cursor-pointer border-b border-border last:border-0 hover:bg-accent/40"
							>
								<TableCell className="px-4 py-2">
									<a
										href={href(item)}
										aria-label={`Replay case ${item.label}`}
										onClick={(event) => event.stopPropagation()}
										className="font-mono text-primary hover:underline"
									>
										{item.label}
									</a>
								</TableCell>
								<TableCell
									className={cn(
										"px-2 py-2",
										item.team === "red"
											? "text-arena-attacker"
											: "text-arena-defender",
									)}
								>
									{TEAM_LABELS[item.team]}
								</TableCell>
								<TableCell className="px-2 py-2 font-mono text-xs">
									{item.attack_type ?? "—"}
								</TableCell>
								<TableCell className="px-2 py-2">
									{item.outcome ? (
										<OutcomeBadge outcome={item.outcome} />
									) : (
										<span className="text-xs text-muted-foreground">
											{item.status === "stopped" ? "stopped" : "not run"}
										</span>
									)}
								</TableCell>
								<TableCell className="px-2 py-2 text-foreground">
									{decidedLabel(item)}
									{item.error && (
										<ExpandableText
											text={item.error}
											threshold={60}
											className="max-w-md text-xs text-arena-attacker"
										/>
									)}
								</TableCell>
								<TableCell className="is-numeric px-2 py-2">
									{item.turns}
								</TableCell>
								<TableCell className="is-numeric px-4 py-2">
									{formatDuration(item.duration)}
								</TableCell>
							</TableRow>
						))}
						{shown.length === 0 && (
							<TableRow>
								<TableCell
									colSpan={7}
									className="px-4 py-6 text-center text-muted-foreground"
								>
									No cases with this outcome.
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>
		</section>
	);
}

/** Results of a finished run (R-RES-*): only values recorded by the backend. */
export function RunResultsView({ run }: { run: RunDetail }) {
	const query = useArenaQuery(
		(signal) => getRunResults(run.id, { signal }),
		[run.id, run.status],
	);
	const results = query.data;
	if (!results && query.loading)
		return <LoadingState label="Loading results…" />;
	if (query.error && !query.loading)
		return (
			<ErrorState
				title="The results could not be loaded."
				error={query.error}
				onRetry={query.reload}
			/>
		);
	if (!results) return null;

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 lg:p-6">
			{run.status !== "completed" && (
				<p className="rounded-none border border-warning/30 bg-warning/10 px-4 py-2.5 text-sm text-warning">
					This run {STATUS_LABELS[run.status].toLowerCase()} before all cases
					were run. The results cover the cases that were completed.
				</p>
			)}
			<div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
				<Matrix matrix={results.matrix} />
				<OutcomeChart results={results} />
				<ByAttackType rows={results.by_attack_type} />
			</div>
			<CaseTable runId={run.id} cases={results.cases} />
			<ModelsUsed run={run} />
		</div>
	);
}
