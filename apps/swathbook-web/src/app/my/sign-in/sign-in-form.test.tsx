import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerSignInState } from "../actions";

const state = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock("next/navigation", () => ({ useSearchParams: () => state.params }));
vi.mock("../actions", () => ({
    customerSignIn: vi.fn(async (): Promise<CustomerSignInState> => ({ step: "code", email: "cara@example.com" })),
}));

import { customerSignIn } from "../actions";
import { CustomerSignInForm } from "./sign-in-form";

function submitted(call = 0) {
    return Object.fromEntries(vi.mocked(customerSignIn).mock.calls[call][1].entries());
}

beforeEach(() => {
    state.params = new URLSearchParams();
});

describe("CustomerSignInForm", () => {
    it("sends a code, then asks for it", async () => {
        state.params = new URLSearchParams("next=/my/jobs/abc");
        const user = userEvent.setup();
        render(<CustomerSignInForm />);

        await user.type(screen.getByLabelText("Email"), "cara@example.com");
        await user.click(screen.getByRole("button", { name: "Email me a code" }));

        await waitFor(() => expect(customerSignIn).toHaveBeenCalledTimes(1));
        expect(submitted()).toEqual({ intent: "send", email: "cara@example.com", next: "/my/jobs/abc" });
        expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
        expect(screen.getByText("cara@example.com")).toBeInTheDocument();
    });

    it("signs in with the code, carrying the email and ?next=", async () => {
        state.params = new URLSearchParams("next=/my/profile");
        const user = userEvent.setup();
        render(<CustomerSignInForm />);
        await user.type(screen.getByLabelText("Email"), "cara@example.com");
        await user.click(screen.getByRole("button", { name: "Email me a code" }));

        await user.type(await screen.findByLabelText("Sign-in code"), "12345678");
        // Enter submits the first button: Sign in.
        await user.keyboard("{Enter}");

        await waitFor(() => expect(customerSignIn).toHaveBeenCalledTimes(2));
        expect(submitted(1)).toEqual({ intent: "verify", email: "cara@example.com", code: "12345678", next: "/my/profile" });
    });

    it("shows a code error from the server on the field", async () => {
        vi.mocked(customerSignIn)
            .mockResolvedValueOnce({ step: "code", email: "cara@example.com" })
            .mockResolvedValueOnce({ step: "code", email: "cara@example.com", fieldErrors: { code: ["That code is wrong or has expired."] } });
        const user = userEvent.setup();
        render(<CustomerSignInForm />);
        await user.type(screen.getByLabelText("Email"), "cara@example.com");
        await user.click(screen.getByRole("button", { name: "Email me a code" }));
        await user.type(await screen.findByLabelText("Sign-in code"), "00000000");
        await user.click(screen.getByRole("button", { name: "Sign in" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("That code is wrong or has expired.");
        expect(screen.getByLabelText("Sign-in code")).toHaveAttribute("aria-invalid", "true");
    });
});
