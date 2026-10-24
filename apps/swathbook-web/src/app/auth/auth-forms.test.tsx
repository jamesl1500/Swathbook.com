import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthFormState } from "./actions";

const state = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock("next/navigation", () => ({ useSearchParams: () => state.params }));
vi.mock("./actions", () => ({
    signIn: vi.fn(async (): Promise<AuthFormState> => ({})),
    signUp: vi.fn(async (): Promise<AuthFormState> => ({})),
    updatePassword: vi.fn(async (): Promise<AuthFormState> => ({})),
    requestPasswordReset: vi.fn(async (): Promise<AuthFormState> => ({})),
}));

import { requestPasswordReset, signIn, signUp, updatePassword } from "./actions";
import { ForgotPasswordForm } from "./forgot_password/forgot-password-form";
import { LoginForm } from "./login/login-form";
import { ResetPasswordForm } from "./reset_password/reset-password-form";
import { SignupForm } from "./signup/signup-form";

/** FormData the mocked action received on its nth call. */
function submitted(action: unknown, call = 0) {
    const formData = vi.mocked(action as (prev: AuthFormState, data: FormData) => Promise<AuthFormState>).mock.calls[call][1];
    return Object.fromEntries(formData.entries());
}

beforeEach(() => {
    state.params = new URLSearchParams();
});

describe("LoginForm", () => {
    it("submits the credentials and the ?next= destination", async () => {
        state.params = new URLSearchParams("next=/onboarding?new=1");
        const user = userEvent.setup();
        render(<LoginForm />);

        await user.type(screen.getByLabelText("Email"), "dana@example.com");
        await user.type(screen.getByLabelText("Password"), "secret-pass");
        await user.click(screen.getByRole("button", { name: "Log in" }));

        await waitFor(() => expect(signIn).toHaveBeenCalledTimes(1));
        expect(submitted(signIn)).toEqual({ email: "dana@example.com", password: "secret-pass", next: "/onboarding?new=1" });
    });

    it("shows the server's error and keeps the email", async () => {
        vi.mocked(signIn).mockResolvedValueOnce({ error: "That email and password don't match.", values: { email: "dana@example.com" } });
        const user = userEvent.setup();
        render(<LoginForm />);

        await user.type(screen.getByLabelText("Email"), "dana@example.com");
        await user.type(screen.getByLabelText("Password"), "wrong-pass");
        await user.click(screen.getByRole("button", { name: "Log in" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("That email and password don't match.");
        expect(screen.getByLabelText("Email")).toHaveValue("dana@example.com");
    });

    it("marks invalid fields for assistive tech", async () => {
        vi.mocked(signIn).mockResolvedValueOnce({ fieldErrors: { email: ["Enter a valid email address."] }, values: { email: "x" } });
        const user = userEvent.setup();
        render(<LoginForm />);
        await user.click(screen.getByRole("button", { name: "Log in" }));

        const email = await screen.findByLabelText("Email");
        await waitFor(() => expect(email).toHaveAttribute("aria-invalid", "true"));
        expect(email).toHaveAccessibleDescription("Enter a valid email address.");
    });

    it("lets people reveal their password", async () => {
        const user = userEvent.setup();
        render(<LoginForm />);
        const password = screen.getByLabelText("Password");
        expect(password).toHaveAttribute("type", "password");
        await user.click(screen.getByRole("button", { name: "Show password" }));
        expect(password).toHaveAttribute("type", "text");
    });

    it("links to password recovery", () => {
        render(<LoginForm />);
        expect(screen.getByRole("link", { name: "Forgot password?" })).toHaveAttribute("href", "/auth/forgot_password");
    });
});

describe("SignupForm", () => {
    it("carries the link claimed on the homepage through signup", async () => {
        state.params = new URLSearchParams("slug=Green Acres");
        const user = userEvent.setup();
        render(<SignupForm />);

        expect(screen.getByText(/Saving/)).toHaveTextContent("Saving swathbook.com/green-acres for you");

        await user.type(screen.getByLabelText("Your name"), "Dana Field");
        await user.type(screen.getByLabelText("Email"), "dana@example.com");
        await user.type(screen.getByLabelText("Password"), "long-enough");
        await user.click(screen.getByRole("button", { name: "Create account" }));

        await waitFor(() => expect(signUp).toHaveBeenCalledTimes(1));
        expect(submitted(signUp)).toEqual({
            slug: "green-acres",
            fullName: "Dana Field",
            email: "dana@example.com",
            password: "long-enough",
        });
    });

    it("works without a claimed link", () => {
        render(<SignupForm />);
        expect(screen.queryByText(/Saving/)).not.toBeInTheDocument();
    });

    it("shows each field's error", async () => {
        vi.mocked(signUp).mockResolvedValueOnce({
            fieldErrors: { fullName: ["Tell us your name."], password: ["Use at least 8 characters."] },
            values: { fullName: "", email: "dana@example.com", slug: "" },
        });
        const user = userEvent.setup();
        render(<SignupForm />);
        await user.click(screen.getByRole("button", { name: "Create account" }));

        expect(await screen.findByText("Tell us your name.")).toBeInTheDocument();
        expect(screen.getByText("Use at least 8 characters.")).toBeInTheDocument();
        expect(screen.getByLabelText("Email")).toHaveValue("dana@example.com");
    });
});

describe("ForgotPasswordForm", () => {
    it("confirms the email was sent and offers to resend", async () => {
        vi.mocked(requestPasswordReset).mockResolvedValueOnce({
            success: "If there's an account for dana@example.com, a reset link is on its way.",
            values: { email: "dana@example.com" },
        });
        const user = userEvent.setup();
        render(<ForgotPasswordForm />);
        await user.type(screen.getByLabelText("Email"), "dana@example.com");
        await user.click(screen.getByRole("button", { name: "Send reset link" }));

        expect(await screen.findByRole("status")).toHaveTextContent("a reset link is on its way");
        expect(screen.getByRole("button", { name: "Send it again" })).toBeInTheDocument();
    });
});

describe("ResetPasswordForm", () => {
    it("submits both passwords", async () => {
        const user = userEvent.setup();
        render(<ResetPasswordForm />);
        await user.type(screen.getByLabelText("New password"), "new-password");
        await user.type(screen.getByLabelText("Confirm new password"), "new-password");
        await user.click(screen.getByRole("button", { name: "Save new password" }));

        await waitFor(() => expect(updatePassword).toHaveBeenCalledTimes(1));
        expect(submitted(updatePassword)).toEqual({ password: "new-password", confirmPassword: "new-password" });
    });

    it("offers a fresh link when the recovery session expired", async () => {
        vi.mocked(updatePassword).mockResolvedValueOnce({ error: "Your reset link has expired." });
        const user = userEvent.setup();
        render(<ResetPasswordForm />);
        await user.click(screen.getByRole("button", { name: "Save new password" }));

        expect(await screen.findByRole("alert")).toHaveTextContent("Your reset link has expired.");
        expect(screen.getByRole("link", { name: "Get a new link" })).toHaveAttribute("href", "/auth/forgot_password");
    });
});
