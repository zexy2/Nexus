/**
 * Confirms the locale provider actually flips language + persists, so we can
 * tell whether a "reverts to Turkish" bug is in the provider or the consumer.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LocaleProvider, useLocale, useT } from "@/lib/i18n/provider";

function Consumer() {
  const t = useT();
  const { locale, setLocale } = useLocale();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="home">{t("nav.home")}</span>
      <button onClick={() => setLocale("en")}>to-en</button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("LocaleProvider", () => {
  it("defaults to Turkish and translates", () => {
    render(
      <LocaleProvider>
        <Consumer />
      </LocaleProvider>
    );
    expect(screen.getByTestId("locale").textContent).toBe("tr");
    expect(screen.getByTestId("home").textContent).toBe("Ana Sayfa");
  });

  it("switches to English and persists to localStorage", () => {
    render(
      <LocaleProvider>
        <Consumer />
      </LocaleProvider>
    );
    fireEvent.click(screen.getByText("to-en"));
    expect(screen.getByTestId("locale").textContent).toBe("en");
    expect(screen.getByTestId("home").textContent).toBe("Home");
    expect(window.localStorage.getItem("nexus-locale")).toBe("en");
  });
});
