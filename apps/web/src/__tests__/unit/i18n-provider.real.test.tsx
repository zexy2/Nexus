/**
 * Confirms the locale provider actually flips language + persists, so we can
 * tell whether a "reverts to Turkish" bug is in the provider or the consumer.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ForceDocumentLang, LocaleProvider, useLocale, useT } from "@/lib/i18n/provider";

function Consumer() {
  const t = useT();
  const { locale, setLocale } = useLocale();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="home">{t("nav.home")}</span>
      <button onClick={() => setLocale("en")}>to-en</button>
      <button onClick={() => setLocale("tr")}>to-tr</button>
    </div>
  );
}

function clearCookie() {
  document.cookie = "nexus-locale=; path=/; max-age=0";
}

beforeEach(() => {
  window.localStorage.clear();
  clearCookie();
  document.documentElement.lang = "";
  document.documentElement.removeAttribute("data-forced-lang");
});

describe("LocaleProvider", () => {
  it("renders the server-resolved initial locale and sets <html lang>", () => {
    render(
      <LocaleProvider initialLocale="tr">
        <Consumer />
      </LocaleProvider>
    );
    expect(screen.getByTestId("locale").textContent).toBe("tr");
    expect(screen.getByTestId("home").textContent).toBe("Ana Sayfa");
    expect(document.documentElement.lang).toBe("tr");
    expect(document.documentElement.getAttribute("data-ui-locale")).toBe("tr");
  });

  it("defaults to English without an initial locale", () => {
    render(
      <LocaleProvider>
        <Consumer />
      </LocaleProvider>
    );
    expect(screen.getByTestId("locale").textContent).toBe("en");
    expect(screen.getByTestId("home").textContent).toBe("Home");
  });

  it("a saved preference wins over the initial locale after mount", () => {
    window.localStorage.setItem("nexus-locale", "en");
    render(
      <LocaleProvider initialLocale="tr">
        <Consumer />
      </LocaleProvider>
    );
    expect(screen.getByTestId("locale").textContent).toBe("en");
    // The preference is mirrored into the cookie for the next server render.
    expect(document.cookie).toContain("nexus-locale=en");
  });

  it("switches language and persists to localStorage and the cookie", () => {
    render(
      <LocaleProvider initialLocale="tr">
        <Consumer />
      </LocaleProvider>
    );
    fireEvent.click(screen.getByText("to-en"));
    expect(screen.getByTestId("locale").textContent).toBe("en");
    expect(screen.getByTestId("home").textContent).toBe("Home");
    expect(window.localStorage.getItem("nexus-locale")).toBe("en");
    expect(document.cookie).toContain("nexus-locale=en");
    expect(document.documentElement.lang).toBe("en");
  });

  it("ForceDocumentLang pins <html lang> for English-only pages", () => {
    render(
      <LocaleProvider initialLocale="tr">
        <ForceDocumentLang lang="en" />
        <Consumer />
      </LocaleProvider>
    );
    expect(screen.getByTestId("locale").textContent).toBe("tr");
    expect(document.documentElement.lang).toBe("en");
  });
});
