import {
	type CSSProperties,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { listRuns } from "../api";
import { difficultyLabel, RunStatusBadge } from "../components";
import {
	formatClock,
	formatDateTime,
	formatPercent,
	summaryRates,
} from "../format";
import { arenaHref } from "../router";
import type { Progress, Rate, RunSummary } from "../types";
import { isActiveRun } from "./useRunPolling";

/** Poll interval of the run list while any listed run is generating or running. */
export const RUN_LIST_POLL_INTERVAL_MS = 2000;

/** Active runs first, then finished runs; both newest first. */
export function sortRuns(runs: RunSummary[]): RunSummary[] {
	const newest = (a: RunSummary, b: RunSummary) =>
		Date.parse(b.started_at) - Date.parse(a.started_at);
	return [
		...runs.filter(isActiveRun).sort(newest),
		...runs.filter((run) => !isActiveRun(run)).sort(newest),
	];
}

export interface RunListState {
	runs: RunSummary[] | undefined;
	error: Error | undefined;
	reload: () => void;
}

/**
 * Loads `GET /runs[?level=]` and polls it about every 2 s while any run is active; polling stops
 * when nothing runs any more and on unmount.
 */
export function useRunList(level?: string): RunListState {
	const [runs, setRuns] = useState<RunSummary[]>();
	const [error, setError] = useState<Error>();
	const [attempt, setAttempt] = useState(0);
	const loaded = useRef<RunSummary[] | undefined>(undefined);

	useEffect(() => {
		void attempt;
		const controller = new AbortController();
		let timer: ReturnType<typeof setTimeout> | undefined;
		const schedule = () => {
			timer = setTimeout(tick, RUN_LIST_POLL_INTERVAL_MS);
		};
		async function tick() {
			try {
				const next = await listRuns(level, { signal: controller.signal });
				if (controller.signal.aborted) return;
				loaded.current = next;
				setRuns(next);
				setError(undefined);
				if (next.some(isActiveRun)) schedule();
			} catch (reason) {
				if (controller.signal.aborted) return;
				setError(reason instanceof Error ? reason : new Error(String(reason)));
				// A transient failure while runs are active: keep trying.
				if (loaded.current?.some(isActiveRun)) schedule();
			}
		}
		void tick();
		return () => {
			controller.abort();
			clearTimeout(timer);
		};
	}, [level, attempt]);

	const reload = useCallback(() => setAttempt((n) => n + 1), []);
	return { runs, error, reload };
}

function TeamProgress({
	team,
	progress,
}: {
	team: "Red" | "Green";
	progress: Progress;
}) {
	return (
		<div className="flex min-w-0 items-center gap-1.5">
			<span
				className={cn(
					"text-xs font-medium",
					team === "Red" ? "text-arena-attacker" : "text-arena-defender",
				)}
			>
				{team}
			</span>
			<ProgressBar
				className="w-12 shrink-0"
				aria-label={`${team} cases done`}
				value={progress.done}
				max={Math.max(1, progress.total)}
				cells={6}
				aria-valuetext={`${progress.done} of ${progress.total} cases done`}
				style={
					{
						"--phosphor":
							team === "Red"
								? "var(--arena-attacker)"
								: "var(--arena-defender)",
					} as CSSProperties
				}
			/>
			<span
				data-testid={`progress-${team.toLowerCase()}`}
				className="font-mono text-xs text-foreground tabular-nums"
			>
				{progress.done}/{progress.total}
			</span>
		</div>
	);
}

function RateText({ label, rate }: { label: string; rate: Rate }) {
	return (
		<span className="flex items-baseline gap-1 whitespace-nowrap">
			<span className="text-xs text-muted-foreground">{label}</span>
			<span className="text-[13px] font-semibold tabular-nums">
				{formatPercent(rate)}
			</span>
			<span className="font-mono text-[11px] text-muted-foreground">
				{rate.numerator}/{rate.denominator}
			</span>
		</span>
	);
}

function RunOutcome({ run }: { run: RunSummary }) {
	if (isActiveRun(run))
		return (
			<div className="flex flex-wrap items-center gap-x-3 gap-y-1">
				<TeamProgress team="Red" progress={run.progress.red} />
				<TeamProgress team="Green" progress={run.progress.green} />
			</div>
		);
	const rates = summaryRates(run);
	return (
		<span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
			<span title="Attack success rate (errors excluded)">
				<RateText label="ASR" rate={rates.attack_success} />
			</span>
			<span title="False positive rate (errors excluded)">
				<RateText label="FPR" rate={rates.false_positive} />
			</span>
		</span>
	);
}

/** One run: level, difficulty, status, start, duration and progress or rates; links to the run. */
export function RunRow({
	run,
	levelTitle,
	showTitle = true,
	compact = false,
}: {
	run: RunSummary;
	/** Level title from the level list, for runs without a recorded title. */
	levelTitle?: string;
	showTitle?: boolean;
	compact?: boolean;
}) {
	const active = isActiveRun(run);
	const title = run.title ?? levelTitle ?? run.level;
	return (
		<li data-run={run.id} data-status={run.status}>
			<a
				href={arenaHref({ name: "run", runId: run.id })}
				className={cn(
					"grid gap-x-4 gap-y-2 px-4 py-3 font-mono text-xs transition-colors focus-visible:outline-2 focus-visible:outline-primary",
					compact
						? "grid-cols-[minmax(0,1fr)_auto]"
						: "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.4fr)_6.5rem_7.5rem_4.5rem_minmax(0,1.5fr)] md:items-center",
					active
						? "bg-primary/10 shadow-[inset_3px_0_0_var(--phosphor)] hover:bg-primary/10"
						: "hover:bg-phosphor/[0.06]",
				)}
			>
				<span className="flex min-w-0 items-baseline gap-2">
					{showTitle && (
						<span className="truncate font-medium text-foreground">
							{title}
						</span>
					)}
					<Badge
						variant="outline"
						className={cn(
							"shrink-0",
							showTitle
								? "text-muted-foreground"
								: "font-medium text-foreground",
						)}
					>
						{difficultyLabel(run.difficulty)}
					</Badge>
				</span>
				<span
					className={cn(
						"justify-self-end",
						!compact && "md:justify-self-start",
					)}
				>
					<RunStatusBadge status={run.status} />
				</span>
				<span
					className={cn(
						"flex items-baseline gap-3 text-muted-foreground",
						!compact && "md:contents",
					)}
				>
					<time
						dateTime={run.started_at}
						title={`Started ${formatDateTime(run.started_at, { seconds: true })}`}
						className="whitespace-nowrap tabular-nums"
					>
						{formatDateTime(run.started_at)}
					</time>
					<span
						title="Duration"
						className="font-mono text-xs whitespace-nowrap tabular-nums"
					>
						{formatClock(run.elapsed)}
					</span>
				</span>
				<div className={cn("col-span-2", !compact && "md:col-span-1")}>
					<RunOutcome run={run} />
				</div>
			</a>
		</li>
	);
}

/**
 * Runs of all levels (or of one `level`): active runs first with live progress, then finished
 * runs with their rates. `limit` keeps only the latest few.
 */
export function RunList({
	level,
	limit,
	compact = false,
	levelTitles,
	label = "Runs",
}: {
	level?: string;
	limit?: number;
	compact?: boolean;
	levelTitles?: Record<string, string>;
	label?: string;
}) {
	const { runs, error, reload } = useRunList(level);
	const sorted = runs ? sortRuns(runs) : [];
	const shown = limit === undefined ? sorted : sorted.slice(0, limit);

	if (!runs)
		return error ? (
			<p className="px-4 py-3 text-sm text-muted-foreground">
				Runs could not be loaded ({error.message}).{" "}
				<button
					type="button"
					onClick={reload}
					className="font-medium text-primary hover:underline"
				>
					Reload runs
				</button>
			</p>
		) : (
			<p className="px-4 py-3 text-sm text-muted-foreground">Loading runs…</p>
		);
	if (!shown.length)
		return (
			<p className="px-4 py-3 text-sm text-muted-foreground">
				{level
					? "No runs of this level yet."
					: "No runs yet. Open a level and start an evaluation."}
			</p>
		);
	return (
		<>
			{!compact && (
				<div
					aria-hidden="true"
					className="hidden grid-cols-[minmax(0,1.4fr)_6.5rem_7.5rem_4.5rem_minmax(0,1.5fr)] gap-x-4 border-b px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-phosphor-bright bg-panel md:grid"
				>
					<span>Level</span>
					<span>Status</span>
					<span>Started</span>
					<span>Duration</span>
					<span>Progress / rates</span>
				</div>
			)}
			<ul aria-label={label} className="divide-y divide-border">
				{shown.map((run) => (
					<RunRow
						key={run.id}
						run={run}
						levelTitle={levelTitles?.[run.level]}
						showTitle={!level}
						compact={compact}
					/>
				))}
			</ul>
		</>
	);
}
