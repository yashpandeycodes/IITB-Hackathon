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
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes in seconds

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
  const strengthColors = ['bg-white/10', 'bg-[#ef4444]', 'bg-[#f97316]', 'bg-[#fbbf24]', 'bg-[#38bdf8]', 'bg-[#34d399]'];
  const strengthLabels = ['No password', 'Very Weak', 'Weak', 'Fair', 'Strong', 'Institutional Grade'];

  const roles: {
    value: UserRole;
    title: string;
    desc: string;
    icon: React.ElementType;
    accent: string;
    borderAccent: string;
  }[] = [
    {
      value: 'Admin',
      title: 'Administrator',
      desc: 'Institute policy & global oversight',
      icon: Shield,
      accent: 'text-[#f43f5e]',
      borderAccent: '#f43f5e',
    },
    {
      value: 'Department Coordinator',
      title: 'Dept Coordinator',
      desc: 'Curriculum & venue allocations',
      icon: Building2,
      accent: 'text-[#fbbf24]',
      borderAccent: '#fbbf24',
    },
    {
      value: 'Faculty',
      title: 'Faculty Member',
      desc: 'Teaching schedules & cohorts',
      icon: GraduationCap,
      accent: 'text-[#38bdf8]',
      borderAccent: '#38bdf8',
    },
    {
      value: 'Club Representative',
      title: 'Club Representative',
      desc: 'Society events & fest pipeline',
      icon: Sparkles,
      accent: 'text-[#c084fc]',
      borderAccent: '#c084fc',
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
        const errorMsg = data.error?.message || (typeof data.error === 'string' ? data.error : '') || data.message || 'Registration failed. Please try again.';
        setServerError(errorMsg);
        setIsSubmitting(false);
        return;
      }

      // Transition to OTP verification step
      setIsOtpStep(true);
      setTimeLeft(600); // 10 minutes
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

    // If multiple digits pasted
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

    // Auto-advance to next input box
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

      // Successful verification! Redirect to dashboard
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
        setResendStatus('New 6-digit code sent to your email!');
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
      {/* Floating Glowing Container */}
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

        {/* STEP 2: CONFIRM OTP VIEW */}
        <AnimatePresence mode="wait">
          {isOtpStep ? (
            <motion.div
              key="otp-step"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
            >
              {/* Header */}
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#190938] to-[#2c0b4d] border-2 border-[#fbbf24]/60 mb-4 text-xs font-mono font-black text-[#fde047] shadow-[0_0_20px_rgba(251,191,36,0.3)]">
                  <KeyRound className="w-3.5 h-3.5 text-[#fbbf24]" />
                  <span>STEP 2 OF 2 • IDENTITY VERIFICATION</span>
                </div>

                <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                  Verify Security Code
                </h2>

                <p className="text-sm text-[#cbd5e1] font-medium mt-2 max-w-md mx-auto">
                  A secure 6-digit one-time code (OTP) was dispatched via Brevo to your institutional inbox:
                </p>

                {/* Email Chip */}
                <div className="inline-flex items-center gap-2 mt-3 px-4 py-1.5 rounded-full bg-[#180738] border border-[#a855f7]/40 text-xs font-mono font-bold text-[#fbbf24] shadow-inner">
                  <Mail className="w-3.5 h-3.5 text-[#c084fc]" />
                  <span>{formData.email}</span>
                </div>
              </div>

              {/* OTP Form */}
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

                  {/* 6 Individual Futuristic Segmented Cyber Boxes */}
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

                {/* Confirm Button */}
                <button
                  type="submit"
                  disabled={otpLoading}
                  className="w-full py-4 rounded-2xl font-black text-sm text-[#04010a] bg-gradient-to-r from-[#c084fc] via-[#f43f5e] to-[#fbbf24] hover:opacity-95 transition-all flex items-center justify-center gap-2.5 shadow-[0_0_35px_rgba(217,70,239,0.6)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-60"
                >
                  {otpLoading ? (
                    <span className="font-mono">Verifying Security Code...</span>
                  ) : (
                    <>
                      <span>Confirm Verification & Launch Console</span>
                      <ArrowRight className="w-4 h-4 stroke-[3]" />
                    </>
                  )}
                </button>

                {/* Sub Actions Bar */}
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
                      setIsOtpStep(false);
                      setOtpDigits(['', '', '', '', '', '']);
                      setOtpError(null);
                    }}
                    className="text-[#cbd5e1] hover:text-white flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Change email address</span>
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
            /* STEP 1: ENROLLMENT FORM */
            <motion.div
              key="signup-step"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* Header */}
              <div className="text-center mb-8">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-[#190938] to-[#2c0b4d] border-2 border-[#c084fc]/50 mb-4 text-xs font-mono font-bold text-[#fde047] shadow-[0_0_15px_rgba(251,191,36,0.3)]">
                  <Sparkles className="w-3.5 h-3.5 text-[#fbbf24]" />
                  <span>STEP 1 OF 2 • SECURE ENROLLMENT</span>
                </div>

                <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                  Create Institutional Account
                </h1>

                <p className="text-sm text-[#cbd5e1] font-medium mt-2">
                  Access the centralized campus operations and scheduling workspace.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6" noValidate>
                {/* Full Name */}
                <div>
                  <label
                    htmlFor="fullName"
                    className="block text-xs font-mono font-bold text-[#cbd5e1] mb-2 uppercase tracking-wider"
                  >
                    Full Name <span className="text-[#f43f5e]">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-5 h-5 text-[#c084fc] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="fullName"
                      name="fullName"
                      type="text"
                      autoComplete="name"
                      placeholder="e.g. Dr. Rajesh Mohanty / Aditi Rao"
                      value={formData.fullName}
                      onChange={handleChange}
                      className={`w-full bg-[#14062e] border rounded-2xl pl-12 pr-4 py-3.5 text-sm font-medium text-white placeholder-white/30 transition-all focus:outline-none ${
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
                    className="block text-xs font-mono font-bold text-[#cbd5e1] mb-2 uppercase tracking-wider"
                  >
                    Institutional Email <span className="text-[#f43f5e]">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-5 h-5 text-[#c084fc] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="name@cit.edu.in"
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

                {/* Intended Role Selection Grid */}
                <div>
                  <label className="block text-xs font-mono font-bold text-[#cbd5e1] mb-2 uppercase tracking-wider">
                    Intended Campus Role (RBAC) <span className="text-[#f43f5e]">*</span>
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {roles.map((r) => {
                      const isSelected = formData.role === r.value;
                      const IconComp = r.icon;
                      return (
                        <button
                          type="button"
                          key={r.value}
                          onClick={() => setFormData((prev) => ({ ...prev, role: r.value }))}
                          className={`p-3.5 rounded-2xl border-2 text-left transition-all cursor-pointer relative overflow-hidden group ${
                            isSelected
                              ? 'bg-[#1e0a42] border-[#fbbf24] shadow-[0_0_20px_rgba(251,191,36,0.4)]'
                              : 'bg-[#14062e]/80 border-[#a855f7]/30 hover:border-[#a855f7]/70'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <IconComp className={`w-4 h-4 ${r.accent}`} />
                              <span className="text-sm font-black text-white">{r.title}</span>
                            </div>
                            <span
                              className={`w-4 h-4 rounded-full flex items-center justify-center transition-all ${
                                isSelected
                                  ? 'bg-[#fbbf24] text-[#04010a]'
                                  : 'border border-white/20'
                              }`}
                            >
                              {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#cbd5e1] font-medium leading-tight">
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
                    className="block text-xs font-mono font-bold text-[#cbd5e1] mb-2 uppercase tracking-wider"
                  >
                    Password <span className="text-[#f43f5e]">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-5 h-5 text-[#c084fc] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Min 8 chars with upper, lower, number, symbol"
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

                  {/* Password Strength Meter */}
                  {formData.password && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between text-[11px] font-mono">
                        <span className="text-white/60">Strength</span>
                        <span className="font-bold text-white">{strengthLabels[strengthCount]}</span>
                      </div>
                      <div className="grid grid-cols-5 gap-1.5 h-1.5">
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
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3 text-[11px] font-mono">
                    <span className={`flex items-center gap-1.5 ${passwordChecks.length ? 'text-[#34d399]' : 'text-white/40'}`}>
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> 8+ Characters
                    </span>
                    <span className={`flex items-center gap-1.5 ${passwordChecks.hasUpper ? 'text-[#34d399]' : 'text-white/40'}`}>
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Uppercase (A-Z)
                    </span>
                    <span className={`flex items-center gap-1.5 ${passwordChecks.hasLower ? 'text-[#34d399]' : 'text-white/40'}`}>
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Lowercase (a-z)
                    </span>
                    <span className={`flex items-center gap-1.5 ${passwordChecks.hasNumber ? 'text-[#34d399]' : 'text-white/40'}`}>
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Number (0-9)
                    </span>
                    <span className={`flex items-center gap-1.5 ${passwordChecks.hasSpecial ? 'text-[#34d399]' : 'text-white/40'}`}>
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> Symbol (!@#$)
                    </span>
                  </div>

                  {errors.password && (
                    <p className="mt-2 text-xs text-[#f43f5e] flex items-center gap-1 font-mono font-bold">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{errors.password}</span>
                    </p>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-xs font-mono font-bold text-[#cbd5e1] mb-2 uppercase tracking-wider"
                  >
                    Confirm Password <span className="text-[#f43f5e]">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-5 h-5 text-[#c084fc] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="confirmPassword"
                      name="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Re-enter password"
                      value={formData.confirmPassword}
                      onChange={handleChange}
                      className={`w-full bg-[#14062e] border rounded-2xl pl-12 pr-12 py-3.5 text-sm font-medium text-white placeholder-white/30 transition-all focus:outline-none ${
                        errors.confirmPassword
                          ? 'border-[#f43f5e] focus:ring-2 focus:ring-[#f43f5e]'
                          : 'border-[#a855f7]/30 focus:border-[#fbbf24] focus:ring-2 focus:ring-[#fbbf24]/30'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-[#cbd5e1] hover:text-white cursor-pointer"
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
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      id="agreedToTerms"
                      name="agreedToTerms"
                      type="checkbox"
                      checked={formData.agreedToTerms}
                      onChange={handleChange}
                      className="mt-1 w-4 h-4 rounded border-white/30 bg-[#14062e] text-[#c084fc] focus:ring-[#fbbf24] cursor-pointer"
                    />
                    <span className="text-xs text-[#cbd5e1] leading-relaxed font-medium">
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
                  className="w-full py-4 rounded-2xl font-black text-sm text-[#04010a] bg-gradient-to-r from-[#c084fc] via-[#f43f5e] to-[#fbbf24] hover:opacity-95 transition-all flex items-center justify-center gap-2.5 shadow-[0_0_35px_rgba(217,70,239,0.6)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-60"
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
            </motion.div>
          )}
        </AnimatePresence>

        {/* Switch to Login Link */}
        <div className="mt-8 pt-6 border-t border-white/10 text-center text-xs font-mono font-bold text-[#cbd5e1]">
          Already registered?{' '}
          <Link href="/login" className="text-[#fbbf24] hover:underline">
            Sign in to your account &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
};
