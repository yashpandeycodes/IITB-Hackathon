'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  User,
  Mail,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Shield,
} from 'lucide-react';
import {
  SignupFormData,
  UserRole,
  ValidationErrors,
  validateSignupForm,
} from '@/lib/validation';

export const SignupForm: React.FC = () => {
  const [formData, setFormData] = useState<SignupFormData>({
    fullName: '',
    email: '',
    role: 'Faculty',
    password: '',
    confirmPassword: '',
    agreedToTerms: false,
  });

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [demoSuccess, setDemoSuccess] = useState(false);

  const roles: { value: UserRole; title: string; desc: string }[] = [
    {
      value: 'Admin',
      title: 'Admin',
      desc: 'Institute-wide scheduling & policies',
    },
    {
      value: 'Department Coordinator',
      title: 'Dept Coordinator',
      desc: 'Curriculum & department venue review',
    },
    {
      value: 'Faculty',
      title: 'Faculty',
      desc: 'Teaching schedule & classroom needs',
    },
    {
      value: 'Club Representative',
      title: 'Club Representative',
      desc: 'Society event requests & room booking',
    },
  ];

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;

    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));

    // Clear error on change
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validateSignupForm(formData);

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    // Client-side demonstration only
    setIsSubmitting(true);
    setErrors({});

    setTimeout(() => {
      setIsSubmitting(false);
      setDemoSuccess(true);
      // Clean sensitive password fields
      setFormData((prev) => ({
        ...prev,
        password: '',
        confirmPassword: '',
      }));
    }, 750);
  };

  return (
    <div className="w-full max-w-xl mx-auto rounded-3xl bg-[#0B1220] border border-[#F4F7FB]/12 p-6 sm:p-10 shadow-2xl shadow-black/80">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#101A2B] border border-[#66E3F0]/20 mb-3 text-xs font-mono text-[#66E3F0]">
          <Shield className="w-3.5 h-3.5" />
          <span>FRONTEND DEMO ENROLLMENT</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F4F7FB] tracking-tight">
          Create your CIT Nexus account
        </h1>
        <p className="text-xs sm:text-sm text-[#98A6BB] mt-1.5">
          Join the centralized campus operations portal for Chilika Institute of Technology.
        </p>
      </div>

      {/* Success Modal / Banner */}
      {demoSuccess && (
        <div className="mb-6 p-5 rounded-2xl bg-[#10B981]/15 border border-[#10B981]/40 text-left animate-in fade-in duration-300">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-[#10B981] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-[#10B981]">
                Form Validated Successfully (Demo Mode)
              </h4>
              <p className="text-xs text-[#F4F7FB]/90 leading-relaxed">
                Your registration form passed all client-side constraint checks for the intended role{' '}
                <strong className="text-[#66E3F0]">{formData.role}</strong>.
              </p>
              <p className="text-[11px] font-mono text-[#98A6BB] pt-1">
                Notice: Account creation is not connected to a server. No credentials or identities have been stored.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setDemoSuccess(false)}
                  className="text-xs font-mono text-[#10B981] hover:underline"
                >
                  &larr; Return to form
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Registration Form */}
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* Full Name */}
        <div>
          <label
            htmlFor="fullName"
            className="block text-xs font-medium text-[#F4F7FB] mb-1.5 font-mono"
          >
            Full Name <span className="text-[#EF4444]">*</span>
          </label>
          <div className="relative">
            <User className="w-4 h-4 text-[#98A6BB] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="fullName"
              name="fullName"
              type="text"
              autoComplete="name"
              placeholder="e.g. Dr. Rajesh Mohanty / Aditi Rao"
              value={formData.fullName}
              onChange={handleChange}
              aria-invalid={!!errors.fullName}
              aria-describedby={errors.fullName ? 'fullName-error' : undefined}
              className={`w-full bg-[#101A2B] border rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#F4F7FB] placeholder-[#98A6BB]/50 transition-colors focus:outline-none ${
                errors.fullName
                  ? 'border-[#EF4444] focus:ring-1 focus:ring-[#EF4444]'
                  : 'border-[#F4F7FB]/12 focus:border-[#66E3F0]'
              }`}
            />
          </div>
          {errors.fullName && (
            <p id="fullName-error" className="mt-1 text-xs text-[#EF4444] flex items-center gap-1 font-mono">
              <AlertCircle className="w-3 h-3" />
              <span>{errors.fullName}</span>
            </p>
          )}
        </div>

        {/* Institutional Email */}
        <div>
          <label
            htmlFor="email"
            className="block text-xs font-medium text-[#F4F7FB] mb-1.5 font-mono"
          >
            Institutional Email <span className="text-[#EF4444]">*</span>
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-[#98A6BB] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="name@cit.edu.in"
              value={formData.email}
              onChange={handleChange}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
              className={`w-full bg-[#101A2B] border rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#F4F7FB] placeholder-[#98A6BB]/50 transition-colors focus:outline-none ${
                errors.email
                  ? 'border-[#EF4444] focus:ring-1 focus:ring-[#EF4444]'
                  : 'border-[#F4F7FB]/12 focus:border-[#66E3F0]'
              }`}
            />
          </div>
          {errors.email && (
            <p id="email-error" className="mt-1 text-xs text-[#EF4444] flex items-center gap-1 font-mono">
              <AlertCircle className="w-3 h-3" />
              <span>{errors.email}</span>
            </p>
          )}
        </div>

        {/* Intended Role Selection */}
        <div>
          <label className="block text-xs font-medium text-[#F4F7FB] mb-1.5 font-mono">
            Intended Campus Role <span className="text-[#EF4444]">*</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {roles.map((r) => {
              const isSelected = formData.role === r.value;
              return (
                <button
                  type="button"
                  key={r.value}
                  onClick={() => {
                    setFormData((prev) => ({ ...prev, role: r.value }));
                    if (errors.role) setErrors((prev) => ({ ...prev, role: undefined }));
                  }}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'bg-[#101A2B] border-[#66E3F0] ring-1 ring-[#66E3F0]/40'
                      : 'bg-[#070A12]/80 border-[#F4F7FB]/10 hover:border-[#F4F7FB]/25'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-[#F4F7FB]">
                      {r.title}
                    </span>
                    <span
                      className={`w-2 h-2 rounded-full ${
                        isSelected ? 'bg-[#66E3F0]' : 'bg-transparent border border-white/20'
                      }`}
                    />
                  </div>
                  <div className="text-[10px] text-[#98A6BB] line-clamp-1">
                    {r.desc}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-[#98A6BB]/80 font-mono">
            Note: Role choice is illustrative; it does not grant permissions in this demonstrator.
          </p>
        </div>

        {/* Password */}
        <div>
          <label
            htmlFor="password"
            className="block text-xs font-medium text-[#F4F7FB] mb-1.5 font-mono"
          >
            Password <span className="text-[#EF4444]">*</span>
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-[#98A6BB] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Minimum 8 characters"
              value={formData.password}
              onChange={handleChange}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              className={`w-full bg-[#101A2B] border rounded-xl pl-10 pr-10 py-2.5 text-xs text-[#F4F7FB] placeholder-[#98A6BB]/50 transition-colors focus:outline-none ${
                errors.password
                  ? 'border-[#EF4444] focus:ring-1 focus:ring-[#EF4444]'
                  : 'border-[#F4F7FB]/12 focus:border-[#66E3F0]'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#98A6BB] hover:text-[#F4F7FB]"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && (
            <p id="password-error" className="mt-1 text-xs text-[#EF4444] flex items-center gap-1 font-mono">
              <AlertCircle className="w-3 h-3" />
              <span>{errors.password}</span>
            </p>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <label
            htmlFor="confirmPassword"
            className="block text-xs font-medium text-[#F4F7FB] mb-1.5 font-mono"
          >
            Confirm Password <span className="text-[#EF4444]">*</span>
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-[#98A6BB] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="confirmPassword"
              name="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Re-enter password"
              value={formData.confirmPassword}
              onChange={handleChange}
              aria-invalid={!!errors.confirmPassword}
              aria-describedby={errors.confirmPassword ? 'confirmPassword-error' : undefined}
              className={`w-full bg-[#101A2B] border rounded-xl pl-10 pr-10 py-2.5 text-xs text-[#F4F7FB] placeholder-[#98A6BB]/50 transition-colors focus:outline-none ${
                errors.confirmPassword
                  ? 'border-[#EF4444] focus:ring-1 focus:ring-[#EF4444]'
                  : 'border-[#F4F7FB]/12 focus:border-[#66E3F0]'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#98A6BB] hover:text-[#F4F7FB]"
            >
              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.confirmPassword && (
            <p id="confirmPassword-error" className="mt-1 text-xs text-[#EF4444] flex items-center gap-1 font-mono">
              <AlertCircle className="w-3 h-3" />
              <span>{errors.confirmPassword}</span>
            </p>
          )}
        </div>

        {/* Terms Checkbox */}
        <div>
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              id="agreedToTerms"
              name="agreedToTerms"
              type="checkbox"
              checked={formData.agreedToTerms}
              onChange={handleChange}
              className="mt-0.5 rounded border-[#F4F7FB]/20 bg-[#101A2B] text-[#66E3F0] focus:ring-[#66E3F0]"
            />
            <span className="text-xs text-[#98A6BB] leading-relaxed">
              I acknowledge that this is a frontend prototype demonstration for Chilika Institute of Technology. No data is stored.
            </span>
          </label>
          {errors.agreedToTerms && (
            <p className="mt-1 text-xs text-[#EF4444] flex items-center gap-1 font-mono">
              <AlertCircle className="w-3 h-3" />
              <span>{errors.agreedToTerms}</span>
            </p>
          )}
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full py-3.5 rounded-xl font-bold text-xs text-[#070A12] bg-[#66E3F0] hover:bg-[#7ff0fc] disabled:opacity-60 transition-all flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(102,227,240,0.4)]"
        >
          {isSubmitting ? (
            <span className="font-mono">Validating Client Inputs...</span>
          ) : (
            <>
              <span>Validate & Create Account (Demo)</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Switch to Login Link */}
      <div className="mt-8 pt-6 border-t border-[#F4F7FB]/08 text-center text-xs text-[#98A6BB]">
        Already have an institutional profile?{' '}
        <Link href="/login" className="text-[#66E3F0] hover:underline font-semibold font-mono">
          Log in here
        </Link>
      </div>
    </div>
  );
};
