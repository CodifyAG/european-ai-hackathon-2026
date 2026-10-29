import {
	AlertTriangleIcon,
	ArrowLeftIcon,
	LogOutIcon,
	ShieldIcon,
} from "lucide-react";
import {
	Fragment,
	type ReactNode,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { OUTCOME_LABELS, STATUS_LABELS } from "./format";
import { arenaHref } from "./router";
import type {
	CaseOutcome,
	Channel,
	Difficulty,
	RunDetail,
	RunStatus,
	Turns,
} from "./types";
import { ACTIVE_RUN_STATUSES, DIFFICULTIES } from "./types";

export interface Crumb {
	label: string;
	href?: string;
}

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
	easy: "Easy",
	medium: "Medium",
	hard: "Hard",
};
export const difficultyLabel = (d: Difficulty) => DIFFICULTY_LABELS[d];

/** Easy / Medium / Hard segmented switch; each option is a link to that difficulty. */
export function DifficultySwitch({
	value,
	hrefFor,
	available = DIFFICULTIES,
}: {
	value: Difficulty;
	hrefFor: (difficulty: Difficulty) => string;
	available?: readonly Difficulty[];
}) {
	return (
		<nav
			aria-label="Difficulty"
			className="flex items-center gap-0.5 rounded-none border bg-muted/80 p-0.5"
		>
			{DIFFICULTIES.filter((d) => available.includes(d)).map((difficulty) => (
				<a
					key={difficulty}
					href={hrefFor(difficulty)}
					aria-current={difficulty === value ? "page" : undefined}
					className={cn(
						"rounded-none px-3.5 py-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary",
						difficulty === value && "bg-card text-foreground shadow-sm",
					)}
				>
					{DIFFICULTY_LABELS[difficulty]}
				</a>
			))}
		</nav>
	);
}

/** Signed-in user's name and the sign-out button at the right end of the arena header. */
function UserMenu() {
	const { data: session } = authClient.useSession();
	return (
		<div className="flex shrink-0 items-center gap-2 border-l pl-3">
			{session?.user.name && (
				<span className="hidden max-w-40 truncate text-[13px] text-muted-foreground md:inline">
					{session.user.name}
				</span>
			)}
			<button
				type="button"
				onClick={() => void authClient.signOut()}
				className="flex items-center gap-1.5 rounded-none px-2 py-1 text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
			>
				<LogOutIcon className="size-3.5" aria-hidden="true" />
				<span className="sr-only sm:not-sr-only">Sign out</span>
			</button>
		</div>
	);
}

/** Full-screen arena frame: header with brand, breadcrumb, optional center/actions, user menu. */
export function ArenaShell({
	crumbs,
	back,
	center,
	actions,
	children,
}: {
	crumbs: Crumb[];
	/** "← Back" at the top left: to the parent page (`label` names it for screen readers). */
	back?: { href: string; label: string };
	center?: ReactNode;
	actions?: ReactNode;
	children: ReactNode;
}) {
	return (
		<div className="flex h-dvh w-full flex-col bg-card text-foreground">
			<header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b bg-card px-4 py-2.5 lg:h-14 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:py-0">
				<div className="flex min-w-0 items-center gap-3">
					{back && (
						<a
							href={back.href}
							aria-label={back.label}
							title={back.label}
							className="flex h-8 shrink-0 items-center gap-1 rounded-md border bg-white px-2.5 text-[13px] font-medium text-slate-700 shadow-xs hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-500"
						>
							<ArrowLeftIcon className="size-3.5" aria-hidden="true" />
							Back
						</a>
					)}
					<a
						href={arenaHref({ name: "levels" })}
						className="flex shrink-0 items-center gap-2.5 rounded-none focus-visible:outline-2 focus-visible:outline-primary"
					>
						<span className="grid size-7 place-items-center rounded-none bg-primary text-primary-foreground">
							<ShieldIcon className="size-4" aria-hidden="true" />
						</span>
						{/* Sub-pages need the room for "Back" and the breadcrumb; the logo stays. */}
						<span
							className={cn(
								"text-sm font-semibold tracking-tight",
								back && "sr-only 2xl:not-sr-only",
							)}
						>
							Guardrail Arena
						</span>
					</a>
					<nav aria-label="Breadcrumb" className="hidden min-w-0 sm:block">
						<ol className="flex min-w-0 items-center gap-2 text-[13px]">
							{crumbs.map((crumb) => (
								<Fragment key={crumb.href ?? crumb.label}>
									<li aria-hidden="true" className="text-muted-foreground">
										/
									</li>
									<li className="min-w-0 truncate">
										{crumb.href ? (
											<a
												href={crumb.href}
												className="text-muted-foreground hover:text-foreground"
											>
												{crumb.label}
											</a>
										) : (
											<span aria-current="page" className="font-medium">
												{crumb.label}
											</span>
										)}
									</li>
								</Fragment>
							))}
						</ol>
					</nav>
				</div>
				{center ? (
					<div className="order-last col-span-2 flex justify-center lg:order-none lg:col-span-1">
						{center}
					</div>
				) : (
					<div className="hidden lg:block" />
				)}
				<div className="flex min-w-0 items-center justify-end gap-3">
					{actions}
					<UserMenu />
				</div>
			</header>
			<div className="flex min-h-0 flex-1 flex-col">{children}</div>
		</div>
	);
}

