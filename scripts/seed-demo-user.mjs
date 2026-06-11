#!/usr/bin/env node

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000";
const email = process.env.DEMO_EMAIL || process.env.NEXT_PUBLIC_DEMO_EMAIL;
const password = process.env.DEMO_PASSWORD;
const name = process.env.DEMO_NAME || "Nexus Demo User";

if (!email || !password) {
  console.error("DEMO_EMAIL and DEMO_PASSWORD are required.");
  process.exit(1);
}

const endpoint = new URL("/api/auth/sign-up/email", baseUrl);

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Origin: baseUrl,
    ...(process.env.DEMO_SEED_TOKEN ? { "x-demo-seed-token": process.env.DEMO_SEED_TOKEN } : {}),
  },
  body: JSON.stringify({
    email,
    password,
    name,
  }),
});

const body = await response.text();

if (response.ok) {
  console.log(`Demo user ready: ${email}`);
  process.exit(0);
}

if ((response.status === 400 || response.status === 409 || response.status === 422) && body.toLowerCase().includes("exist")) {
  console.log(`Demo user already exists: ${email}`);
  process.exit(0);
}

console.error(`Failed to seed demo user (${response.status}):`);
console.error(body);
process.exit(1);
