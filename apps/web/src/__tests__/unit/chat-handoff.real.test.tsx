/**
 * Ask Nexus handoff: the header dialog sends the typed question to
 * /dashboard/chat?q=..., and the chat page sends it exactly once, then drops
 * `q` from the URL so a reload does not ask again.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  params: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace, back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => nav.params,
  usePathname: () => "/dashboard/chat",
  useParams: () => ({}),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({ data: { user: { id: "user-1" } } }),
}));

vi.mock("@/components/shared/toast-provider", () => ({
  showToast: { success: vi.fn(), error: vi.fn() },
}));

import ChatPage from "@/app/dashboard/chat/page";
import { ModalProvider } from "@/components/shared/modal-provider";
import { useUIStore } from "@/lib/store";
import { useChatStore } from "@/lib/stores/chat-store";

const fetchMock = vi.fn();

beforeEach(() => {
  window.localStorage.clear();
  nav.push.mockReset();
  nav.replace.mockReset();
  nav.params = new URLSearchParams();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (String(url).startsWith("/api/ai/quota")) return new Response("{}", { status: 500 });
    return new Response("Four tasks are orphaned.");
  });
  vi.stubGlobal("fetch", fetchMock);
  Element.prototype.scrollIntoView = vi.fn();
  useChatStore.setState({ userId: null, sessions: [], currentSessionId: null, isLoading: false, error: null });
});

const chatCalls = () => fetchMock.mock.calls.filter(([url]) => url === "/api/chat");

describe("Ask Nexus dialog", () => {
  it("Enter navigates to the chat with the encoded question", () => {
    useUIStore.getState().openModal("aiAssistant");
    render(<ModalProvider />);

    const input = screen.getByTestId("ask-nexus-input");
    fireEvent.change(input, { target: { value: "Which tasks are not linked? & why" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(nav.push).toHaveBeenCalledWith(
      `/dashboard/chat?q=${encodeURIComponent("Which tasks are not linked? & why")}`
    );
  });

  it("Shift+Enter does not submit", () => {
    useUIStore.getState().openModal("aiAssistant");
    render(<ModalProvider />);

    const input = screen.getByTestId("ask-nexus-input");
    fireEvent.change(input, { target: { value: "line one" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });

    expect(nav.push).not.toHaveBeenCalled();
  });
});

describe("chat page ?q=", () => {
  it("sends the question once and clears q from the URL", async () => {
    nav.params = new URLSearchParams({ q: "Which tasks are orphaned?" });
    const { rerender } = render(<ChatPage />);

    await waitFor(() => expect(chatCalls()).toHaveLength(1));
    const body = JSON.parse(chatCalls()[0][1].body as string);
    expect(body.messages.at(-1)).toEqual({ role: "user", content: "Which tasks are orphaned?" });
    expect(nav.replace).toHaveBeenCalledWith("/dashboard/chat", { scroll: false });

    await screen.findByText("Four tasks are orphaned.");
    rerender(<ChatPage />);
    expect(chatCalls()).toHaveLength(1);

    // Persisted for the signed-in user, so it survives a reload.
    expect(window.localStorage.getItem("nexus-chat-store:user-1")).toContain("Which tasks are orphaned?");
  });

  it("does nothing without q", async () => {
    render(<ChatPage />);
    await waitFor(() => expect(useChatStore.getState().userId).toBe("user-1"));
    expect(chatCalls()).toHaveLength(0);
    expect(nav.replace).not.toHaveBeenCalled();
  });
});
