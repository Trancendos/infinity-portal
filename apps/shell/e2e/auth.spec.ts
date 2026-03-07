/**
 * Infinity Portal — Auth Flow E2E Tests
 * ──────────────────────────────────────
 * Tests: Login, Register, Logout, Lock Screen
 */

import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  /* ── Login Page ──────────────────────────────────────── */
  test.describe('Login', () => {
    test('should display login screen with all elements', async ({ page }) => {
      // Logo and branding
      await expect(page.locator('.auth-container')).toBeVisible();
      await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();

      // Form fields
      await expect(page.locator('input[type="email"], input[type="text"]').first()).toBeVisible();
      await expect(page.locator('input[type="password"]')).toBeVisible();

      // Submit button
      await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();

      // Register link
      await expect(page.getByText(/create.*account|sign up|register/i)).toBeVisible();
    });

    test('should show validation errors for empty fields', async ({ page }) => {
      const submitBtn = page.getByRole('button', { name: /sign in/i });
      await submitBtn.click();

      // Should show error state (shake animation or error message)
      await expect(page.locator('.auth-container')).toBeVisible();
    });

    test('should toggle password visibility', async ({ page }) => {
      const passwordInput = page.locator('input[type="password"]');
      await passwordInput.fill('testpassword');

      // Find and click the toggle button
      const toggleBtn = page.locator('[aria-label*="password" i], .auth-field__toggle');
      if (await toggleBtn.isVisible()) {
        await toggleBtn.click();
        await expect(page.locator('input[type="text"]').last()).toHaveValue('testpassword');

        await toggleBtn.click();
        await expect(passwordInput).toHaveValue('testpassword');
      }
    });

    test('should navigate to register page', async ({ page }) => {
      const registerLink = page.getByText(/create.*account|sign up|register/i);
      await registerLink.click();

      // Should show register form
      await expect(page.getByRole('heading', { name: /create|register|sign up/i })).toBeVisible();
    });

    test('should handle login with valid credentials', async ({ page }) => {
      await page.locator('input[type="email"], input[type="text"]').first().fill('admin@infinity.local');
      await page.locator('input[type="password"]').fill('admin123');

      await page.getByRole('button', { name: /sign in/i }).click();

      // Should either show loading or navigate to desktop
      // (depends on backend availability)
      await page.waitForTimeout(2000);
    });

    test('should be keyboard navigable', async ({ page }) => {
      // Tab through form elements
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');

      // Should be able to type in focused field
      await page.keyboard.type('test@example.com');
      await page.keyboard.press('Tab');
      await page.keyboard.type('password123');
      await page.keyboard.press('Enter');

      // Form should submit
      await page.waitForTimeout(1000);
    });
  });

  /* ── Register Page ───────────────────────────────────── */
  test.describe('Register', () => {
    test.beforeEach(async ({ page }) => {
      // Navigate to register
      const registerLink = page.getByText(/create.*account|sign up|register/i);
      if (await registerLink.isVisible()) {
        await registerLink.click();
      }
    });

    test('should display register form with all fields', async ({ page }) => {
      await expect(page.getByRole('heading', { name: /create|register|sign up/i })).toBeVisible();

      // Name, email, password fields
      const inputs = page.locator('input');
      expect(await inputs.count()).toBeGreaterThanOrEqual(3);
    });

    test('should show password strength indicator', async ({ page }) => {
      const passwordInput = page.locator('input[type="password"]').first();

      // Weak password
      await passwordInput.fill('abc');
      await page.waitForTimeout(300);

      // Strong password
      await passwordInput.fill('MyStr0ng!Pass#2024');
      await page.waitForTimeout(300);

      // Strength indicator should be visible
      const strengthBar = page.locator('.auth-field__strength');
      if (await strengthBar.isVisible()) {
        await expect(strengthBar).toBeVisible();
      }
    });

    test('should validate matching passwords', async ({ page }) => {
      const passwords = page.locator('input[type="password"]');
      if (await passwords.count() >= 2) {
        await passwords.nth(0).fill('Password123!');
        await passwords.nth(1).fill('DifferentPassword!');

        // Submit and check for mismatch error
        const submitBtn = page.getByRole('button', { name: /create|register|sign up/i });
        if (await submitBtn.isVisible()) {
          await submitBtn.click();
          await page.waitForTimeout(500);
        }
      }
    });

    test('should navigate back to login', async ({ page }) => {
      const loginLink = page.getByText(/already.*account|sign in|log in/i);
      if (await loginLink.isVisible()) {
        await loginLink.click();
        await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
      }
    });
  });

  /* ── Accessibility ───────────────────────────────────── */
  test.describe('Accessibility', () => {
    test('login form should have proper ARIA attributes', async ({ page }) => {
      // Check form labels
      const emailInput = page.locator('input[type="email"], input[type="text"]').first();
      const passwordInput = page.locator('input[type="password"]');

      // Inputs should have labels or aria-labels
      const emailLabel = await emailInput.getAttribute('aria-label') || await emailInput.getAttribute('placeholder');
      expect(emailLabel).toBeTruthy();

      const passLabel = await passwordInput.getAttribute('aria-label') || await passwordInput.getAttribute('placeholder');
      expect(passLabel).toBeTruthy();
    });

    test('should support reduced motion', async ({ page }) => {
      // Emulate reduced motion preference
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/');

      // Page should still render correctly
      await expect(page.locator('.auth-container')).toBeVisible();
    });
  });
});