export function SurfaceBadge({
	channel,
	turns,
	className,
}: {
	channel: Channel;
	turns: Turns;
	className?: string;
}) {
	const text = `${channel === "direct" ? "Direct" : "Indirect"} · ${turns === "multi" ? "multi-turn" : "single-turn"}`;
	return (
		<span
			className={cn(
				"inline-flex h-6 items-center rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
				channel === "direct"
					? "border-arena-attacker/30 bg-arena-attacker/10 text-arena-attacker"
					: "border-warning/30 bg-warning/10 text-warning",
				className,
			)}
		>
			{text}
		</span>
	);
}

export function LoadingState({ label }: { label: string }) {
	return (
		<div className="flex flex-1 items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
			<Spinner className="size-4" aria-hidden="true" />
			{label}
		</div>
	);
}

export function ErrorState({
	title,
	error,
	onRetry,
}: {
	title: string;
	error: Error;
	onRetry?: () => void;
}) {
	return (
		<div className="flex flex-1 items-center justify-center p-10">
			<div
				role="alert"
				className="flex max-w-md flex-col items-center gap-3 rounded-none border bg-card p-6 text-center shadow-sm"
			>
				<AlertTriangleIcon className="size-6 text-warning" aria-hidden="true" />
				<p className="font-medium">{title}</p>
				<p className="text-sm text-muted-foreground">{error.message}</p>
				{onRetry && (
					<Button type="button" variant="outline" size="sm" onClick={onRetry}>
						Try again
					</Button>
				)}
			</div>
		</div>
	);
}

export const RUN_STATUS_TONES: Record<RunStatus, string> = {
	generating: "border-blue-200 bg-blue-50 text-blue-700",
	running: "border-emerald-200 bg-emerald-50 text-emerald-700",
	completed: "border-slate-200 bg-slate-50 text-slate-700",
	stopped: "border-amber-200 bg-amber-50 text-amber-800",
	failed: "border-red-200 bg-red-50 text-red-700",
	interrupted: "border-amber-200 bg-amber-50 text-amber-800",
};

/** Small run status badge; pulses while the run is generating or running. */
export function RunStatusBadge({ status }: { status: RunStatus }) {
	return (
		<span
			data-status={status}
			className={cn(
				"inline-flex h-5 items-center gap-1.5 rounded-md border px-1.5 text-[11px] font-semibold whitespace-nowrap",
				RUN_STATUS_TONES[status],
			)}
		>
			{ACTIVE_RUN_STATUSES.includes(status) && (
				<span
					aria-hidden="true"
					className="size-1.5 animate-pulse rounded-full bg-current"
				/>
			)}
			{STATUS_LABELS[status]}
		</span>
	);
}

