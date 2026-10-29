import {
	Handle,
	type NodeProps,
	type NodeTypes,
	Position,
} from "@xyflow/react";
import {
	BotIcon,
	BoxIcon,
	CircleCheckIcon,
	CrosshairIcon,
	DatabaseIcon,
	ListFilterIcon,
	type LucideIcon,
	MailWarningIcon,
	MessageSquareQuoteIcon,
	ReplyIcon,
	ShieldCheckIcon,
	WrenchIcon,
} from "lucide-react";
import { memo, type ReactNode } from "react";
import { Led } from "@/components/led";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { GraphNode } from "../types";
import { type NodeHighlight, useGraphContext } from "./context";
import {
	type FlowNode,
	type FlowNodeType,
	flowTypeName,
	formatPosition,
	groupPosition,
	SIDE_HANDLE_OFFSETS,
} from "./layout";

// Handles --------------------------------------------------------------------

const SIDES = [
	["left", Position.Left],
	["right", Position.Right],
	["top", Position.Top],
	["bottom", Position.Bottom],
] as const;
const VERTICAL_OFFSETS = { a: "50%", b: "68%" } as const;

/** Invisible handles on every side; `pickHandles` in layout.ts chooses which ones an edge uses. */
function Handles() {
	return SIDES.flatMap(([side, position]) =>
		(["a", "b"] as const).flatMap((slot) =>
			(["source", "target"] as const).map((type) => (
				<Handle
					key={`${type}-${side}-${slot}`}
					id={`${type === "source" ? "s" : "t"}-${side}-${slot}`}
					type={type}
					position={position}
					isConnectable={false}
					className="!pointer-events-none !min-h-0 !min-w-0 !size-1 !border-0 !bg-transparent"
					style={
						side === "left" || side === "right"
							? { top: SIDE_HANDLE_OFFSETS[slot] }
							: { left: VERTICAL_OFFSETS[slot] }
					}
				/>
			)),
		),
	);
}

// Visual tokens --------------------------------------------------------------

interface Tone {
	kicker: string;
	icon: LucideIcon;

	accent: string;
	kickerText: string;
	iconBox: string;
}

const TONES: Record<Exclude<FlowNodeType, "guardrails" | "tools">, Tone> = {
	attacker: {
		accent: "var(--arena-attacker)",
		kicker: "Red team",
		icon: CrosshairIcon,
		kickerText: "text-arena-attacker",
		iconBox: "bg-arena-attacker/10 text-arena-attacker",
	},
	injection: {
		accent: "var(--arena-attacker)",
		kicker: "Injection point",
		icon: MailWarningIcon,
		kickerText: "text-warning",
		iconBox: "bg-warning/10 text-warning",
	},
	user_task: {
		accent: "var(--arena-agent)",
		kicker: "User task · fixed",
		icon: MessageSquareQuoteIcon,
		kickerText: "text-muted-foreground",
		iconBox: "bg-muted text-muted-foreground",
	},
	agent: {
		accent: "var(--arena-agent)",
		kicker: "Agent",
		icon: BotIcon,
		kickerText: "text-arena-agent",
		iconBox: "bg-arena-agent/10 text-arena-agent",
	},
	data: {
		accent: "var(--arena-data)",
		kicker: "Data",
		icon: DatabaseIcon,
		kickerText: "text-warning",
		iconBox: "bg-warning/10 text-warning",
	},
	success: {
		accent: "var(--arena-check)",
		kicker: "Success check",
		icon: CircleCheckIcon,
		kickerText: "text-arena-check",
		iconBox: "bg-arena-check/10 text-arena-check",
	},
	output: {
		accent: "var(--arena-agent)",
		kicker: "Output",
		icon: ReplyIcon,
		kickerText: "text-muted-foreground",
		iconBox: "bg-muted text-muted-foreground",
	},
	generic: {
		accent: "var(--arena-tools)",
		kicker: "Node",
		icon: BoxIcon,
		kickerText: "text-muted-foreground",
		iconBox: "bg-muted text-muted-foreground",
	},
};

const HIGHLIGHT_CLASSES: Record<NodeHighlight, string> = {
	visited: "border-primary/30",
	current: "ring-2 ring-primary shadow-lg shadow-primary/20",
	blocked: "ring-2 ring-warning",
	alert: "ring-2 ring-arena-attacker shadow-lg shadow-arena-attacker/20",
};

function useNodeState(id: string) {
	const { selectedId, onSelect, highlight } = useGraphContext();
	const state = highlight?.nodes?.[id];
	return {
		selected: selectedId === id,
		select: () => onSelect?.(id),
		highlight: state,
		dimmed: Boolean(highlight?.nodes) && !state,
		annotation: highlight?.annotations?.[id],
	};
}

function stateClasses({
	selected,
	highlight,
	dimmed,
}: {
	selected: boolean;
	highlight?: NodeHighlight;
	dimmed: boolean;
}) {
	return cn(
		highlight && HIGHLIGHT_CLASSES[highlight],
		dimmed && "opacity-45",
		selected && "outline-2 outline-offset-2 outline-ring",
	);
}

