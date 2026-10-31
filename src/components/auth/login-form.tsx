'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { LoginFormData, ValidationErrors, validateLoginForm } from '@/lib/validation';

export const LoginForm: React.FC = () => {
  const router = useRouter();

  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
  });

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Unverified OTP Step fallback
  const [requiresOtp, setRequiresOtp] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [demoOtpBanner, setDemoOtpBanner] = useState<string | null>(null);
  const [resendStatus, setResendStatus] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
    if (serverError) setServerError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validateLoginForm(formData);

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);
    setServerError(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.requiresOtp) {
          setRequiresOtp(true);
          if (data.demoOtp) setDemoOtpBanner(data.demoOtp);
          setIsSubmitting(false);
          return;
        }
        setServerError(data.error || 'Authentication failed. Please check credentials.');
        setIsSubmitting(false);
        return;
      }

      // Successful login! Redirect to dashboard
      router.push('/dashboard');
      router.refresh();
    } catch {
      setServerError('Network error connecting to login service.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) {
      setOtpError('Please enter the full 6-digit code.');
      return;
    }

    setOtpLoading(true);
    setOtpError(null);

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email, otp: otpCode.trim() }),
      });

      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.error || 'Invalid OTP code.');
        setOtpLoading(false);
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setOtpError('Network error verifying code.');
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    setResendStatus('Sending fresh code...');
    setOtpError(null);

    try {
      const res = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email }),
      });
      const data = await res.json();
      if (res.ok) {
        setResendStatus('New code sent via Brevo!');
        if (data.demoOtp) setDemoOtpBanner(data.demoOtp);
      } else {
        setResendStatus(data.error || 'Failed to resend code.');
      }
    } catch {
      setResendStatus('Error requesting code.');
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto rounded-3xl bg-[#0e0424]/95 border-2 border-[#a855f7]/40 p-8 sm:p-12 shadow-[0_25px_70px_rgba(0,0,0,0.85)] backdrop-blur-3xl">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#180738] border-2 border-[#fbbf24]/50 mb-4 text-xs font-mono font-bold text-[#fde047] shadow-[0_0_15px_rgba(251,191,36,0.3)]">
          <ShieldCheck className="w-3.5 h-3.5 text-[#fbbf24]" />
          <span>{requiresOtp ? 'SECURITY CODE REQUIRED' : 'INSTITUTIONAL LOGIN PROTOCOL'}</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
          {requiresOtp ? 'Verify Account Email' : 'CIT Nexus Portal Login'}
        </h1>
        <p className="text-sm sm:text-base text-[#cbd5e1] font-medium mt-2">
          {requiresOtp
            ? `Your email (${formData.email}) is not yet verified. Enter the 6-digit Brevo code below.`
            : 'Sign in with your verified Chilika Institute institutional credentials.'}
        </p>
      </div>

      {/* Global Server Error Alert */}
      {serverError && (
        <div className="mb-6 p-4 rounded-2xl bg-[#ef4444]/20 border-2 border-[#ef4444]/60 text-xs font-mono font-bold text-[#fca5a5] flex items-center gap-2.5">
          <ShieldAlert className="w-5 h-5 text-[#ef4444] shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      {/* Demo OTP Banner if in demo mode */}
      {demoOtpBanner && (
        <div className="mb-6 p-4 rounded-2xl bg-[#fbbf24]/15 border-2 border-[#fbbf24]/50 text-xs text-[#fde047] flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-[#fbbf24] shrink-0 mt-0.5" />
          <div>
            <strong className="block text-sm font-bold text-white mb-0.5">
              Brevo Mail Integration Demo Mode
            </strong>
            <span>
              Your verification code is:{' '}
              <span className="font-mono font-black text-lg px-2 py-0.5 rounded bg-black/40 text-[#fbbf24] border border-[#fbbf24]/40 tracking-widest">
                {demoOtpBanner}
              </span>
            </span>
          </div>
        </div>
      )}

      {requiresOtp ? (
        /* OTP Step for Unverified User on Login */
        <form onSubmit={handleVerifyOtp} className="space-y-6">
          <div>
            <label
              htmlFor="otpCodeLogin"
              className="block text-sm font-bold text-white mb-2 font-mono"
            >
              6-Digit One-Time Code (OTP) <span className="text-[#f43f5e]">*</span>
            </label>
            <div className="relative">
              <KeyRound className="w-5 h-5 text-[#c084fc] absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                id="otpCodeLogin"
                name="otpCodeLogin"
                type="text"
                maxLength={6}
                autoFocus
                placeholder="000000"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-[#150733] border-2 border-[#a855f7]/40 rounded-2xl pl-12 pr-4 py-3.5 text-center font-mono text-2xl font-black tracking-[0.5em] text-[#fbbf24] focus:outline-none focus:border-[#fbbf24]"
              />
            </div>
            {otpError && (
              <p className="mt-2 text-xs text-[#f43f5e] flex items-center gap-1 font-mono font-bold">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{otpError}</span>
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={otpLoading}
            className="w-full py-4 rounded-2xl font-black text-sm text-[#04010a] bg-gradient-to-r from-[#c084fc] via-[#f43f5e] to-[#fbbf24] hover:opacity-95 transition-all flex items-center justify-center gap-2.5 shadow-[0_0_30px_rgba(217,70,239,0.6)] hover:scale-105"
          >
            {otpLoading ? (
              <span className="font-mono">Verifying Security Code...</span>
            ) : (
              <>
                <span>Verify & Complete Sign In</span>
                <ArrowRight className="w-4 h-4 stroke-[3]" />
              </>
            )}
          </button>

          <div className="flex items-center justify-between text-xs font-mono font-bold pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={handleResendOtp}
              className="text-[#c084fc] hover:text-[#fbbf24] flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Resend Code</span>
            </button>
            {resendStatus && <span className="text-[#34d399]">{resendStatus}</span>}
          </div>
        </form>
      ) : (
        /* Normal Login Form */
        <>
          {/* Google OAuth Option */}
          <div className="mb-6">
            <a
              href="/api/auth/google"
              className="w-full py-3.5 rounded-2xl bg-[#14062e] hover:bg-[#1f0a45] border-2 border-[#a855f7]/40 hover:border-[#fbbf24] text-white font-bold text-sm flex items-center justify-center gap-3 transition-all shadow-md group hover:scale-[1.02]"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>Continue with Google</span>
            </a>

            <div className="relative flex items-center justify-center my-6">
              <div className="border-t border-white/10 w-full" />
              <span className="bg-[#0e0424] px-4 text-xs font-mono font-bold text-[#cbd5e1] uppercase">
                or sign in with credentials
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            {/* Email */}
            <div>
              <label
                htmlFor="login-email"
                className="block text-sm font-bold text-white mb-2 font-mono"
              >
                Institutional Email <span className="text-[#f43f5e]">*</span>
              </label>
              <div className="relative">
                <Mail className="w-5 h-5 text-[#c084fc] absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="faculty@cit.edu.in"
                  value={formData.email}
                  onChange={handleChange}
                  className={`w-full bg-[#150733] border rounded-2xl pl-12 pr-4 py-3.5 text-sm font-medium text-white placeholder-[#cbd5e1]/50 transition-all focus:outline-none ${
                    errors.email
                      ? 'border-[#f43f5e] focus:ring-2 focus:ring-[#f43f5e]'
                      : 'border-[#a855f7]/30 focus:border-[#fbbf24] focus:ring-2 focus:ring-[#fbbf24]/30'
                  }`}
                />
              </div>
              {errors.email && (
                <p className="mt-1.5 text-xs text-[#f43f5e] flex items-center gap-1 font-mono font-bold">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors.email}</span>
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="login-password"
                className="block text-sm font-bold text-white mb-2 font-mono"
              >
                Password <span className="text-[#f43f5e]">*</span>
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 text-[#c084fc] absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  id="login-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={handleChange}
                  className={`w-full bg-[#150733] border rounded-2xl pl-12 pr-12 py-3.5 text-sm font-medium text-white placeholder-[#cbd5e1]/50 transition-all focus:outline-none ${
                    errors.password
                      ? 'border-[#f43f5e] focus:ring-2 focus:ring-[#f43f5e]'
                      : 'border-[#a855f7]/30 focus:border-[#fbbf24] focus:ring-2 focus:ring-[#fbbf24]/30'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#cbd5e1] hover:text-white"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-xs text-[#f43f5e] flex items-center gap-1 font-mono font-bold">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors.password}</span>
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 rounded-2xl font-black text-sm text-[#04010a] bg-gradient-to-r from-[#c084fc] via-[#f43f5e] to-[#fbbf24] hover:opacity-95 disabled:opacity-60 transition-all flex items-center justify-center gap-2.5 shadow-[0_0_30px_rgba(217,70,239,0.6)] hover:scale-105"
            >
              {isSubmitting ? (
                <span className="font-mono">Authenticating with CIT Server...</span>
              ) : (
                <>
                  <span>Sign In to CIT Nexus</span>
                  <ArrowRight className="w-4 h-4 stroke-[3]" />
                </>
              )}
            </button>
          </form>
        </>
      )}

      {/* Switch to Signup */}
      <div className="mt-10 pt-8 border-t border-white/10 text-center text-sm font-medium text-[#cbd5e1]">
        Need a new institutional account?{' '}
        <Link href="/signup" className="text-[#fbbf24] hover:underline font-bold font-mono">
          Register with OTP &rarr;
        </Link>
      </div>
    </div>
  );
};
