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
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
  UserCheck,
} from 'lucide-react';
import { LoginFormData, ValidationErrors, validateLoginForm } from '@/lib/validation';
import { DEMO_USERS } from '@/lib/dataset/cit-data';

export const LoginForm: React.FC = () => {
  const router = useRouter();

  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
  });

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [demoLoadingRole, setDemoLoadingRole] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);

  // Unverified OTP Step fallback
  const [requiresOtp, setRequiresOtp] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpLoading, setOtpLoading] = useState(false);
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

  // Demo 1-Click Login Handler
  const handleDemoLogin = async (role: string) => {
    setDemoLoadingRole(role);
    setServerError(null);

    try {
      const res = await fetch('/api/auth/demo-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to authenticate demo user');
      }

      router.push('/dashboard');
      router.refresh();
    } catch (err: any) {
      setServerError(err.message || 'Demo login error');
      setDemoLoadingRole(null);
    }
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
        if (res.status === 403 && data.requiresOtp) {
          setRequiresOtp(true);
          return;
        }
        setServerError(data.error || 'Authentication rejected. Please check credentials.');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setServerError('Network dispatch error. Please retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpDigitChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...otpDigits];
    newDigits[index] = value.slice(-1);
    setOtpDigits(newDigits);
    setOtpError(null);

    if (value && index < 5) {
      otpInputRefs[index + 1].current?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs[index - 1].current?.focus();
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const otp = otpDigits.join('');
    if (otp.length !== 6) {
      setOtpError('Please input complete 6-digit OTP code.');
      return;
    }

    setOtpLoading(true);
    setOtpError(null);

    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email, otp }),
      });

      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.error || 'Verification failed. Please retry.');
        return;
      }

      router.push('/dashboard');
      router.refresh();
    } catch {
      setOtpError('Connection error. Please try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="relative rounded-2xl p-6 sm:p-8 bg-[#0D1426]/90 border border-[rgba(148,163,184,0.18)] shadow-2xl backdrop-blur-xl">
        {/* Subtle Ambient Glow */}
        <div className="absolute -top-12 -right-12 w-36 h-36 bg-[#6366F1]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -left-12 w-36 h-36 bg-[#22D3EE]/10 rounded-full blur-3xl pointer-events-none" />

        <AnimatePresence mode="wait">
          {!requiresOtp ? (
            <motion.div
              key="login-step"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <div className="mb-6 text-center sm:text-left">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#6366F1]/15 border border-[#6366F1]/30 text-[#22D3EE] text-[11px] font-mono font-medium mb-3">
                  <Sparkles className="w-3.5 h-3.5 text-[#22D3EE]" />
                  FAST-TRACK EVALUATION ACCESS
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-[#F8FAFC] tracking-tight">
                  One-Click Demo Roles
                </h2>
                <p className="text-xs sm:text-sm text-[#A7B3C9] mt-1">
                  Select a pre-configured role to immediately enter the command console.
                </p>
              </div>

              {serverError && (
                <div className="mb-4 p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 flex items-center gap-3 text-red-400 text-xs font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{serverError}</span>
                </div>
              )}

              {/* Four Demo Role Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                {DEMO_USERS.map((user) => {
                  const isLoading = demoLoadingRole === user.role;
                  return (
                    <button
                      key={user.role}
                      type="button"
                      disabled={demoLoadingRole !== null}
                      onClick={() => handleDemoLogin(user.role)}
                      className="group text-left p-3.5 rounded-xl bg-[#111B30] hover:bg-[#111B30]/90 border border-[rgba(148,163,184,0.18)] hover:border-[#6366F1]/60 transition-all hover:-translate-y-0.5 active:translate-y-0 shadow-sm flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-2xl">{user.avatar}</span>
                          <span className="text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded bg-[#080D1B] border border-[rgba(148,163,184,0.15)] text-[#A7B3C9] group-hover:text-[#22D3EE] group-hover:border-[#22D3EE]/40 transition-colors">
                            {user.role === 'Admin' ? 'Dean' : user.role === 'Department Coordinator' ? 'Coord' : user.role === 'Club Representative' ? 'Club' : 'Prof'}
                          </span>
                        </div>
                        <div className="font-semibold text-sm text-[#F8FAFC] group-hover:text-[#22D3EE] transition-colors">
                          {user.role}
                        </div>
                        <div className="text-[11px] text-[#A7B3C9] line-clamp-2 mt-1">
                          {user.description}
                        </div>
                      </div>

                      <div className="mt-3 pt-2.5 border-t border-[rgba(148,163,184,0.12)] flex items-center justify-between text-xs font-mono font-medium text-[#6366F1] group-hover:text-[#22D3EE]">
                        <span>{isLoading ? 'Entering Console...' : 'Launch as ' + user.role}</span>
                        <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Collapsible Manual Email/Password Form */}
              <div className="pt-2 border-t border-[rgba(148,163,184,0.14)]">
                <button
                  type="button"
                  onClick={() => setShowManualForm(!showManualForm)}
                  className="w-full py-2 flex items-center justify-between text-xs font-mono font-medium text-[#A7B3C9] hover:text-[#F8FAFC] transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <UserCheck className="w-3.5 h-3.5 text-[#22D3EE]" />
                    Or Sign In with Email & Password
                  </span>
                  {showManualForm ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                <AnimatePresence>
                  {showManualForm && (
                    <motion.form
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      onSubmit={handleSubmit}
                      className="space-y-4 pt-3 overflow-hidden"
                    >
                      <div>
                        <label className="block text-xs font-mono text-[#A7B3C9] mb-1">
                          INSTITUTIONAL EMAIL
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A7B3C9]/50" />
                          <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            placeholder="username@citnexus.edu"
                            className="w-full bg-[#111B30] border border-[rgba(148,163,184,0.18)] focus:border-[#6366F1] focus:ring-1 focus:ring-[#6366F1] rounded-xl py-2.5 pl-10 pr-4 text-xs font-mono text-[#F8FAFC] placeholder-[#A7B3C9]/40 outline-none transition-all"
                          />
                        </div>
                        {errors.email && (
                          <p className="text-[11px] text-red-400 mt-1">{errors.email}</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-mono text-[#A7B3C9] mb-1">
                          PASSWORD
                        </label>
                        <div className="relative">
                          <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A7B3C9]/50" />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            placeholder="••••••••••••"
                            className="w-full bg-[#111B30] border border-[rgba(148,163,184,0.18)] focus:border-[#6366F1] focus:ring-1 focus:ring-[#6366F1] rounded-xl py-2.5 pl-10 pr-10 text-xs font-mono text-[#F8FAFC] placeholder-[#A7B3C9]/40 outline-none transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#A7B3C9] hover:text-[#F8FAFC]"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        {errors.password && (
                          <p className="text-[11px] text-red-400 mt-1">{errors.password}</p>
                        )}
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full py-2.5 px-4 rounded-xl font-mono font-semibold text-xs bg-gradient-to-r from-[#6366F1] to-[#22D3EE] hover:opacity-95 text-white shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                      >
                        {isSubmitting ? (
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <>
                            <span>Authorize & Enter Console</span>
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </button>
                    </motion.form>
                  )}
                </AnimatePresence>
              </div>

              <div className="mt-6 text-center text-xs text-[#A7B3C9] font-mono">
                Need institutional clearance?{' '}
                <Link href="/signup" className="text-[#22D3EE] hover:underline font-semibold">
                  Register for CIT Nexus Account
                </Link>
              </div>
            </motion.div>
          ) : (
            /* OTP Verification Screen */
            <motion.div
              key="otp-step"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.3 }}
            >
              <div className="text-center mb-6">
                <div className="w-12 h-12 rounded-xl bg-[#6366F1]/15 border border-[#6366F1]/30 flex items-center justify-center mx-auto mb-3 text-[#22D3EE]">
                  <Clock className="w-6 h-6 animate-pulse" />
                </div>
                <h3 className="text-2xl font-bold text-[#F8FAFC]">Enter Security OTP</h3>
                <p className="text-xs text-[#A7B3C9] mt-1">
                  6-digit verification code dispatched to <span className="text-[#22D3EE]">{formData.email}</span>
                </p>
                <div className="inline-block mt-2 px-3 py-1 rounded-full bg-[#111B30] border border-[rgba(148,163,184,0.18)] text-[11px] font-mono text-[#A7B3C9]">
                  Expires in: <span className="text-[#F8FAFC] font-semibold">{formatTime(timeLeft)}</span>
                </div>
              </div>

              {otpError && (
                <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{otpError}</span>
                </div>
              )}

              <form onSubmit={handleVerifyOtp} className="space-y-6">
                <div className="flex justify-center gap-2 sm:gap-3">
                  {otpDigits.map((digit, i) => (
                    <input
                      key={i}
                      ref={otpInputRefs[i]}
                      type="text"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(i, e)}
                      className="w-10 sm:w-12 h-12 sm:h-14 text-center text-xl font-mono font-bold rounded-xl bg-[#111B30] border border-[rgba(148,163,184,0.2)] focus:border-[#22D3EE] text-[#22D3EE] outline-none shadow-sm transition-all"
                    />
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={otpLoading}
                  className="w-full py-3 rounded-xl font-mono font-semibold text-sm bg-gradient-to-r from-[#6366F1] to-[#22D3EE] hover:opacity-95 text-white shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {otpLoading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Confirm & Authenticate</span>
                    </>
                  )}
                </button>

                <div className="flex items-center justify-between text-xs font-mono text-[#A7B3C9]">
                  <button
                    type="button"
                    onClick={() => setRequiresOtp(false)}
                    className="hover:text-[#F8FAFC] flex items-center gap-1 cursor-pointer"
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    disabled={resendCooldown > 0}
                    onClick={() => setResendCooldown(60)}
                    className="text-[#22D3EE] hover:underline disabled:opacity-50 cursor-pointer"
                  >
                    {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend OTP Code'}
                  </button>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
