'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
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
  Clock,
  ArrowLeft,
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
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // 10-Minute Countdown Timer for OTP
  const [timeLeft, setTimeLeft] = useState(600);

  const otpInputRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ];

  // Countdown effect
  useEffect(() => {
    if (!requiresOtp) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [requiresOtp]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

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
          setTimeLeft(600);
          setTimeout(() => otpInputRefs[0].current?.focus(), 150);
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
      setIsSubmitting(false);
    }
  };

  // OTP segmented input handlers
  const handleDigitChange = (index: number, val: string) => {
    const cleaned = val.replace(/\D/g, '');
    if (!cleaned) {
      const updated = [...otpDigits];
      updated[index] = '';
      setOtpDigits(updated);
      return;
    }

    if (cleaned.length > 1) {
      const digitsArr = cleaned.slice(0, 6).split('');
      const updated = [...otpDigits];
      digitsArr.forEach((d, i) => {
        if (index + i < 6) updated[index + i] = d;
      });
      setOtpDigits(updated);
      const nextIndex = Math.min(index + digitsArr.length, 5);
      otpInputRefs[nextIndex].current?.focus();
      return;
    }

    const updated = [...otpDigits];
    updated[index] = cleaned[0];
    setOtpDigits(updated);

    if (index < 5) {
      otpInputRefs[index + 1].current?.focus();
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs[index - 1].current?.focus();
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullOtp = otpDigits.join('');

    if (fullOtp.length !== 6) {
      setOtpError('Please enter the full 6-digit code.');
      return;
    }

    setOtpLoading(true);
    setOtpError(null);

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email, otp: fullOtp }),
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
      setOtpLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
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
        setResendCooldown(30);
        setTimeLeft(600);
      } else {
        setResendStatus(data.error || 'Failed to resend code.');
      }
    } catch {
      setResendStatus('Error requesting code.');
    }
  };

  return (
    <div className="w-full max-w-lg mx-auto">
      <div className="relative rounded-3xl bg-gradient-to-b from-[#12052e]/95 via-[#0e0424]/95 to-[#070114]/98 border-2 border-[#a855f7]/40 p-7 sm:p-10 shadow-[0_25px_80px_rgba(168,85,247,0.35)] backdrop-blur-3xl overflow-hidden">
        {/* Subtle Decorative Ambient Glows */}
        <div className="absolute -top-24 -right-24 w-60 h-60 bg-[#c084fc]/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-60 h-60 bg-[#fbbf24]/15 rounded-full blur-3xl pointer-events-none" />

        {/* Global Server Error Alert */}
        {serverError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 rounded-2xl bg-[#ef4444]/20 border-2 border-[#ef4444]/60 text-xs font-mono font-bold text-[#fca5a5] flex items-center gap-3"
          >
            <ShieldAlert className="w-5 h-5 text-[#ef4444] shrink-0" />
            <span>{serverError}</span>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {requiresOtp ? (
            /* OTP Step for Unverified User on Login */
            <motion.div
              key="otp-step"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#190938] to-[#2c0b4d] border-2 border-[#fbbf24]/60 mb-4 text-xs font-mono font-black text-[#fde047] shadow-[0_0_20px_rgba(251,191,36,0.3)]">
                  <KeyRound className="w-3.5 h-3.5 text-[#fbbf24]" />
                  <span>SECURITY CODE REQUIRED</span>
                </div>
                <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                  Verify Account Email
                </h2>
                <p className="text-sm text-[#cbd5e1] font-medium mt-2 max-w-md mx-auto">
                  Your email is not yet verified. A 6-digit security code was dispatched via Brevo:
                </p>
                <div className="inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full bg-[#180738] border border-[#a855f7]/40 text-xs font-mono font-bold text-[#fbbf24] shadow-inner">
                  <Mail className="w-3.5 h-3.5 text-[#c084fc]" />
                  <span>{formData.email}</span>
                </div>
              </div>

              <form onSubmit={handleVerifyOtp} className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <label className="text-xs font-mono font-bold text-[#cbd5e1] uppercase tracking-wider">
                      Enter 6-Digit Code
                    </label>
                    <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-[#fbbf24]">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Expires in {formatTime(timeLeft)}</span>
                    </div>
                  </div>

                  {/* 6 Individual Segmented Cyber Boxes */}
                  <div className="grid grid-cols-6 gap-2 sm:gap-3">
                    {otpDigits.map((digit, index) => (
                      <input
                        key={index}
                        ref={otpInputRefs[index]}
                        type="text"
                        inputMode="numeric"
                        pattern="\d*"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleDigitChange(index, e.target.value)}
                        onKeyDown={(e) => handleDigitKeyDown(index, e)}
                        className={`h-14 sm:h-16 text-center font-mono text-2xl sm:text-3xl font-black rounded-2xl bg-[#14062e] border-2 transition-all focus:outline-none ${
                          digit
                            ? 'border-[#fbbf24] text-[#fbbf24] shadow-[0_0_15px_rgba(251,191,36,0.35)]'
                            : 'border-[#a855f7]/40 text-white focus:border-[#c084fc] focus:ring-2 focus:ring-[#c084fc]/30'
                        }`}
                      />
                    ))}
                  </div>

                  {otpError && (
                    <motion.p
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-3 text-xs text-[#f43f5e] flex items-center justify-center gap-1.5 font-mono font-bold text-center"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{otpError}</span>
                    </motion.p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={otpLoading}
                  className="w-full py-4 rounded-2xl font-black text-sm text-[#04010a] bg-gradient-to-r from-[#c084fc] via-[#f43f5e] to-[#fbbf24] hover:opacity-95 transition-all flex items-center justify-center gap-2.5 shadow-[0_0_35px_rgba(217,70,239,0.6)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-60"
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

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono font-bold pt-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resendCooldown > 0}
                    className="text-[#c084fc] hover:text-[#fbbf24] disabled:text-white/30 flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed transition-colors"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${resendCooldown > 0 ? 'animate-spin' : ''}`} />
                    <span>
                      {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend Code via Brevo'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRequiresOtp(false);
                      setOtpDigits(['', '', '', '', '', '']);
                      setOtpError(null);
                    }}
                    className="text-[#cbd5e1] hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Return to login</span>
                  </button>
                </div>

                {resendStatus && (
                  <p className="text-center text-xs font-mono font-bold text-[#34d399]">
                    {resendStatus}
                  </p>
                )}
              </form>
            </motion.div>
          ) : (
            /* Normal Login Form */
            <motion.div
              key="login-step"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Header */}
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#190938] to-[#2c0b4d] border-2 border-[#fbbf24]/50 mb-4 text-xs font-mono font-bold text-[#fde047] shadow-[0_0_15px_rgba(251,191,36,0.3)]">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#fbbf24]" />
                  <span>INSTITUTIONAL ACCESS PROTOCOL</span>
                </div>
                <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                  Sign In to CIT Nexus
                </h1>
                <p className="text-sm text-[#cbd5e1] font-medium mt-2">
                  Enter your verified Chilika Institute institutional credentials.
                </p>
              </div>

              {/* Google OAuth Option */}
              <div className="mb-6">
                <a
                  href="/api/auth/google"
                  className="w-full py-3.5 rounded-2xl bg-[#14062e] hover:bg-[#1f0a45] border-2 border-[#a855f7]/40 hover:border-[#fbbf24] text-white font-bold text-sm flex items-center justify-center gap-3 transition-all shadow-md group hover:scale-[1.01]"
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
                  <span>Continue with Google Institutional</span>
                </a>

                <div className="relative flex items-center justify-center my-6">
                  <div className="border-t border-white/10 w-full" />
                  <span className="bg-[#0e0424] px-4 text-xs font-mono font-bold text-[#cbd5e1] uppercase">
                    or authenticate with credentials
                  </span>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                {/* Email */}
                <div>
                  <label
                    htmlFor="login-email"
                    className="block text-xs font-mono font-bold text-[#cbd5e1] mb-2 uppercase tracking-wider"
                  >
                    Institutional Email <span className="text-[#f43f5e]">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-5 h-5 text-[#c084fc] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="login-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="faculty@cit.edu.in"
                      value={formData.email}
                      onChange={handleChange}
                      className={`w-full bg-[#14062e] border rounded-2xl pl-12 pr-4 py-3.5 text-sm font-medium text-white placeholder-white/30 transition-all focus:outline-none ${
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
                    className="block text-xs font-mono font-bold text-[#cbd5e1] mb-2 uppercase tracking-wider"
                  >
                    Password <span className="text-[#f43f5e]">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-5 h-5 text-[#c084fc] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="login-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Enter your security password"
                      value={formData.password}
                      onChange={handleChange}
                      className={`w-full bg-[#14062e] border rounded-2xl pl-12 pr-12 py-3.5 text-sm font-medium text-white placeholder-white/30 transition-all focus:outline-none ${
                        errors.password
                          ? 'border-[#f43f5e] focus:ring-2 focus:ring-[#f43f5e]'
                          : 'border-[#a855f7]/30 focus:border-[#fbbf24] focus:ring-2 focus:ring-[#fbbf24]/30'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[#cbd5e1] hover:text-white cursor-pointer"
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
                  className="w-full py-4 rounded-2xl font-black text-sm text-[#04010a] bg-gradient-to-r from-[#c084fc] via-[#f43f5e] to-[#fbbf24] hover:opacity-95 transition-all flex items-center justify-center gap-2.5 shadow-[0_0_35px_rgba(217,70,239,0.6)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-60"
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
            </motion.div>
          )}
        </AnimatePresence>

        {/* Switch to Signup */}
        <div className="mt-8 pt-6 border-t border-white/10 text-center text-xs font-mono font-bold text-[#cbd5e1]">
          Need an institutional account?{' '}
          <Link href="/signup" className="text-[#fbbf24] hover:underline">
            Register with Brevo OTP &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
};
