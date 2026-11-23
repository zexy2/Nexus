/**
 * Forgot/reset password pages: provider-less production explains itself, and
 * the reset page reads its token and link error from the URL.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ForgotPasswordPage from "@/app/forgot-password/page";
import ResetPasswordPage from "@/app/reset-password/page";
import { LocaleProvider } from "@/lib/i18n/provider";
import { messages } from "@/lib/i18n/messages";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.localStorage.setItem("nexus-locale", "en");
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

function renderPage(page: React.ReactElement) {
  return render(<LocaleProvider>{page}</LocaleProvider>);
}

describe("ForgotPasswordPage", () => {
  it("shows a friendly message when password reset is disabled", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: "RESET_PASSWORD_DISABLED", message: "Reset password isn't enabled" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    );
    const { container } = renderPage(<ForgotPasswordPage />);
    fireEvent.change(container.querySelector("#email")!, { target: { value: "a@example.com" } });
    fireEvent.submit(container.querySelector("form")!);
    expect(await screen.findByText(messages.en.auth.resetDisabled)).toBeTruthy();
    expect(screen.queryByText("Reset password isn't enabled")).toBeNull();
  });
});

describe("ResetPasswordPage", () => {
  it("shows the link error until the first submit, then posts the URL token", async () => {
    window.history.replaceState(null, "", "/reset-password?token=tok-123&error=INVALID_TOKEN");
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const { container } = renderPage(<ResetPasswordPage />);
    expect(await screen.findByText(messages.en.auth.tokenMissing)).toBeTruthy();

    const [password, confirm] = Array.from(container.querySelectorAll('input[type="password"]'));
    fireEvent.change(password, { target: { value: "new-password-1" } });
    fireEvent.change(confirm, { target: { value: "new-password-1" } });
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({ token: "tok-123", newPassword: "new-password-1" });
    await waitFor(() => expect(screen.queryByText(messages.en.auth.tokenMissing)).toBeNull());
  });

  it("refuses to submit without a token", async () => {
    window.history.replaceState(null, "", "/reset-password");
    const { container } = renderPage(<ResetPasswordPage />);
    fireEvent.submit(container.querySelector("form")!);
    expect(await screen.findByText(messages.en.auth.tokenMissing)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
