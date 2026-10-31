import { z } from 'zod';
import { UserRole } from './db/models/user.model';

export type { UserRole };

// 1. Password Strength Criteria: Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special character
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(100, 'Password must not exceed 100 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter (A-Z)')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter (a-z)')
  .regex(/[0-9]/, 'Password must contain at least one digit (0-9)')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character (!@#$%^&*...)');

// 2. Signup Schema
export const signupSchema = z
  .object({
    fullName: z
      .string()
      .min(2, 'Full name must be at least 2 characters')
      .max(80, 'Full name cannot exceed 80 characters'),
    email: z
      .string()
      .email('Please enter a valid email address')
      .toLowerCase()
      .trim(),
    role: z.enum(
      ['Admin', 'Department Coordinator', 'Faculty', 'Club Representative'],
      { message: 'Please select a valid institutional role' }
    ),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    agreedToTerms: z
      .boolean()
      .refine((val) => val === true, 'You must acknowledge the platform terms'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type SignupFormData = z.infer<typeof signupSchema>;

// 3. Login Schema
export const loginSchema = z.object({
  email: z
    .string()
    .email('Please enter a valid email address')
    .toLowerCase()
    .trim(),
  password: z.string().min(1, 'Password is required'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

// 4. Verify OTP Schema
export const verifyOtpSchema = z.object({
  email: z.string().email('Valid email is required').toLowerCase().trim(),
  otp: z
    .string()
    .length(6, 'Verification code must be exactly 6 digits')
    .regex(/^\d{6}$/, 'Verification code must contain only numbers'),
});

export type VerifyOtpData = z.infer<typeof verifyOtpSchema>;

// 5. Resend OTP Schema
export const resendOtpSchema = z.object({
  email: z.string().email('Valid email is required').toLowerCase().trim(),
});

export type ResendOtpData = z.infer<typeof resendOtpSchema>;

export interface ValidationErrors {
  [key: string]: string | undefined;
}

export function validateSignupForm(data: SignupFormData): ValidationErrors {
  const result = signupSchema.safeParse(data);
  if (result.success) return {};

  const errors: ValidationErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0]?.toString() || 'form';
    if (!errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors;
}

export function validateLoginForm(data: LoginFormData): ValidationErrors {
  const result = loginSchema.safeParse(data);
  if (result.success) return {};

  const errors: ValidationErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0]?.toString() || 'form';
    if (!errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors;
}
