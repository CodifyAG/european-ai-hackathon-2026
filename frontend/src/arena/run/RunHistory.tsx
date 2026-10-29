import { RefreshCwIcon } from "lucide-react";
import { Led } from "@/components/led";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { listRuns } from "../api";
import { difficultyLabel, ErrorState, LoadingState } from "../components";
import { formatClock, STATUS_LABELS } from "../format";
import { arenaHref } from "../router";
import { ACTIVE_RUN_STATUSES, type LevelSummary } from "../types";
import { useArenaQuery } from "../useArenaQuery";

export function RunHistory({ levels }: { levels: LevelSummary[] }) {
	const query = useArenaQuery((signal) => listRuns(undefined, { signal }), []);
	return (
		<Card
			accent={false}
			role="region"
			aria-label="Run history"
			className="gap-0 py-0"
		>
			<div className="flex items-center justify-between gap-3 border-b px-5 py-4">
				<div>
					<h2 className="font-mono text-sm font-semibold uppercase tracking-wider">
						Run history
					</h2>
					<p className="mt-1 text-xs text-muted-foreground">
						Reopen a run to see its progress, results, and case replays.
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					disabled={query.loading}
					onClick={query.reload}
				>
					<RefreshCwIcon className="size-3.5" aria-hidden="true" />
					{query.loading ? "Refreshing…" : "Refresh"}
				</Button>
			</div>
			{query.loading && !query.data && <LoadingState label="Loading runs…" />}
			{query.error && (
				<ErrorState
					title="Run history could not be loaded."
					error={query.error}
					onRetry={query.reload}
				/>
			)}
			{query.data?.length === 0 && !query.error && (
				<p className="p-5 text-sm text-muted-foreground">
					No runs yet. Select a level above to start an evaluation.
				</p>
			)}
			{Boolean(query.data?.length) && !query.error && (
				<Table className="min-w-[48rem]">
					<TableHeader>
						<TableRow>
							<TableHead className="pl-5">Level / run</TableHead>
							<TableHead>Difficulty</TableHead>
							<TableHead>Status</TableHead>
							<TableHead>Started</TableHead>
							<TableHead className="text-right">Duration</TableHead>
							<TableHead className="text-right">Cases done</TableHead>
							<TableHead className="pr-5 text-right">Errors</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{query.data?.map((run) => {
							const active = ACTIVE_RUN_STATUSES.includes(run.status);
							return (
								<TableRow key={run.id}>
									<TableCell className="pl-5">
										<a
											href={arenaHref({ name: "run", runId: run.id })}
											aria-label={`Open run ${run.id}`}
											className="block text-primary hover:underline"
										>
											{levels.find((level) => level.id === run.level)?.title ??
												run.level}
											<span className="mt-1 block text-[10px] text-muted-foreground">
												{run.id}
											</span>
										</a>
									</TableCell>
									<TableCell>{difficultyLabel(run.difficulty)}</TableCell>
									<TableCell>
										<Badge
											variant={
												run.status === "failed"
													? "signal"
													: active
														? "warning"
														: "outline"
											}
										>
											<Led
												tone={
													active
														? "busy"
														: run.status === "failed"
															? "error"
															: run.status === "completed"
																? "ok"
																: "idle"
												}
												pulse={active}
												aria-hidden="true"
											/>
											{STATUS_LABELS[run.status]}
										</Badge>
									</TableCell>
									<TableCell>
										<time dateTime={run.started_at}>
											{new Date(run.started_at).toLocaleString()}
										</time>
									</TableCell>
									<TableCell className="is-numeric">
										{formatClock(run.elapsed)}
									</TableCell>
									<TableCell className="is-numeric">
										{run.progress.red.done + run.progress.green.done} /{" "}
										{run.progress.red.total + run.progress.green.total}
									</TableCell>
									<TableCell className="pr-5 text-right">
										<Badge
											variant={run.counts.error > 0 ? "signal" : "outline"}
										>
											{run.counts.error}
										</Badge>
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			)}
		</Card>
	);
}
