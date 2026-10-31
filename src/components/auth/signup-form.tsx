'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
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
  Shield,
  Building2,
  GraduationCap,
  Clock,
  ArrowLeft,
  Check,
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
    if (!isOtpStep) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOtpStep]);

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

  // Live password validity indicators
  const passwordChecks = {
    length: formData.password.length >= 8,
    hasUpper: /[A-Z]/.test(formData.password),
    hasLower: /[a-z]/.test(formData.password),
    hasNumber: /[0-9]/.test(formData.password),
    hasSpecial: /[^A-Za-z0-9]/.test(formData.password),
  };

  const strengthCount = Object.values(passwordChecks).filter(Boolean).length;
  const strengthColors = ['bg-white/10', 'bg-red-500', 'bg-orange-500', 'bg-amber-400', 'bg-[#6366F1]', 'bg-[#10B981]'];
  const strengthLabels = ['No password', 'Very Weak', 'Weak', 'Fair', 'Strong', 'Institutional Grade'];

  const roles: {
    value: UserRole;
    title: string;
    desc: string;
    icon: React.ElementType;
    accent: string;
  }[] = [
    {
      value: 'Admin',
      title: 'Administrator',
      desc: 'Institute policy & global oversight',
      icon: Shield,
      accent: 'text-[#6366F1]',
    },
    {
      value: 'Department Coordinator',
      title: 'Dept Coordinator',
      desc: 'Curriculum & venue allocations',
      icon: Building2,
      accent: 'text-[#22D3EE]',
    },
    {
      value: 'Faculty',
      title: 'Faculty Member',
      desc: 'Teaching schedules & cohorts',
      icon: GraduationCap,
      accent: 'text-[#6366F1]',
    },
    {
      value: 'Club Representative',
      title: 'Club Representative',
      desc: 'Society events & fest pipeline',
      icon: Sparkles,
      accent: 'text-[#22D3EE]',
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
      setTimeLeft(600);
      setTimeout(() => otpInputRefs[0].current?.focus(), 150);
    } catch {
      setServerError('Network error connecting to backend service.');
    } finally {
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

  // Step 2: Verify 6-digit OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullOtp = otpDigits.join('');

    if (fullOtp.length !== 6) {
      setOtpError('Please enter the complete 6-digit verification code.');
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
      setOtpError('Network error while verifying OTP.');
      setOtpLoading(false);
    }
  };

  // Resend OTP via Brevo
  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
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
        setResendStatus('New 6-digit code sent to your email.');
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
    <div className="w-full max-w-xl mx-auto">
      {/* Container with Glassmorphic styling */}
      <div className="relative rounded-3xl bg-[#0D1426]/90 border border-white/[0.08] p-6 sm:p-9 shadow-2xl backdrop-blur-2xl overflow-hidden">
        {/* Decorative Ambient Glow */}
        <div className="absolute -top-16 -right-16 w-44 h-44 bg-[#6366F1]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-44 h-44 bg-[#22D3EE]/10 rounded-full blur-3xl pointer-events-none" />

        {/* Global Server Error Alert */}
        {serverError && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-3.5 rounded-xl bg-red-500/10 border border-red-500/25 text-xs font-mono font-medium text-red-400 flex items-center gap-2.5"
          >
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
            <span>{serverError}</span>
          </motion.div>
        )}

        {/* STEP 2: CONFIRM OTP VIEW */}
        <AnimatePresence mode="wait">
          {isOtpStep ? (
            <motion.div
              key="otp-step"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.3 }}
            >
              {/* Header */}
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#111B30] border border-white/[0.08] mb-3 text-[11px] font-mono font-semibold text-[#22D3EE]">
                  <KeyRound className="w-3.5 h-3.5 text-[#22D3EE]" />
                  <span>STEP 2 OF 2 • IDENTITY VERIFICATION</span>
                </div>

                <h2 className="text-2xl sm:text-3xl font-extrabold text-[#F8FAFC] tracking-tight">
                  Verify Security Code
                </h2>

                <p className="text-xs sm:text-sm text-[#A7B3C9] font-normal mt-2 max-w-md mx-auto">
                  A secure 6-digit one-time code (OTP) was dispatched via Brevo to your inbox:
                </p>

                {/* Email Chip */}
                <div className="inline-flex items-center gap-2 mt-3 px-3.5 py-1 rounded-full bg-[#111B30] border border-white/[0.08] text-xs font-mono font-medium text-[#22D3EE]">
                  <Mail className="w-3.5 h-3.5 text-[#6366F1]" />
                  <span>{formData.email}</span>
                </div>
              </div>

              {/* OTP Form */}
              <form onSubmit={handleVerifyOtp} className="space-y-6">
                <div>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <label className="text-xs font-mono font-medium text-[#A7B3C9] uppercase tracking-wider">
                      Enter 6-Digit Code
                    </label>
                    <div className="flex items-center gap-1.5 text-xs font-mono text-[#22D3EE]">
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
                        className={`h-12 sm:h-14 text-center font-mono text-xl sm:text-2xl font-bold rounded-xl bg-[#111B30] border transition-all focus:outline-none ${
                          digit
                            ? 'border-[#22D3EE] text-[#22D3EE] shadow-sm shadow-[#22D3EE]/20'
                            : 'border-white/[0.1] text-[#F8FAFC] focus:border-[#6366F1]'
                        }`}
                      />
                    ))}
                  </div>

                  {otpError && (
                    <motion.p
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-3 text-xs text-red-400 flex items-center justify-center gap-1.5 font-mono text-center"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{otpError}</span>
                    </motion.p>
                  )}
                </div>

                {/* Confirm Button */}
                <button
                  type="submit"
                  disabled={otpLoading}
                  className="w-full py-3.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-[#6366F1] to-[#22D3EE] hover:opacity-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#6366F1]/20 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer disabled:opacity-60"
                >
                  {otpLoading ? (
                    <span className="font-mono text-xs">Verifying Security Code...</span>
                  ) : (
                    <>
                      <span>Confirm Verification & Enter Console</span>
                      <ArrowRight className="w-4 h-4 stroke-[2]" />
                    </>
                  )}
                </button>

                {/* Sub Actions Bar */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono pt-3 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resendCooldown > 0}
                    className="text-[#22D3EE] hover:underline disabled:text-[#A7B3C9]/40 flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed transition-colors"
                  >
                    <RotateCcw className={`w-3.5 h-3.5 ${resendCooldown > 0 ? 'animate-spin' : ''}`} />
                    <span>
                      {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend Code via Brevo'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsOtpStep(false);
                      setOtpDigits(['', '', '', '', '', '']);
                      setOtpError(null);
                    }}
                    className="text-[#A7B3C9] hover:text-[#F8FAFC] flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Change email address</span>
                  </button>
                </div>

                {resendStatus && (
                  <p className="text-center text-xs font-mono text-[#10B981]">
                    {resendStatus}
                  </p>
                )}
              </form>
            </motion.div>
          ) : (
            /* STEP 1: ENROLLMENT FORM */
            <motion.div
              key="signup-step"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Header */}
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#111B30] border border-white/[0.08] mb-3 text-[11px] font-mono font-semibold text-[#22D3EE]">
                  <Sparkles className="w-3.5 h-3.5 text-[#22D3EE]" />
                  <span>STEP 1 OF 2 • SECURE ENROLLMENT</span>
                </div>

                <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F8FAFC] tracking-tight">
                  Create Institutional Account
                </h1>

                <p className="text-xs sm:text-sm text-[#A7B3C9] font-normal mt-1.5">
                  Access the centralized campus operations and scheduling workspace.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {/* Full Name */}
                <div>
                  <label
                    htmlFor="fullName"
                    className="block text-xs font-mono font-medium text-[#A7B3C9] mb-1.5 uppercase tracking-wider"
                  >
                    Full Name <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-[#A7B3C9]/50 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="fullName"
                      name="fullName"
                      type="text"
                      autoComplete="name"
                      placeholder="e.g. Dr. Rajesh Mohanty / Aditi Rao"
                      value={formData.fullName}
                      onChange={handleChange}
                      className={`w-full bg-[#111B30] border rounded-xl pl-10 pr-4 py-2.5 text-xs font-medium text-[#F8FAFC] placeholder-[#A7B3C9]/40 transition-all focus:outline-none ${
                        errors.fullName
                          ? 'border-red-400 focus:ring-1 focus:ring-red-400'
                          : 'border-white/[0.1] focus:border-[#6366F1] focus:ring-1 focus:ring-[#6366F1]'
                      }`}
                    />
                  </div>
                  {errors.fullName && (
                    <p className="mt-1 text-xs text-red-400 flex items-center gap-1 font-mono">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{errors.fullName}</span>
                    </p>
                  )}
                </div>

                {/* Institutional Email */}
                <div>
                  <label
                    htmlFor="email"
                    className="block text-xs font-mono font-medium text-[#A7B3C9] mb-1.5 uppercase tracking-wider"
                  >
                    Institutional Email <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#A7B3C9]/50 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="name@cit.edu.in"
                      value={formData.email}
                      onChange={handleChange}
                      className={`w-full bg-[#111B30] border rounded-xl pl-10 pr-4 py-2.5 text-xs font-medium text-[#F8FAFC] placeholder-[#A7B3C9]/40 transition-all focus:outline-none ${
                        errors.email
                          ? 'border-red-400 focus:ring-1 focus:ring-red-400'
                          : 'border-white/[0.1] focus:border-[#6366F1] focus:ring-1 focus:ring-[#6366F1]'
                      }`}
                    />
                  </div>
                  {errors.email && (
                    <p className="mt-1 text-xs text-red-400 flex items-center gap-1 font-mono">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{errors.email}</span>
                    </p>
                  )}
                </div>

                {/* Intended Role Selection Grid */}
                <div>
                  <label className="block text-xs font-mono font-medium text-[#A7B3C9] mb-1.5 uppercase tracking-wider">
                    Intended Campus Role (RBAC) <span className="text-red-400">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {roles.map((r) => {
                      const isSelected = formData.role === r.value;
                      const IconComp = r.icon;
                      return (
                        <button
                          type="button"
                          key={r.value}
                          onClick={() => setFormData((prev) => ({ ...prev, role: r.value }))}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden group ${
                            isSelected
                              ? 'bg-[#111B30] border-[#22D3EE] shadow-sm shadow-[#22D3EE]/20'
                              : 'bg-[#111B30]/70 border-white/[0.08] hover:border-[#6366F1]/50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <IconComp className={`w-4 h-4 ${r.accent}`} />
                              <span className="text-xs font-bold text-[#F8FAFC]">{r.title}</span>
                            </div>
                            <span
                              className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-all ${
                                isSelected
                                  ? 'bg-[#22D3EE] text-[#080D1B]'
                                  : 'border border-white/20'
                              }`}
                            >
                              {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#A7B3C9] font-normal leading-tight">
                            {r.desc}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Password with Strength Indicators */}
                <div>
                  <label
                    htmlFor="password"
                    className="block text-xs font-mono font-medium text-[#A7B3C9] mb-1.5 uppercase tracking-wider"
                  >
                    Password <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#A7B3C9]/50 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Min 8 chars with upper, lower, number, symbol"
                      value={formData.password}
                      onChange={handleChange}
                      className={`w-full bg-[#111B30] border rounded-xl pl-10 pr-10 py-2.5 text-xs font-medium text-[#F8FAFC] placeholder-[#A7B3C9]/40 transition-all focus:outline-none ${
                        errors.password
                          ? 'border-red-400 focus:ring-1 focus:ring-red-400'
                          : 'border-white/[0.1] focus:border-[#6366F1] focus:ring-1 focus:ring-[#6366F1]'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#A7B3C9] hover:text-[#F8FAFC] cursor-pointer"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Password Strength Meter */}
                  {formData.password && (
                    <div className="mt-2.5 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-[#A7B3C9]">Strength</span>
                        <span className="font-semibold text-[#F8FAFC]">{strengthLabels[strengthCount]}</span>
                      </div>
                      <div className="grid grid-cols-5 gap-1.5 h-1">
                        {[1, 2, 3, 4, 5].map((lvl) => (
                          <div
                            key={lvl}
                            className={`rounded-full transition-all duration-300 ${
                              strengthCount >= lvl ? strengthColors[strengthCount] : 'bg-white/10'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Live Password Validity Rules Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-2.5 text-[10px] font-mono">
                    <span className={`flex items-center gap-1 ${passwordChecks.length ? 'text-[#10B981]' : 'text-[#A7B3C9]/50'}`}>
                      <CheckCircle2 className="w-3 h-3 shrink-0" /> 8+ Chars
                    </span>
                    <span className={`flex items-center gap-1 ${passwordChecks.hasUpper ? 'text-[#10B981]' : 'text-[#A7B3C9]/50'}`}>
                      <CheckCircle2 className="w-3 h-3 shrink-0" /> Upper (A-Z)
                    </span>
                    <span className={`flex items-center gap-1 ${passwordChecks.hasLower ? 'text-[#10B981]' : 'text-[#A7B3C9]/50'}`}>
                      <CheckCircle2 className="w-3 h-3 shrink-0" /> Lower (a-z)
                    </span>
                    <span className={`flex items-center gap-1 ${passwordChecks.hasNumber ? 'text-[#10B981]' : 'text-[#A7B3C9]/50'}`}>
                      <CheckCircle2 className="w-3 h-3 shrink-0" /> Number (0-9)
                    </span>
                    <span className={`flex items-center gap-1 ${passwordChecks.hasSpecial ? 'text-[#10B981]' : 'text-[#A7B3C9]/50'}`}>
                      <CheckCircle2 className="w-3 h-3 shrink-0" /> Symbol (!@#$)
                    </span>
                  </div>

                  {errors.password && (
                    <p className="mt-1.5 text-xs text-red-400 flex items-center gap-1 font-mono">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{errors.password}</span>
                    </p>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-xs font-mono font-medium text-[#A7B3C9] mb-1.5 uppercase tracking-wider"
                  >
                    Confirm Password <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#A7B3C9]/50 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Re-enter password"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      className={`w-full bg-[#111B30] border rounded-xl pl-10 pr-10 py-2.5 text-xs font-medium text-[#F8FAFC] placeholder-[#A7B3C9]/40 transition-all focus:outline-none ${
                        errors.confirmPassword
                          ? 'border-red-400 focus:ring-1 focus:ring-red-400'
                          : 'border-white/[0.1] focus:border-[#6366F1] focus:ring-1 focus:ring-[#6366F1]'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#A7B3C9] hover:text-[#F8FAFC] cursor-pointer"
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="mt-1 text-xs text-red-400 flex items-center gap-1 font-mono">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{errors.confirmPassword}</span>
                    </p>
                  )}
                </div>

                {/* Terms Checkbox */}
                <div className="pt-1">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      id="agreedToTerms"
                      name="agreedToTerms"
                      type="checkbox"
                      checked={formData.agreedToTerms}
                      onChange={handleChange}
                      className="mt-0.5 w-4 h-4 rounded border-white/20 bg-[#111B30] text-[#6366F1] focus:ring-[#6366F1] cursor-pointer"
                    />
                    <span className="text-xs text-[#A7B3C9] leading-relaxed font-normal">
                      I agree to the CIT Nexus platform security policies and consent to receive a 6-digit verification code via Brevo.
                    </span>
                  </label>
                  {errors.agreedToTerms && (
                    <p className="mt-1 text-xs text-red-400 flex items-center gap-1 font-mono">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{errors.agreedToTerms}</span>
                    </p>
                  )}
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 rounded-xl font-semibold text-xs text-white bg-gradient-to-r from-[#6366F1] to-[#22D3EE] hover:opacity-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#6366F1]/25 hover:-translate-y-0.5 active:translate-y-0 cursor-pointer disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <span className="font-mono">Dispatching Brevo Security Code...</span>
                  ) : (
                    <>
                      <span>Create Account & Send OTP</span>
                      <ArrowRight className="w-4 h-4 stroke-[2]" />
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Switch to Login Link */}
        <div className="mt-6 pt-5 border-t border-white/[0.08] text-center text-xs font-mono text-[#A7B3C9]">
          Already registered?{' '}
          <Link href="/login" className="text-[#22D3EE] hover:underline font-semibold">
            Sign in to your account &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
};