const OUTCOME_TONES: Record<CaseOutcome, string> = {
	succeeded:
		"border-arena-attacker/30 bg-arena-attacker/10 text-arena-attacker",
	defended: "border-arena-defender/30 bg-arena-defender/10 text-arena-defender",
	passed: "border-arena-defender/30 bg-arena-defender/10 text-arena-defender",
	false_positive: "border-warning/30 bg-warning/10 text-warning",
	error: "border-signal/30 bg-signal/10 text-signal",
};

/** Outcome of a decided case, e.g. "Attack succeeded" or "False positive". */
export function OutcomeBadge({
	outcome,
	className,
}: {
	outcome: CaseOutcome;
	className?: string;
}) {
	return (
		<span
			data-outcome={outcome}
			className={cn(
				"inline-flex h-5 items-center rounded-none border px-1.5 text-[11px] font-semibold whitespace-nowrap",
				OUTCOME_TONES[outcome],
				className,
			)}
		>
			{OUTCOME_LABELS[outcome]}
		</span>
	);
}

/**
 * Breadcrumbs of the run and replay pages: level · difficulty, then "Run" (active) or "Results"
 * (finished). The brand already links to the level list.
 */
export function runCrumbs(
	run: Pick<RunDetail, "level" | "difficulty" | "title" | "status"> | undefined,
	runId: string,
	current?: boolean,
): Crumb[] {
	const label =
		run && !ACTIVE_RUN_STATUSES.includes(run.status) ? "Results" : "Run";
	const runCrumb: Crumb = current
		? { label }
		: { label, href: arenaHref({ name: "run", runId }) };
	if (!run) return [runCrumb];
	return [
		{
			label: `${run.title ?? run.level} · ${difficultyLabel(run.difficulty)}`,
			href: arenaHref({
				name: "level",
				level: run.level,
				difficulty: run.difficulty,
			}),
		},
		runCrumb,
	];
}

/** Text that is cut to one line in a list: long, multi-line or already shortened ("…"). */
export const isLongText = (text: string, threshold = 80) =>
	text.length > threshold || text.includes("\n") || text.endsWith("…");

/**
 * One line of text, cut with "…"; "Show more" expands it inline and "Show less" collapses it
 * again. Pass `open`/`onOpenChange` to expand it from elsewhere (e.g. a click on its row).
 */
export function ExpandableText({
	text,
	className,
	open,
	onOpenChange,
	threshold,
}: {
	text: string;
	className?: string;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	threshold?: number;
}) {
	const [own, setOwn] = useState(false);
	const expanded = open ?? own;
	const ref = useRef<HTMLSpanElement>(null);
	const [overflowing, setOverflowing] = useState(false);
	// Collapsed: does the line overflow its box? (Kept while expanded, so "Show less" stays.)
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new `text` needs a new measurement.
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el || expanded) return;
		const check = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
		check();
		if (typeof ResizeObserver === "undefined") return;
		const observer = new ResizeObserver(check);
		observer.observe(el);
		return () => observer.disconnect();
	}, [text, expanded]);
	const long = overflowing || isLongText(text, threshold);
	return (
		<span
			data-expanded={long ? expanded : undefined}
			className={cn("flex min-w-0 items-baseline gap-2", className)}
		>
			<span
				ref={ref}
				title={long && !expanded ? text : undefined}
				className={cn(
					"min-w-0 flex-1",
					expanded ? "break-words whitespace-pre-wrap" : "truncate",
				)}
			>
				{text}
			</span>
			{long && (
				<button
					type="button"
					aria-expanded={expanded}
					onClick={(event) => {
						event.preventDefault();
						event.stopPropagation();
						(onOpenChange ?? setOwn)(!expanded);
					}}
					className="shrink-0 text-[11px] font-medium whitespace-nowrap text-blue-600 hover:underline focus-visible:outline-2 focus-visible:outline-blue-500"
				>
					{expanded ? "Show less" : "Show more"}
				</button>
			)}
		</span>
	);
}
