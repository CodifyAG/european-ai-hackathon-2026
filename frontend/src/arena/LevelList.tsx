import { ArrowRightIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { listLevels } from "./api";
import {
	ArenaShell,
	difficultyLabel,
	ErrorState,
	LoadingState,
	SurfaceBadge,
} from "./components";
import { arenaHref } from "./router";
import { RunList } from "./run/RunList";
import type { LevelSummary } from "./types";
import { useArenaQuery } from "./useArenaQuery";

function LevelCard({ level }: { level: LevelSummary }) {
	const first = level.difficulties[0] ?? "easy";
	return (
		<li className="flex">
			<Card className="w-full gap-2 p-3">
				<div className="flex flex-wrap items-center gap-2">
					<SurfaceBadge channel={level.channel} turns={level.turns} />
					{level.modified && (
						<span
							title="Served with edits saved in the UI"
							className="rounded-none border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[11px] font-medium text-warning"
						>
							Modified
						</span>
					)}
					{level.override_error && (
						<span
							title={level.override_error}
							className="rounded-none border border-arena-attacker/30 bg-arena-attacker/10 px-1.5 py-0.5 text-[11px] font-medium text-arena-attacker"
						>
							Saved edits do not load
						</span>
					)}
				</div>
				<div className="flex flex-col gap-1">
					<h2 className="text-sm font-semibold tracking-tight">
						<a
							href={arenaHref({
								name: "level",
								level: level.id,
								difficulty: first,
							})}
							className="hover:text-primary focus-visible:outline-2 focus-visible:outline-primary"
						>
							{level.title}
						</a>
					</h2>
					<p
						title={level.description}
						className="line-clamp-2 text-xs leading-relaxed text-muted-foreground"
					>
						{level.description}
					</p>
				</div>
				<nav
					aria-label={`${level.title} difficulties`}
					className="mt-auto flex flex-wrap gap-1.5 pt-1"
				>
					{level.difficulties.map((difficulty) => (
						<a
							key={difficulty}
							href={arenaHref({ name: "level", level: level.id, difficulty })}
							className="flex items-center gap-1.5 rounded-none border px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
						>
							{difficultyLabel(difficulty)}
							<ArrowRightIcon className="size-3.5" aria-hidden="true" />
						</a>
					))}
				</nav>
			</Card>
		</li>
	);
}

export function LevelList() {
	const query = useArenaQuery((signal) => listLevels({ signal }), []);
	const levelTitles = Object.fromEntries(
		(query.data ?? []).map((level) => [level.id, level.title]),
	);
	return (
		<ArenaShell crumbs={[{ label: "Levels" }]}>
			<div className="min-h-0 flex-1 overflow-y-auto">
				<div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6">
					<div className="flex flex-col gap-1">
						<h1 className="text-xl font-semibold tracking-tight">Levels</h1>
						<p className="text-sm text-muted-foreground">
							Select a level to configure and start an evaluation.
						</p>
					</div>
					{query.loading && !query.data && (
						<LoadingState label="Loading levels…" />
					)}
					{query.error && (
						<ErrorState
							title="Levels could not be loaded."
							error={query.error}
							onRetry={query.reload}
						/>
					)}
					{query.data && !query.error && (
						<ul
							aria-label="Levels"
							className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
						>
							{query.data.map((level) => (
								<LevelCard key={level.id} level={level} />
							))}
						</ul>
					)}
					{query.data?.length === 0 && (
						<p className="text-sm text-muted-foreground">
							No levels are configured.
						</p>
					)}
					<section
						aria-labelledby="runs-heading"
						className="flex flex-col gap-3"
					>
						<div className="flex flex-col gap-1">
							<h2
								id="runs-heading"
								className="font-mono text-xs font-semibold uppercase tracking-widest text-phosphor-bright"
							>
								Runs
							</h2>
							<p className="text-sm text-muted-foreground">
								Running evaluations first, then finished ones, newest first.
								Open a run to watch it live or see its results.
							</p>
						</div>
						<Card accent={false} className="gap-0 overflow-hidden py-0">
							<RunList levelTitles={levelTitles} />
						</Card>
					</section>
				</div>
			</div>
		</ArenaShell>
	);
}
