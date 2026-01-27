/**
 * Authentication E2E Tests
 * Tests login, register, and logout flows
 */
import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.describe('Login Page', () => {
    test('should display login form', async ({ page }) => {
      await page.goto('/login');
      
      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('should show validation errors for empty fields', async ({ page }) => {
      await page.goto('/login');
      
      await page.click('button[type="submit"]');
      
      // Should show validation errors
      await expect(page.locator('text=Email is required')).toBeVisible();
    });

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto('/login');
      
      await page.fill('input[name="email"]', 'invalid@test.com');
      await page.fill('input[name="password"]', 'wrongpassword');
      await page.click('button[type="submit"]');
      
      await expect(page.locator('text=Invalid credentials')).toBeVisible();
    });

    test('should redirect to dashboard after successful login', async ({ page }) => {
      await page.goto('/login');
      
      await page.fill('input[name="email"]', 'test@example.com');
      await page.fill('input[name="password"]', 'validpassword123');
      await page.click('button[type="submit"]');
      
      await page.waitForURL('/dashboard');
      await expect(page).toHaveURL('/dashboard');
    });

    test('should have link to register page', async ({ page }) => {
      await page.goto('/login');
      
      const registerLink = page.locator('a[href="/register"]');
      await expect(registerLink).toBeVisible();
      
      await registerLink.click();
      await expect(page).toHaveURL('/register');
    });
  });

  test.describe('Register Page', () => {
    test('should display registration form', async ({ page }) => {
      await page.goto('/register');
      
      await expect(page.locator('input[name="name"]')).toBeVisible();
      await expect(page.locator('input[name="email"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('should show validation for weak password', async ({ page }) => {
      await page.goto('/register');
      
      await page.fill('input[name="name"]', 'Test User');
      await page.fill('input[name="email"]', 'newuser@test.com');
      await page.fill('input[name="password"]', '123'); // Too weak
      await page.click('button[type="submit"]');
      
      await expect(page.locator('text=Password must be at least')).toBeVisible();
    });
  });

  test.describe('Protected Routes', () => {
    test('should redirect to login when accessing dashboard without auth', async ({ page }) => {
      await page.goto('/dashboard');
      
      // Should redirect to login
      await expect(page).toHaveURL(/\/login/);
    });

    test('should redirect to login when accessing docs without auth', async ({ page }) => {
      await page.goto('/dashboard/docs');
      
      await expect(page).toHaveURL(/\/login/);
    });
  });
});
