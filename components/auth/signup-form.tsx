'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Sparkles,
  RotateCcw,
  KeyRound,
  ShieldAlert,
} from 'lucide-react';
import {
  SignupFormData,
  UserRole,
  ValidationErrors,
  validateSignupForm,
} from '@/lib/validation';

export const SignupForm: React.FC = () => {
  const router = useRouter();

  const [formData, setFormData] = useState<SignupFormData>({
    fullName: '',
    email: '',
    role: 'Faculty',
    password: '',
    confirmPassword: '',
    agreedToTerms: false,
  });

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // OTP Step State
  const [isOtpStep, setIsOtpStep] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [demoOtpBanner, setDemoOtpBanner] = useState<string | null>(null);

  // Live password validity indicators
  const passwordChecks = {
    length: formData.password.length >= 8,
    hasUpper: /[A-Z]/.test(formData.password),
    hasLower: /[a-z]/.test(formData.password),
    hasNumber: /[0-9]/.test(formData.password),
    hasSpecial: /[^A-Za-z0-9]/.test(formData.password),
  };

  const roles: { value: UserRole; title: string; desc: string }[] = [
    {
      value: 'Admin',
      title: 'Admin',
      desc: 'Global institute scheduling & policy oversight',
    },
    {
      value: 'Department Coordinator',
      title: 'Dept Coordinator',
      desc: 'Curriculum mapping & department venue signoff',
    },
    {
      value: 'Faculty',
      title: 'Faculty',
      desc: 'Teaching schedules, cohorts & classroom needs',
    },
    {
      value: 'Club Representative',
      title: 'Club Representative',
      desc: 'Society events, workshops & hall booking pipeline',
    },
  ];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
    if (serverError) setServerError(null);
  };

  // Step 1: Submit Registration Form to Backend
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validateSignupForm(formData);

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);
    setServerError(null);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        setServerError(data.error || 'Registration failed. Please try again.');
        setIsSubmitting(false);
        return;
      }

      // Transition to OTP verification step
      setIsOtpStep(true);
      if (data.demoOtp) {
        setDemoOtpBanner(data.demoOtp);
      }
    } catch {
      setServerError('Network error connecting to backend service.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 2: Verify 6-digit OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode || otpCode.trim().length !== 6) {
      setOtpError('Please enter the full 6-digit verification code.');
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

      // Successful verification! Redirect to dashboard
      router.push('/dashboard');
      router.refresh();
    } catch {
      setOtpError('Network error while verifying OTP.');
    } finally {
      setOtpLoading(false);
    }
  };

  // Resend OTP via Brevo
  const handleResendOtp = async () => {
    setResendStatus('Dispatching fresh code...');
    setOtpError(null);

    try {
      const res = await fetch('/api/auth/resend-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email }),
      });
      const data = await res.json();

      if (res.ok) {
        setResendStatus('New 6-digit code sent via Brevo!');
        if (data.demoOtp) setDemoOtpBanner(data.demoOtp);
      } else {
        setResendStatus(data.error || 'Failed to resend code.');
      }
    } catch {
      setResendStatus('Error requesting code.');
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto rounded-3xl bg-[#0e0424]/95 border-2 border-[#a855f7]/40 p-8 sm:p-12 shadow-[0_25px_70px_rgba(0,0,0,0.85)] backdrop-blur-3xl">
      {/* Step Indicator Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#180738] border-2 border-[#fbbf24]/50 mb-4 text-xs font-mono font-bold text-[#fde047] shadow-[0_0_15px_rgba(251,191,36,0.3)]">
          <Sparkles className="w-3.5 h-3.5 text-[#fbbf24]" />
          <span>{isOtpStep ? 'SECURITY VERIFICATION STEP 2/2' : 'SECURE ENROLLMENT STEP 1/2'}</span>
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
          {isOtpStep ? 'Enter Brevo OTP Code' : 'Create your CIT Nexus account'}
        </h1>
        <p className="text-sm sm:text-base text-[#cbd5e1] font-medium mt-2">
          {isOtpStep
            ? `A 6-digit verification code was dispatched to ${formData.email}`
            : 'Join the centralized campus operations portal for Chilika Institute of Technology.'}
        </p>
      </div>

      {/* Global Server Error Alert */}
      {serverError && (
        <div className="mb-6 p-4 rounded-2xl bg-[#ef4444]/20 border-2 border-[#ef4444]/60 text-xs font-mono font-bold text-[#fca5a5] flex items-center gap-2.5">
          <ShieldAlert className="w-5 h-5 text-[#ef4444] shrink-0" />
          <span>{serverError}</span>
        </div>
      )}

      {/* Demo OTP Banner for Instant Testing when Brevo key is placeholder */}
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

      {/* STEP 2: OTP VERIFICATION VIEW */}
      {isOtpStep ? (
        <form onSubmit={handleVerifyOtp} className="space-y-6">
          <div>
            <label
              htmlFor="otpCode"
              className="block text-sm font-bold text-white mb-2 font-mono"
            >
              6-Digit One-Time Code (OTP) <span className="text-[#f43f5e]">*</span>
            </label>
            <div className="relative">
              <KeyRound className="w-5 h-5 text-[#c084fc] absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                id="otpCode"
                name="otpCode"
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
                <span>Confirm Verification & Sign In</span>
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
        /* STEP 1: SIGNUP FORM */
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
            {/* Full Name */}
            <div>
              <label
                htmlFor="fullName"
                className="block text-sm font-bold text-white mb-2 font-mono"
              >
                Full Name <span className="text-[#f43f5e]">*</span>
              </label>
              <div className="relative">
                <User className="w-5 h-5 text-[#c084fc] absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  id="fullName"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  placeholder="e.g. Dr. Rajesh Mohanty / Aditi Rao"
                  value={formData.fullName}
                  onChange={handleChange}
                  className={`w-full bg-[#150733] border rounded-2xl pl-12 pr-4 py-3.5 text-sm font-medium text-white placeholder-[#cbd5e1]/50 transition-all focus:outline-none ${
                    errors.fullName
                      ? 'border-[#f43f5e] focus:ring-2 focus:ring-[#f43f5e]'
                      : 'border-[#a855f7]/30 focus:border-[#fbbf24] focus:ring-2 focus:ring-[#fbbf24]/30'
                  }`}
                />
              </div>
              {errors.fullName && (
                <p className="mt-1.5 text-xs text-[#f43f5e] flex items-center gap-1 font-mono font-bold">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors.fullName}</span>
                </p>
              )}
            </div>

            {/* Institutional Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-bold text-white mb-2 font-mono"
              >
                Institutional Email <span className="text-[#f43f5e]">*</span>
              </label>
              <div className="relative">
                <Mail className="w-5 h-5 text-[#c084fc] absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@cit.edu.in"
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

            {/* Intended Role Selection */}
            <div>
              <label className="block text-sm font-bold text-white mb-2 font-mono">
                Intended Campus Role (RBAC) <span className="text-[#f43f5e]">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {roles.map((r) => {
                  const isSelected = formData.role === r.value;
                  return (
                    <button
                      type="button"
                      key={r.value}
                      onClick={() => setFormData((prev) => ({ ...prev, role: r.value }))}
                      className={`p-4 rounded-2xl border-2 text-left transition-all ${
                        isSelected
                          ? 'bg-[#1e0a42] border-[#fbbf24] shadow-[0_0_20px_rgba(251,191,36,0.5)]'
                          : 'bg-[#080214] border-[#a855f7]/30 hover:border-[#a855f7]'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-black text-white">{r.title}</span>
                        <span
                          className={`w-3 h-3 rounded-full ${
                            isSelected ? 'bg-[#fbbf24] shadow-[0_0_8px_#fbbf24]' : 'bg-transparent border border-white/20'
                          }`}
                        />
                      </div>
                      <div className="text-xs text-[#cbd5e1] line-clamp-1 font-medium">{r.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Password with Strength Indicators */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-bold text-white mb-2 font-mono"
              >
                Password <span className="text-[#f43f5e]">*</span>
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 text-[#c084fc] absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Min 8 chars with upper, lower, number, symbol"
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

              {/* Live Password Validity Rules Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2.5 text-[11px] font-mono">
                <span className={`flex items-center gap-1 ${passwordChecks.length ? 'text-[#34d399]' : 'text-white/40'}`}>
                  <CheckCircle2 className="w-3 h-3 shrink-0" /> 8+ Characters
                </span>
                <span className={`flex items-center gap-1 ${passwordChecks.hasUpper ? 'text-[#34d399]' : 'text-white/40'}`}>
                  <CheckCircle2 className="w-3 h-3 shrink-0" /> Uppercase (A-Z)
                </span>
                <span className={`flex items-center gap-1 ${passwordChecks.hasLower ? 'text-[#34d399]' : 'text-white/40'}`}>
                  <CheckCircle2 className="w-3 h-3 shrink-0" /> Lowercase (a-z)
                </span>
                <span className={`flex items-center gap-1 ${passwordChecks.hasNumber ? 'text-[#34d399]' : 'text-white/40'}`}>
                  <CheckCircle2 className="w-3 h-3 shrink-0" /> One Number (0-9)
                </span>
                <span className={`flex items-center gap-1 ${passwordChecks.hasSpecial ? 'text-[#34d399]' : 'text-white/40'}`}>
                  <CheckCircle2 className="w-3 h-3 shrink-0" /> Special Symbol (!@#)
                </span>
              </div>

              {errors.password && (
                <p className="mt-1.5 text-xs text-[#f43f5e] flex items-center gap-1 font-mono font-bold">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors.password}</span>
                </p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-bold text-white mb-2 font-mono"
              >
                Confirm Password <span className="text-[#f43f5e]">*</span>
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 text-[#c084fc] absolute left-4 top-1/2 -translate-y-1/2" />
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Re-enter password"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  className={`w-full bg-[#150733] border rounded-2xl pl-12 pr-12 py-3.5 text-sm font-medium text-white placeholder-[#cbd5e1]/50 transition-all focus:outline-none ${
                    errors.confirmPassword
                      ? 'border-[#f43f5e] focus:ring-2 focus:ring-[#f43f5e]'
                      : 'border-[#a855f7]/30 focus:border-[#fbbf24] focus:ring-2 focus:ring-[#fbbf24]/30'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#cbd5e1] hover:text-white"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {errors.confirmPassword && (
                <p className="mt-1.5 text-xs text-[#f43f5e] flex items-center gap-1 font-mono font-bold">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors.confirmPassword}</span>
                </p>
              )}
            </div>

            {/* Terms Checkbox */}
            <div>
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  id="agreedToTerms"
                  name="agreedToTerms"
                  type="checkbox"
                  checked={formData.agreedToTerms}
                  onChange={handleChange}
                  className="mt-1 w-4 h-4 rounded border-white/30 bg-[#150733] text-[#c084fc] focus:ring-[#fbbf24]"
                />
                <span className="text-sm text-[#cbd5e1] leading-relaxed font-medium">
                  I agree to the CIT Nexus platform security policies and consent to receive a 6-digit verification code via Brevo mail service.
                </span>
              </label>
              {errors.agreedToTerms && (
                <p className="mt-1.5 text-xs text-[#f43f5e] flex items-center gap-1 font-mono font-bold">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>{errors.agreedToTerms}</span>
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
                <span className="font-mono">Dispatching Brevo Security Code...</span>
              ) : (
                <>
                  <span>Create Account & Send OTP</span>
                  <ArrowRight className="w-4 h-4 stroke-[3]" />
                </>
              )}
            </button>
          </form>
        )
      }

      {/* Switch to Login Link */}
      <div className="mt-10 pt-8 border-t border-white/10 text-center text-sm font-medium text-[#cbd5e1]">
        Already have an institutional profile?{' '}
        <Link href="/login" className="text-[#fbbf24] hover:underline font-bold font-mono">
          Sign In here &rarr;
        </Link>
      </div>
    </div>
  );
};
