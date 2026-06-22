"use client";

import { useEffect, useState } from "react";

type AuthProviders = {
  github: boolean;
  google: boolean;
};

const unavailable: AuthProviders = { github: false, google: false };

export function useAuthProviders() {
  const [providers, setProviders] = useState<AuthProviders>(unavailable);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/auth/providers", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : unavailable))
      .then((value: Partial<AuthProviders>) => {
        setProviders({
          github: value.github === true,
          google: value.google === true,
        });
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, []);

  return providers;
}
