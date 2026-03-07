/**
 * Register — Infinity OS Account Creation
 * ============================================================
 * Premium Figma-grade design matching Login screen:
 * - Animated mesh gradient background with floating orbs
 * - Glassmorphism card with slide-up entrance
 * - Password strength meter with real-time feedback
 * - Inline validation with shake animation on error
 * - WCAG 2.2 AA compliant, GDPR consent
 * ============================================================
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';

interface RegisterFormData {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface FieldErrors {
  displayName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

function getPasswordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) return { score, label: 'Weak', color: '#ef4444' };
  if (score <= 2) return { score, label: 'Fair', color: '#f59e0b' };
  if (score <= 3) return { score, label: 'Good', color: '#22c55e' };
  return { score, label: 'Strong', color: '#10b981' };
}

function validateForm(data: RegisterFormData): FieldErrors {
  const errors: FieldErrors = {};
  if (!data.email) {
    errors.email = 'Email address is required';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
    errors.email = 'Please enter a valid email address';
  }
  if (!data.password) {
    errors.password = 'Password is required';
  } else if (data.password.length < 12) {
    errors.password = 'Password must be at least 12 characters';
  }
  if (data.password && data.confirmPassword && data.password !== data.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match';
  }
  if (!data.confirmPassword) {
    errors.confirmPassword = 'Please confirm your password';
  }
  return errors;
}

export default function Register() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [form, setForm] = useState<RegisterFormData>({
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [shakeError, setShakeError] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const passwordStrength = useMemo(() => getPasswordStrength(form.password), [form.password]);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    nameRef.current?.focus();
    return () => clearTimeout(timer);
  }, []);

  const handleChange = (field: keyof RegisterFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }));
    if (globalError) setGlobalError(null);
  };

  const triggerShake = () => {
    setShakeError(true);
    setTimeout(() => setShakeError(false), 600);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const fieldErrors = validateForm(form);
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      triggerShake();
      return;
    }

    setIsLoading(true);
    setGlobalError(null);
    try {
      const API_URL = import.meta.env.VITE_BACKEND_API_URL || '';
      const res = await fetch(`${API_URL}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: form.email,
          password: form.password,
          display_name: form.displayName || form.email.split('@')[0],
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || 'Registration failed');
      }

      // Auto-login after registration
      await login(form.email, form.password);
      navigate('/desktop');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      setGlobalError(message);
      triggerShake();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-screen" role="main" aria-label="Infinity OS Registration">
      {/* Animated background orbs */}
      <div className="auth-orb auth-orb--1" aria-hidden="true" />
      <div className="auth-orb auth-orb--2" aria-hidden="true" />
      <div className="auth-orb auth-orb--3" aria-hidden="true" />

      {/* Auth card */}
      <div
        className={`auth-container ${mounted ? 'auth-container--visible' : ''} ${shakeError ? 'auth-container--shake' : ''}`}
      >
        {/* Logo & branding */}
        <div className="auth-header">
          <div className="auth-logo" aria-hidden="true">
            <div className="auth-logo__icon">
              <span className="auth-logo__symbol">∞</span>
              <div className="auth-logo__ring" />
            </div>
          </div>
          <h1 className="auth-title">Create your account</h1>
          <p className="auth-subtitle">Join the Infinity OS ecosystem</p>
        </div>

        {/* Global error */}
        {globalError && (
          <div className="auth-alert auth-alert--error" role="alert" aria-live="polite">
            <svg className="auth-alert__icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
            </svg>
            <span>{globalError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate aria-label="Registration form" className="auth-form">
          {/* Display Name */}
          <div className="auth-field">
            <label htmlFor="reg-name" className="auth-field__label">Display name</label>
            <div className="auth-field__input-wrapper">
              <svg className="auth-field__icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
                <path d="M10 8a3 3 0 100-6 3 3 0 000 6zM3.465 14.493a1.23 1.23 0 00.41 1.412A9.957 9.957 0 0010 18c2.31 0 4.438-.784 6.131-2.1.43-.333.604-.903.408-1.41a7.002 7.002 0 00-13.074.003z" />
              </svg>
              <input
                ref={nameRef}
                id="reg-name"
                type="text"
                autoComplete="name"
                placeholder="Your name (optional)"
                value={form.displayName}
                onChange={handleChange('displayName')}
                className="auth-field__input"
              />
            </div>
          </div>

          {/* Email */}
          <div className={`auth-field ${errors.email ? 'auth-field--error' : ''}`}>
            <label htmlFor="reg-email" className="auth-field__label">Email address</label>
            <div className="auth-field__input-wrapper">
              <svg className="auth-field__icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
                <path d="M3 4a2 2 0 00-2 2v1.161l8.441 4.221a1.25 1.25 0 001.118 0L19 7.162V6a2 2 0 00-2-2H3z" />
                <path d="M19 8.839l-7.77 3.885a2.75 2.75 0 01-2.46 0L1 8.839V14a2 2 0 002 2h14a2 2 0 002-2V8.839z" />
              </svg>
              <input
                id="reg-email"
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                value={form.email}
                onChange={handleChange('email')}
                className="auth-field__input"
                aria-describedby={errors.email ? 'reg-email-error' : undefined}
                aria-invalid={!!errors.email}
              />
            </div>
            {errors.email && (
              <span id="reg-email-error" role="alert" className="auth-field__error">{errors.email}</span>
            )}
          </div>

          {/* Password */}
          <div className={`auth-field ${errors.password ? 'auth-field--error' : ''}`}>
            <label htmlFor="reg-password" className="auth-field__label">Password</label>
            <div className="auth-field__input-wrapper">
              <svg className="auth-field__icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
              </svg>
              <input
                id="reg-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Min 12 characters"
                value={form.password}
                onChange={handleChange('password')}
                className="auth-field__input"
                aria-describedby={errors.password ? 'reg-pw-error' : 'pw-strength'}
                aria-invalid={!!errors.password}
              />
              <button
                type="button"
                className="auth-field__toggle"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? (
                  <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                    <path fillRule="evenodd" d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.029 10.029 0 003.3-4.38 1.651 1.651 0 000-1.185A10.004 10.004 0 009.999 3a9.956 9.956 0 00-4.744 1.194L3.28 2.22zM7.752 6.69l1.092 1.092a2.5 2.5 0 013.374 3.373l1.092 1.092a4 4 0 00-5.558-5.558z" clipRule="evenodd" />
                    <path d="M10.748 13.93l2.523 2.523A9.987 9.987 0 0110 17a10.004 10.004 0 01-9.335-6.41 1.651 1.651 0 010-1.185A10.027 10.027 0 014.517 5.58l2.106 2.106A4 4 0 0010.748 13.93z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                    <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                    <path fillRule="evenodd" d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            </div>
            {/* Password strength meter */}
            {form.password.length > 0 && (
              <div id="pw-strength" className="auth-field__strength" aria-label={`Password strength: ${passwordStrength.label}`}>
                <div className="auth-field__strength-bar">
                  <div
                    className="auth-field__strength-fill"
                    style={{ width: `${(passwordStrength.score / 5) * 100}%`, background: passwordStrength.color }}
                  />
                </div>
                <span className="auth-field__strength-label" style={{ color: passwordStrength.color }}>
                  {passwordStrength.label}
                </span>
              </div>
            )}
            {errors.password && (
              <span id="reg-pw-error" role="alert" className="auth-field__error">{errors.password}</span>
            )}
          </div>

          {/* Confirm Password */}
          <div className={`auth-field ${errors.confirmPassword ? 'auth-field--error' : ''}`}>
            <label htmlFor="reg-confirm" className="auth-field__label">Confirm password</label>
            <div className="auth-field__input-wrapper">
              <svg className="auth-field__icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
                <path fillRule="evenodd" d="M16.403 12.652a3 3 0 000-5.304 3 3 0 00-3.75-3.751 3 3 0 00-5.305 0 3 3 0 00-3.751 3.75 3 3 0 000 5.305 3 3 0 003.75 3.751 3 3 0 005.305 0 3 3 0 003.751-3.75zm-2.546-4.46a.75.75 0 00-1.214-.883l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
              <input
                id="reg-confirm"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Confirm your password"
                value={form.confirmPassword}
                onChange={handleChange('confirmPassword')}
                className="auth-field__input"
                aria-describedby={errors.confirmPassword ? 'reg-confirm-error' : undefined}
                aria-invalid={!!errors.confirmPassword}
              />
              {/* Match indicator */}
              {form.confirmPassword.length > 0 && form.password === form.confirmPassword && (
                <span className="auth-field__match" aria-hidden="true">
                  <svg viewBox="0 0 20 20" fill="#22c55e" width="18" height="18">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                  </svg>
                </span>
              )}
            </div>
            {errors.confirmPassword && (
              <span id="reg-confirm-error" role="alert" className="auth-field__error">{errors.confirmPassword}</span>
            )}
          </div>

          {/* Terms agreement */}
          <label className="auth-checkbox" htmlFor="reg-terms">
            <input
              id="reg-terms"
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="auth-checkbox__input"
            />
            <span className="auth-checkbox__label">
              I agree to the{' '}
              <a href="/legal/terms" className="auth-footer__link">Terms of Service</a>
              {' '}and{' '}
              <a href="/legal/privacy" className="auth-footer__link">Privacy Policy</a>
            </span>
          </label>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading || !agreedToTerms}
            className="auth-btn auth-btn--primary"
            aria-busy={isLoading}
          >
            {isLoading ? (
              <span className="auth-btn__loading">
                <span className="auth-btn__spinner" aria-hidden="true" />
                <span>Creating account…</span>
              </span>
            ) : (
              <span className="auth-btn__content">
                <span>Create account</span>
                <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16" aria-hidden="true">
                  <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                </svg>
              </span>
            )}
          </button>
        </form>

        {/* Footer */}
        <div className="auth-footer">
          <p className="auth-footer__register">
            Already have an account?{' '}
            <Link to="/login" className="auth-footer__link">Sign in</Link>
          </p>
        </div>
      </div>

      {/* Version badge */}
      <div className="auth-version" aria-hidden="true">
        Infinity OS v2.0 — Trancendos
      </div>
    </div>
  );
}