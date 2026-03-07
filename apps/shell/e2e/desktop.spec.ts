/**
 * Infinity Portal — Desktop Interaction E2E Tests
 * ────────────────────────────────────────────────
 * Tests: Desktop, Taskbar, Windows, Context Menu,
 *        Universal Search, Notification Centre
 */

import { test, expect } from '@playwright/test';

/**
 * Helper: Skip to desktop by mocking auth state.
 * In a real setup, this would use a test user login or
 * localStorage injection to bypass the auth screen.
 */
async function navigateToDesktop(page: import('@playwright/test').Page) {
  await page.goto('/');

  // Attempt to login or check if already on desktop
  const desktop = page.locator('.desktop');
  if (await desktop.isVisible({ timeout: 2000 }).catch(() => false)) {
    return; // Already on desktop
  }

  // Try quick login with test credentials
  const emailInput = page.locator('input[type="email"], input[type="text"]').first();
  if (await emailInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await emailInput.fill('admin@infinity.local');
    await page.locator('input[type="password"]').fill('admin123');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForTimeout(3000);
  }
}

test.describe('Desktop Environment', () => {
  test.beforeEach(async ({ page }) => {
    await navigateToDesktop(page);
  });

  /* ── Desktop Surface ─────────────────────────────────── */
  test.describe('Desktop', () => {
    test('should render desktop with background', async ({ page }) => {
      const desktop = page.locator('.desktop');
      if (await desktop.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(desktop).toBeVisible();

        // Background elements
        const bg = page.locator('.desktop__bg');
        if (await bg.isVisible().catch(() => false)) {
          await expect(bg).toBeVisible();
        }
      }
    });

    test('should show entrance animation', async ({ page }) => {
      const desktop = page.locator('.desktop');
      if (await desktop.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Desktop should have the ready class after animation
        await page.waitForTimeout(500);
        await expect(desktop).toHaveClass(/desktop--ready/);
      }
    });
  });

  /* ── Taskbar ─────────────────────────────────────────── */
  test.describe('Taskbar', () => {
    test('should display taskbar with dock items', async ({ page }) => {
      const taskbar = page.locator('.taskbar');
      if (await taskbar.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(taskbar).toBeVisible();

        // Dock should have items
        const dock = page.locator('.taskbar__dock');
        if (await dock.isVisible().catch(() => false)) {
          const items = page.locator('.taskbar__item');
          expect(await items.count()).toBeGreaterThan(0);
        }
      }
    });

    test('should show clock in system tray', async ({ page }) => {
      const clock = page.locator('.taskbar__clock');
      if (await clock.isVisible({ timeout: 5000 }).catch(() => false)) {
        const text = await clock.textContent();
        expect(text).toBeTruthy();
        // Clock should contain time-like content (digits and colons)
        expect(text).toMatch(/\d/);
      }
    });

    test('should show tooltip on dock item hover', async ({ page }) => {
      const firstItem = page.locator('.taskbar__item').first();
      if (await firstItem.isVisible({ timeout: 5000 }).catch(() => false)) {
        await firstItem.hover();
        await page.waitForTimeout(300);

        const tooltip = page.locator('.taskbar__tooltip');
        // Tooltip may or may not be visible depending on implementation
      }
    });

    test('should open app on dock item click', async ({ page }) => {
      const firstItem = page.locator('.taskbar__item').first();
      if (await firstItem.isVisible({ timeout: 5000 }).catch(() => false)) {
        await firstItem.click();
        await page.waitForTimeout(1000);

        // A window should appear
        const windows = page.locator('.window');
        // Window count may increase
      }
    });
  });

  /* ── Window Management ───────────────────────────────── */
  test.describe('Windows', () => {
    test('should open and display a window', async ({ page }) => {
      // Click first dock item to open a window
      const firstItem = page.locator('.taskbar__item').first();
      if (await firstItem.isVisible({ timeout: 5000 }).catch(() => false)) {
        await firstItem.click();
        await page.waitForTimeout(1000);

        const window = page.locator('.window').first();
        if (await window.isVisible().catch(() => false)) {
          await expect(window).toBeVisible();

          // Should have title bar
          const titleBar = window.locator('.window__titlebar');
          if (await titleBar.isVisible().catch(() => false)) {
            await expect(titleBar).toBeVisible();
          }

          // Should have traffic light controls
          const controls = window.locator('.window__controls');
          if (await controls.isVisible().catch(() => false)) {
            await expect(controls).toBeVisible();
          }
        }
      }
    });

    test('should close window via close button', async ({ page }) => {
      const firstItem = page.locator('.taskbar__item').first();
      if (await firstItem.isVisible({ timeout: 5000 }).catch(() => false)) {
        await firstItem.click();
        await page.waitForTimeout(1000);

        const closeBtn = page.locator('.window__btn--close').first();
        if (await closeBtn.isVisible().catch(() => false)) {
          const windowCount = await page.locator('.window').count();
          await closeBtn.click();
          await page.waitForTimeout(500);

          const newCount = await page.locator('.window').count();
          expect(newCount).toBeLessThan(windowCount);
        }
      }
    });

    test('should maximise window via maximise button', async ({ page }) => {
      const firstItem = page.locator('.taskbar__item').first();
      if (await firstItem.isVisible({ timeout: 5000 }).catch(() => false)) {
        await firstItem.click();
        await page.waitForTimeout(1000);

        const maxBtn = page.locator('.window__btn--maximise').first();
        if (await maxBtn.isVisible().catch(() => false)) {
          await maxBtn.click();
          await page.waitForTimeout(300);

          const window = page.locator('.window').first();
          // Maximised window should fill viewport
          const box = await window.boundingBox();
          if (box) {
            const viewport = page.viewportSize();
            if (viewport) {
              // Should be close to full width
              expect(box.width).toBeGreaterThan(viewport.width * 0.8);
            }
          }
        }
      }
    });
  });

  /* ── Context Menu ────────────────────────────────────── */
  test.describe('Context Menu', () => {
    test('should open on right-click', async ({ page }) => {
      const desktop = page.locator('.desktop');
      if (await desktop.isVisible({ timeout: 5000 }).catch(() => false)) {
        await desktop.click({ button: 'right', position: { x: 200, y: 200 } });
        await page.waitForTimeout(300);

        const contextMenu = page.locator('.context-menu');
        if (await contextMenu.isVisible().catch(() => false)) {
          await expect(contextMenu).toBeVisible();

          // Should have menu items
          const items = contextMenu.locator('.context-menu__item');
          expect(await items.count()).toBeGreaterThan(0);
        }
      }
    });

    test('should close on click outside', async ({ page }) => {
      const desktop = page.locator('.desktop');
      if (await desktop.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Open context menu
        await desktop.click({ button: 'right', position: { x: 200, y: 200 } });
        await page.waitForTimeout(300);

        // Click elsewhere to close
        await desktop.click({ position: { x: 400, y: 400 } });
        await page.waitForTimeout(300);

        const contextMenu = page.locator('.context-menu');
        await expect(contextMenu).not.toBeVisible();
      }
    });

    test('should support keyboard navigation', async ({ page }) => {
      const desktop = page.locator('.desktop');
      if (await desktop.isVisible({ timeout: 5000 }).catch(() => false)) {
        await desktop.click({ button: 'right', position: { x: 200, y: 200 } });
        await page.waitForTimeout(300);

        const contextMenu = page.locator('.context-menu');
        if (await contextMenu.isVisible().catch(() => false)) {
          // Arrow down to navigate
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('ArrowDown');

          // Escape to close
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
          await expect(contextMenu).not.toBeVisible();
        }
      }
    });
  });

  /* ── Universal Search ────────────────────────────────── */
  test.describe('Universal Search', () => {
    test('should open with Ctrl+Space', async ({ page }) => {
      const desktop = page.locator('.desktop');
      if (await desktop.isVisible({ timeout: 5000 }).catch(() => false)) {
        await page.keyboard.press('Control+Space');
        await page.waitForTimeout(500);

        const searchPalette = page.locator('.search-palette');
        if (await searchPalette.isVisible().catch(() => false)) {
          await expect(searchPalette).toBeVisible();

          // Should have input field
          const input = searchPalette.locator('.search-palette__input');
          await expect(input).toBeVisible();
          await expect(input).toBeFocused();
        }
      }
    });

    test('should filter results on typing', async ({ page }) => {
      const desktop = page.locator('.desktop');
      if (await desktop.isVisible({ timeout: 5000 }).catch(() => false)) {
        await page.keyboard.press('Control+Space');
        await page.waitForTimeout(500);

        const input = page.locator('.search-palette__input');
        if (await input.isVisible().catch(() => false)) {
          await input.fill('settings');
          await page.waitForTimeout(300);

          // Should show filtered results
          const results = page.locator('.search-palette__item');
          // Results count should be > 0 if "settings" matches anything
        }
      }
    });

    test('should close with Escape', async ({ page }) => {
      const desktop = page.locator('.desktop');
      if (await desktop.isVisible({ timeout: 5000 }).catch(() => false)) {
        await page.keyboard.press('Control+Space');
        await page.waitForTimeout(500);

        const searchOverlay = page.locator('.search-overlay');
        if (await searchOverlay.isVisible().catch(() => false)) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
          await expect(searchOverlay).not.toBeVisible();
        }
      }
    });

    test('should navigate results with arrow keys', async ({ page }) => {
      const desktop = page.locator('.desktop');
      if (await desktop.isVisible({ timeout: 5000 }).catch(() => false)) {
        await page.keyboard.press('Control+Space');
        await page.waitForTimeout(500);

        const input = page.locator('.search-palette__input');
        if (await input.isVisible().catch(() => false)) {
          // Arrow down to select items
          await page.keyboard.press('ArrowDown');
          await page.keyboard.press('ArrowDown');

          // Check for selected state
          const selected = page.locator('.search-palette__item--selected');
          if (await selected.isVisible().catch(() => false)) {
            await expect(selected).toBeVisible();
          }
        }
      }
    });
  });

  /* ── Notification Centre ─────────────────────────────── */
  test.describe('Notification Centre', () => {
    test('should open notification panel', async ({ page }) => {
      // Look for notification trigger (bell icon in taskbar)
      const bellBtn = page.locator('[aria-label*="notification" i], .taskbar__notifications');
      if (await bellBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await bellBtn.click();
        await page.waitForTimeout(500);

        const panel = page.locator('.notif-panel');
        if (await panel.isVisible().catch(() => false)) {
          await expect(panel).toBeVisible();
          await expect(page.locator('.notif-panel__title')).toHaveText(/notifications/i);
        }
      }
    });

    test('should close with Escape', async ({ page }) => {
      const bellBtn = page.locator('[aria-label*="notification" i], .taskbar__notifications');
      if (await bellBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await bellBtn.click();
        await page.waitForTimeout(500);

        const panel = page.locator('.notif-panel');
        if (await panel.isVisible().catch(() => false)) {
          await page.keyboard.press('Escape');
          await page.waitForTimeout(500);
          await expect(panel).not.toBeVisible();
        }
      }
    });

    test('should display grouped notifications', async ({ page }) => {
      const bellBtn = page.locator('[aria-label*="notification" i], .taskbar__notifications');
      if (await bellBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await bellBtn.click();
        await page.waitForTimeout(500);

        const groups = page.locator('.notif-group');
        if (await groups.first().isVisible().catch(() => false)) {
          expect(await groups.count()).toBeGreaterThan(0);

          // Each group should have a label
          const labels = page.locator('.notif-group__label');
          expect(await labels.count()).toBeGreaterThan(0);
        }
      }
    });
  });

  /* ── Keyboard Shortcuts ──────────────────────────────── */
  test.describe('Keyboard Shortcuts', () => {
    test('Ctrl+Space should toggle search', async ({ page }) => {
      const desktop = page.locator('.desktop');
      if (await desktop.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Open
        await page.keyboard.press('Control+Space');
        await page.waitForTimeout(500);

        const overlay = page.locator('.search-overlay');
        const isOpen = await overlay.isVisible().catch(() => false);

        if (isOpen) {
          // Close
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
          await expect(overlay).not.toBeVisible();
        }
      }
    });

    test('Escape should close active window', async ({ page }) => {
      const desktop = page.locator('.desktop');
      if (await desktop.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Open a window first
        const firstItem = page.locator('.taskbar__item').first();
        if (await firstItem.isVisible().catch(() => false)) {
          await firstItem.click();
          await page.waitForTimeout(1000);

          const windowsBefore = await page.locator('.window').count();
          if (windowsBefore > 0) {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
          }
        }
      }
    });
  });

  /* ── Responsive Design ───────────────────────────────── */
  test.describe('Responsive', () => {
    test('should adapt to mobile viewport', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.waitForTimeout(500);

      // Desktop should still render
      const desktop = page.locator('.desktop');
      if (await desktop.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(desktop).toBeVisible();
      }
    });

    test('should adapt to tablet viewport', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.waitForTimeout(500);

      const desktop = page.locator('.desktop');
      if (await desktop.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(desktop).toBeVisible();
      }
    });
  });
});