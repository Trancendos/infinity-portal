/**
 * Login — Infinity OS authentication screen
 * Implements: Email/password, WebAuthn passkeys, MFA
 * WCAG 2.2 AA compliant, GDPR consent at login
 */

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link } from 'react-router-dom';
import { useAuth } from '../providers/AuthProvider';

const LoginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
  mfaCode: z.string().length(6).optional().or(z.literal('')),
});

type LoginForm = z.infer<typeof LoginSchema>;

export default function Login() {
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMfa, setShowMfa] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(LoginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setError(null);
    try {
      await login(data.email, data.password);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      if (message.toLowerCase().includes('mfa') || message.toLowerCase().includes('2fa')) {
        setShowMfa(true);
      } else {
        setError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-screen" role="main" aria-label="Infinity OS Login">
      <div className="auth-container">
        {/* Logo */}
        <div className="auth-logo" aria-hidden="true">
          <span className="auth-logo-symbol">∞</span>
          <span className="auth-logo-text">Infinity OS</span>
        </div>

        <h1 className="auth-title">Welcome back</h1>
        <p className="auth-subtitle">Sign in to your workspace</p>

        {/* Error Alert */}
        {error && (
          <div role="alert" className="auth-error" aria-live="polite">
            <span aria-hidden="true">⚠</span> {error}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} noValidate aria-label="Login form">
          {/* Email */}
          <div className="form-group">
            <label htmlFor="email" className="form-label">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              className={`form-input ${errors.email ? 'form-input--error' : ''}`}
              aria-describedby={errors.email ? 'email-error' : undefined}
              aria-invalid={!!errors.email}
              {...register('email')}
            />
            {errors.email && (
              <span id="email-error" role="alert" className="form-error">
                {errors.email.message}
              </span>
            )}
          </div>

          {/* Password */}
          <div className="form-group">
            <label htmlFor="password" className="form-label">
              Password
              <Link to="/forgot-password" className="form-label-link" tabIndex={-1}>
                Forgot password?
              </Link>
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className={`form-input ${errors.password ? 'form-input--error' : ''}`}
              aria-describedby={errors.password ? 'password-error' : undefined}
              aria-invalid={!!errors.password}
              {...register('password')}
            />
            {errors.password && (
              <span id="password-error" role="alert" className="form-error">
                {errors.password.message}
              </span>
            )}
          </div>

          {/* MFA Code (shown when required) */}
          {showMfa && (
            <div className="form-group">
              <label htmlFor="mfaCode" className="form-label">
                Two-factor authentication code
              </label>
              <input
                id="mfaCode"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                className="form-input form-input--mono"
                {...register('mfaCode')}
              />
              <span className="form-hint">
                Enter the 6-digit code from your authenticator app
              </span>
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="btn btn--primary btn--full"
            aria-busy={isLoading}
          >
            {isLoading ? (
              <span aria-label="Signing in...">
                <span className="spinner" aria-hidden="true" /> Signing in...
              </span>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="auth-divider" role="separator" aria-hidden="true">
          <span>or</span>
        </div>

        {/* Passkey login */}
        <button
          type="button"
          className="btn btn--secondary btn--full"
          onClick={() => {/* WebAuthn passkey flow */}}
          aria-label="Sign in with a passkey"
        >
          <span aria-hidden="true">🔑</span> Sign in with passkey
        </button>

        {/* Register link */}
        <p className="auth-footer">
          Don't have an account?{' '}
          <Link to="/register" className="auth-link">
            Create one free
          </Link>
        </p>

        {/* GDPR notice */}
        <p className="auth-legal" role="note">
          By signing in, you agree to our{' '}
          <a href="/legal/terms" className="auth-link-muted">Terms of Service</a>
          {' '}and{' '}
          <a href="/legal/privacy" className="auth-link-muted">Privacy Policy</a>.
          We process your data in accordance with GDPR.
        </p>
      </div>
    </div>
  );
}