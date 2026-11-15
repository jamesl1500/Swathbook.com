import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Ban, ExternalLink, Play } from "lucide-react";
import { ActionMenu } from "./action-menu";

function setup() {
    const start = vi.fn();
    const cancel = vi.fn();
    render(
        <ActionMenu
            label="More actions for Pat"
            actions={[
                { key: "cancel", label: "Cancel job", icon: Ban, danger: true, onSelect: cancel },
                { key: "open", label: "Open job", icon: ExternalLink, href: "/dashboard/schedule/b1" },
                { key: "start", label: "Start job", icon: Play, onSelect: start },
            ]}
        />,
    );
    return { user: userEvent.setup(), start, cancel };
}

describe("ActionMenu", () => {
    it("opens a menu with destructive actions last", async () => {
        const { user } = setup();
        const trigger = screen.getByRole("button", { name: "More actions for Pat" });
        expect(trigger).toHaveAttribute("aria-expanded", "false");
        await user.click(trigger);
        expect(trigger).toHaveAttribute("aria-expanded", "true");
        expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["Open job", "Start job", "Cancel job"]);
        expect(screen.getByRole("menuitem", { name: "Open job" })).toHaveAttribute("href", "/dashboard/schedule/b1");
    });

    it("runs an action and closes", async () => {
        const { user, start } = setup();
        await user.click(screen.getByRole("button", { name: "More actions for Pat" }));
        await user.click(screen.getByRole("menuitem", { name: "Start job" }));
        expect(start).toHaveBeenCalledOnce();
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("works from the keyboard and returns focus on Escape", async () => {
        const { user, cancel } = setup();
        const trigger = screen.getByRole("button", { name: "More actions for Pat" });
        trigger.focus();
        await user.keyboard("{Enter}");
        expect(screen.getByRole("menuitem", { name: "Open job" })).toHaveFocus();
        await user.keyboard("{ArrowUp}");
        expect(screen.getByRole("menuitem", { name: "Cancel job" })).toHaveFocus();
        await user.keyboard("{Home}{ArrowDown}");
        expect(screen.getByRole("menuitem", { name: "Start job" })).toHaveFocus();
        await user.keyboard("{Escape}");
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
        expect(cancel).not.toHaveBeenCalled();
    });

    it("closes on a click outside", async () => {
        const { user } = setup();
        await user.click(screen.getByRole("button", { name: "More actions for Pat" }));
        await user.click(document.body);
        expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("renders nothing without actions", () => {
        const { container } = render(<ActionMenu label="Nothing" actions={[]} />);
        expect(container).toBeEmptyDOMElement();
    });
});