function ArenaNodeFrame({
	accent,
	state,
	children,
}: {
	accent: string;
	state: ReturnType<typeof useNodeState>;
	children: ReactNode;
}) {
	return (
		<div className="arena-node relative h-full w-full">
			<Handles />
			<Card
				accent={accent}
				className={cn("arena-node-card h-full gap-0 py-0", stateClasses(state))}
			>
				{children}
			</Card>
		</div>
	);
}

function NodeStatus({ state }: { state: ReturnType<typeof useNodeState> }) {
	const tone =
		state.highlight === "current"
			? "busy"
			: state.highlight === "alert"
				? "error"
				: state.highlight === "blocked"
					? "busy"
					: state.highlight === "visited"
						? "ok"
						: "idle";
	const label =
		state.highlight === "current"
			? "Running"
			: state.highlight === "visited"
				? "Complete"
				: state.highlight === "alert"
					? "Alert"
					: state.highlight === "blocked"
						? "Blocked"
						: "Idle";
	return (
		<span className="flex items-center gap-1.5 text-[9px] uppercase text-muted-foreground">
			<Led
				tone={tone}
				pulse={state.highlight === "current"}
				aria-hidden="true"
			/>
			{label}
		</span>
	);
}

const cardBase =
	"nodrag nopan relative flex h-full w-full flex-col text-left focus-visible:outline-2 focus-visible:outline-ring";
const kickerBase = "text-[10px] font-semibold uppercase tracking-[0.12em]";

// Simple nodes ---------------------------------------------------------------

function SimpleNode({
	node,
	type,
	children,
}: {
	node: GraphNode;
	type: keyof typeof TONES;
	children?: ReactNode;
}) {
	const tone = TONES[type];
	const Icon = tone.icon;
	const state = useNodeState(node.id);
	return (
		<ArenaNodeFrame accent={tone.accent} state={state}>
			<button
				type="button"
				onClick={state.select}
				aria-pressed={state.selected}
				aria-label={`${tone.kicker}: ${node.label}`}
				data-node-id={node.id}
				data-highlight={state.highlight ?? undefined}
				className={cn(cardBase, "gap-2 px-3.5 py-3")}
			>
				<span className="flex min-w-0 items-start gap-2.5">
					<span
						className={cn(
							"mt-0.5 grid size-7 shrink-0 place-items-center rounded-none",
							tone.iconBox,
						)}
					>
						<Icon className="size-4" aria-hidden="true" />
					</span>
					<span className="min-w-0 flex-1">
						<span
							className={cn(
								kickerBase,
								"flex items-center justify-between gap-2",
								tone.kickerText,
							)}
						>
							{tone.kicker}
							<NodeStatus state={state} />
						</span>
						<span
							className={cn(
								"block font-semibold leading-snug text-foreground",
								type === "user_task"
									? "line-clamp-2 text-[13px]"
									: "truncate text-sm",
							)}
						>
							{type === "user_task" ? `“${node.label}”` : node.label}
						</span>
					</span>
					{state.annotation && (
						<span className="shrink-0 font-mono text-[11px] text-muted-foreground">
							{state.annotation}
						</span>
					)}
				</span>
				{children}
				{node.subtitle && (
					<span className="line-clamp-2 text-xs leading-snug text-muted-foreground">
						{node.subtitle}
					</span>
				)}
			</button>
		</ArenaNodeFrame>
	);
}

const makeSimple = (type: keyof typeof TONES) =>
	memo(function KindNode({ data }: NodeProps<FlowNode>) {
		return <SimpleNode node={data.node} type={type} />;
	});

/** The backend labels the node "User task" and sends the task text as subtitle; the card quotes the text. */
const UserTaskNode = memo(function UserTaskNode({ data }: NodeProps<FlowNode>) {
	const { node } = data;
	return (
		<SimpleNode
			node={{ ...node, label: node.subtitle || node.label, subtitle: null }}
			type="user_task"
		/>
	);
});

const AgentNode = memo(function AgentNode({ data }: NodeProps<FlowNode>) {
	const model = data.node.details?.model?.model;
	return (
		<SimpleNode node={{ ...data.node, subtitle: null }} type="agent">
			<span className="flex min-w-0 flex-wrap items-center gap-1.5">
				{model && (
					<span className="truncate font-mono text-[11px] text-muted-foreground">
						{model}
					</span>
				)}
				{data.node.subtitle && data.node.subtitle !== model && (
					<span className="truncate rounded-none border border-border bg-card px-1.5 py-0.5 text-[11px] text-muted-foreground">
						{data.node.subtitle}
					</span>
				)}
			</span>
		</SimpleNode>
	);
});

// Group nodes ----------------------------------------------------------------

