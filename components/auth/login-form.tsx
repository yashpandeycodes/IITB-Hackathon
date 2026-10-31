'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Info,
} from 'lucide-react';
import { LoginFormData, ValidationErrors, validateLoginForm } from '@/lib/validation';

export const LoginForm: React.FC = () => {
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
  });

  const [errors, setErrors] = useState<ValidationErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [demoNotice, setDemoNotice] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validateLoginForm(formData);

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);
    setErrors({});

    // Demo response: clear password, show demo status
    setTimeout(() => {
      setIsSubmitting(false);
      setDemoNotice(true);
      setFormData((prev) => ({ ...prev, password: '' }));
    }, 600);
  };

  return (
    <div className="w-full max-w-md mx-auto rounded-3xl bg-[#0B1220] border border-[#F4F7FB]/12 p-6 sm:p-10 shadow-2xl shadow-black/80">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#101A2B] border border-[#66E3F0]/20 mb-3 text-xs font-mono text-[#66E3F0]">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>AUTHENTICATION PROTOCOL (DEMO)</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F4F7FB] tracking-tight">
          CIT Nexus Portal Login
        </h1>
        <p className="text-xs sm:text-sm text-[#98A6BB] mt-1.5">
          Sign in with your verified Chilika Institute institutional identity.
        </p>
      </div>

      {/* Demo Information Notice */}
      {demoNotice && (
        <div className="mb-6 p-4 rounded-2xl bg-[#66E3F0]/10 border border-[#66E3F0]/30 text-left animate-in fade-in duration-300">
          <div className="flex items-start gap-2.5">
            <Info className="w-4 h-4 text-[#66E3F0] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-[#66E3F0]">
                Client-Side Validation Passed
              </h4>
              <p className="text-xs text-[#F4F7FB]/85 leading-relaxed">
                Authentication services are not connected in this frontend demonstrator. No session or token was created, and credentials were not sent to a server.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {/* Email */}
        <div>
          <label
            htmlFor="login-email"
            className="block text-xs font-medium text-[#F4F7FB] mb-1.5 font-mono"
          >
            Institutional Email <span className="text-[#EF4444]">*</span>
          </label>
          <div className="relative">
            <Mail className="w-4 h-4 text-[#98A6BB] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="faculty@cit.edu.in"
              value={formData.email}
              onChange={handleChange}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'login-email-error' : undefined}
              className={`w-full bg-[#101A2B] border rounded-xl pl-10 pr-4 py-2.5 text-xs text-[#F4F7FB] placeholder-[#98A6BB]/50 transition-colors focus:outline-none ${
                errors.email
                  ? 'border-[#EF4444] focus:ring-1 focus:ring-[#EF4444]'
                  : 'border-[#F4F7FB]/12 focus:border-[#66E3F0]'
              }`}
            />
          </div>
          {errors.email && (
            <p id="login-email-error" className="mt-1 text-xs text-[#EF4444] flex items-center gap-1 font-mono">
              <AlertCircle className="w-3 h-3" />
              <span>{errors.email}</span>
            </p>
          )}
        </div>

        {/* Password */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label
              htmlFor="login-password"
              className="block text-xs font-medium text-[#F4F7FB] font-mono"
            >
              Password <span className="text-[#EF4444]">*</span>
            </label>
            <span className="text-[11px] text-[#98A6BB]/70 font-mono">
              Demo sandbox
            </span>
          </div>
          <div className="relative">
            <Lock className="w-4 h-4 text-[#98A6BB] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              id="login-password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Enter password"
              value={formData.password}
              onChange={handleChange}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'login-password-error' : undefined}
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
            <p id="login-password-error" className="mt-1 text-xs text-[#EF4444] flex items-center gap-1 font-mono">
              <AlertCircle className="w-3 h-3" />
              <span>{errors.password}</span>
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
            <span className="font-mono">Verifying credentials...</span>
          ) : (
            <>
              <span>Validate & Sign In (Demo)</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Switch to Signup */}
      <div className="mt-8 pt-6 border-t border-[#F4F7FB]/08 text-center text-xs text-[#98A6BB]">
        Need a new campus account?{' '}
        <Link href="/signup" className="text-[#66E3F0] hover:underline font-semibold font-mono">
          Register here
        </Link>
      </div>
    </div>
  );
};

