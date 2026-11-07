import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(state.search) }));

import { Tabs, type TabItem } from "./tabs";

const items: TabItem[] = [
    { id: "share", label: "Share", content: <p>Share panel</p> },
    { id: "details", label: "Details", content: <input aria-label="Business name" /> },
    { id: "google", label: "Google", badge: "3 of 7", content: <p>Google panel</p> },
];

function setup(search = "") {
    state.search = search;
    window.history.replaceState(null, "", `/dashboard/link${search ? `?${search}` : ""}`);
    const replace = vi.spyOn(window.history, "replaceState");
    render(<Tabs label="Page sections" items={items} />);
    return { user: userEvent.setup(), replace };
}

const tab = (name: string | RegExp) => screen.getByRole("tab", { name });

beforeEach(() => {
    state.search = "";
});

describe("Tabs", () => {
    it("opens on the first tab and shows only its panel", () => {
        setup();
        expect(screen.getByRole("tablist", { name: "Page sections" })).toBeInTheDocument();
        expect(tab("Share")).toHaveAttribute("aria-selected", "true");
        expect(tab("Share")).toHaveAttribute("tabindex", "0");
        expect(tab("Details")).toHaveAttribute("tabindex", "-1");
        expect(screen.getByRole("tabpanel")).toHaveTextContent("Share panel");
        expect(screen.getByRole("tabpanel")).toHaveAccessibleName("Share");
    });

    it("opens the tab named in the URL", () => {
        setup("tab=google");
        expect(tab(/^Google/)).toHaveAttribute("aria-selected", "true");
    });

    it("falls back to the first tab for an unknown ?tab=", () => {
        setup("tab=nope");
        expect(tab("Share")).toHaveAttribute("aria-selected", "true");
    });

    it("switches on click and records the tab in the URL, keeping other params", async () => {
        const { user, replace } = setup("week=2026-11-09");
        await user.click(tab("Details"));
        expect(tab("Details")).toHaveAttribute("aria-selected", "true");
        expect(replace).toHaveBeenLastCalledWith(null, "", "/dashboard/link?week=2026-11-09&tab=details");

        // The first tab is the default, so it drops the param.
        await user.click(tab("Share"));
        expect(replace).toHaveBeenLastCalledWith(null, "", "/dashboard/link?week=2026-11-09");
    });

    it("keeps hidden panels mounted, so typing isn't lost", async () => {
        const { user } = setup();
        await user.click(tab("Details"));
        await user.type(screen.getByLabelText("Business name"), "Shine On");
        await user.click(tab(/Google/));
        expect(screen.getByLabelText("Business name")).not.toBeVisible();
        await user.click(tab("Details"));
        expect(screen.getByLabelText("Business name")).toHaveValue("Shine On");
    });

    it("moves with the arrow, Home and End keys, wrapping around", async () => {
        const { user } = setup();
        await user.click(tab("Share"));
        await user.keyboard("{ArrowRight}");
        expect(tab("Details")).toHaveFocus();
        expect(tab("Details")).toHaveAttribute("aria-selected", "true");
        await user.keyboard("{End}");
        expect(tab(/Google/)).toHaveFocus();
        await user.keyboard("{ArrowRight}");
        expect(tab("Share")).toHaveFocus();
        await user.keyboard("{ArrowLeft}");
        expect(tab(/Google/)).toHaveFocus();
        await user.keyboard("{Home}");
        expect(tab("Share")).toHaveAttribute("aria-selected", "true");
    });
});