function MemberRow({
	member,
	icon: Icon,
	tag,
	mono,
}: {
	member: GraphNode;
	icon?: LucideIcon;
	tag?: string;
	mono?: boolean;
}) {
	const state = useNodeState(member.id);
	return (
		<li>
			<button
				type="button"
				onClick={(event) => {
					event.stopPropagation();
					state.select();
				}}
				aria-pressed={state.selected}
				data-node-id={member.id}
				data-highlight={state.highlight ?? undefined}
				className={cn(
					"nodrag nopan flex w-full items-center gap-2 rounded-none border border-border bg-card px-2.5 text-left text-[13px] text-foreground transition-colors hover:border-border focus-visible:outline-2 focus-visible:outline-primary",
					mono ? "h-[30px] font-mono text-xs" : "h-9",
					state.selected && "border-primary/30 bg-primary/10 text-primary",
					stateClasses({ ...state, selected: false }),
				)}
			>
				{Icon && (
					<Icon
						className="size-3.5 shrink-0 text-muted-foreground"
						aria-hidden="true"
					/>
				)}
				<span className="min-w-0 flex-1 truncate">{member.label}</span>
				{(state.annotation ?? tag) && (
					<span
						className={cn(
							"shrink-0 text-[10.5px]",
							state.annotation
								? "font-mono text-muted-foreground"
								: "font-medium text-muted-foreground",
						)}
					>
						{state.annotation ?? tag}
					</span>
				)}
			</button>
		</li>
	);
}

function GroupNode({
	node,
	members,
	kicker,
	aside,
	className,
	kickerClass,
	children,
}: {
	node: GraphNode;
	members: GraphNode[];
	kicker: string;
	aside?: string | null;
	className: string;
	kickerClass: string;
	children: ReactNode;
}) {
	const state = useNodeState(node.id);
	const { highlight } = useGraphContext();
	// A group is part of the visited path as soon as one of its members is.
	const memberVisited = members.some((m) => highlight?.nodes?.[m.id]);
	return (
		<ArenaNodeFrame
			accent={
				kicker === "Guardrails" ? "var(--arena-defender)" : "var(--arena-tools)"
			}
			state={{ ...state, dimmed: state.dimmed && !memberVisited }}
		>
			<div
				data-node-id={node.id}
				data-highlight={state.highlight ?? undefined}
				className={cn(
					"relative flex h-full w-full flex-col px-2.5 pb-2.5",
					className,
				)}
			>
				<button
					type="button"
					onClick={state.select}
					aria-pressed={state.selected}
					aria-label={`${kicker}${aside ? ` ${aside}` : ""}`}
					className="nodrag nopan flex h-10 shrink-0 items-center justify-between gap-2 px-1 text-left focus-visible:outline-2 focus-visible:outline-primary"
				>
					<span className={cn(kickerBase, kickerClass)}>{kicker}</span>
					{aside && (
						<span className="truncate font-mono text-[11px] text-muted-foreground">
							{aside}
						</span>
					)}
				</button>
				{children}
			</div>
		</ArenaNodeFrame>
	);
}

const GuardrailsNode = memo(function GuardrailsNode({
	data,
}: NodeProps<FlowNode>) {
	const position = groupPosition(data.node.id) ?? data.node.subtitle ?? "";
	return (
		<GroupNode
			node={data.node}
			members={data.members}
			kicker="Guardrails"
			aside={formatPosition(position)}
			className=""
			kickerClass="text-arena-defender"
		>
			<ul
				className="flex flex-col gap-1.5"
				aria-label={`Guardrails at ${position}`}
			>
				{data.members.map((member) => (
					<MemberRow
						key={member.id}
						member={member}
						icon={member.details?.model ? ShieldCheckIcon : ListFilterIcon}
						tag={member.details?.model ? "LLM" : "rule"}
					/>
				))}
			</ul>
		</GroupNode>
	);
});

const ToolsNode = memo(function ToolsNode({ data }: NodeProps<FlowNode>) {
	return (
		<GroupNode
			node={data.node}
			members={data.members}
			kicker="Tools"
			aside={data.node.subtitle}
			className="border-border bg-card/80"
			kickerClass="text-arena-tools"
		>
			<ul className="flex flex-col gap-1" aria-label="Tools">
				{data.members.map((member) => (
					<MemberRow key={member.id} member={member} icon={WrenchIcon} mono />
				))}
			</ul>
		</GroupNode>
	);
});

export const nodeTypes: NodeTypes = {
	[flowTypeName("attacker")]: makeSimple("attacker"),
	[flowTypeName("injection")]: makeSimple("injection"),
	[flowTypeName("user_task")]: UserTaskNode,
	[flowTypeName("agent")]: AgentNode,
	[flowTypeName("data")]: makeSimple("data"),
	[flowTypeName("success")]: makeSimple("success"),
	[flowTypeName("output")]: makeSimple("output"),
	[flowTypeName("generic")]: makeSimple("generic"),
	[flowTypeName("guardrails")]: GuardrailsNode,
	[flowTypeName("tools")]: ToolsNode,
};
