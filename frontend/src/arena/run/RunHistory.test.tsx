import {
	cleanup,
	fireEvent,
	render,
	screen,
	within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { levelsFixture } from "../fixtures";
import {
	hiddenMailboxRunCompleted,
	hiddenMailboxRunRunning,
} from "../fixtures/runs";
import { LevelList } from "../LevelList";
import { mockArenaFetch } from "../testing/fetch";
import { RunHistory } from "./RunHistory";

vi.mock("../../lib/auth-client", () => ({
	authClient: {
		useSession: () => ({ data: { user: { name: "Ada" } }, isPending: false }),
		signOut: vi.fn(),
	},
}));
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});
const API = "/api/v1/arena";

it("shows finished and active runs with links and recorded counts", async () => {
	mockArenaFetch({
		[`${API}/runs`]: [
			{ ...hiddenMailboxRunRunning, id: "active-run" },
			hiddenMailboxRunCompleted,
		],
	});
	render(<RunHistory levels={levelsFixture} />);
	const live = await screen.findByRole("link", { name: "Open run active-run" });
	expect(live).toHaveAttribute("href", "#/arena/runs/active-run");
	const finished = screen.getByRole("link", { name: "Open run run-hm-1" });
	expect(finished).toHaveAttribute("href", "#/arena/runs/run-hm-1");
	const row = finished.closest("tr")!;
	expect(within(row).getByText("Completed")).toBeVisible();
	expect(within(row).getByText("20 / 20")).toBeVisible();
	expect(within(row).getByText("04:51")).toBeVisible();
	expect(row.querySelector('[data-slot="led"]')).not.toHaveClass("animate-led");
	expect(live.closest("tr")?.querySelector('[data-slot="led"]')).toHaveClass(
		"animate-led",
	);
	expect(
		screen.getAllByRole("link").map((link) => link.getAttribute("href")),
	).toEqual(["#/arena/runs/active-run", "#/arena/runs/run-hm-1"]);
});

it("shows an empty history and refreshes without leaving the screen", async () => {
	let runs = false;
	mockArenaFetch({
		[`${API}/runs`]: () =>
			runs ? [{ ...hiddenMailboxRunCompleted, level: "removed-level" }] : [],
	});
	render(<RunHistory levels={[]} />);
	expect(await screen.findByText(/No runs yet/)).toBeVisible();
	runs = true;
	fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
	expect(await screen.findByText("removed-level")).toBeVisible();
});

it("keeps levels usable when history fails and supports retry", async () => {
	let failed = true;
	mockArenaFetch({
		[`${API}/levels`]: levelsFixture,
		[`${API}/runs`]: () =>
			failed
				? new Response(JSON.stringify({ detail: "Unavailable" }), {
						status: 503,
					})
				: [],
	});
	render(<LevelList />);
	expect(
		await screen.findByText("Run history could not be loaded."),
	).toBeVisible();
	expect(
		screen.getByRole("link", { name: "Level 1 · Hidden Mailbox" }),
	).toHaveAttribute("href", "#/arena/levels/hidden-mailbox/easy");
	failed = false;
	fireEvent.click(screen.getByRole("button", { name: "Try again" }));
	expect(await screen.findByText(/No runs yet/)).toBeVisible();
	expect(screen.queryByRole("alert")).toBeNull();
});
