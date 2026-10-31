/**
 * CIT Nexus - Frontend Validation Utilities
 * 
 * Strict client-side validation rules for the prototype.
 * NOTE: No credentials are submitted to any server or persisted anywhere.
 */

export type UserRole = 'Admin' | 'Department Coordinator' | 'Faculty' | 'Club Representative';

export interface SignupFormData {
  fullName: string;
  email: string;
  role: UserRole;
  password: string;
  confirmPassword: string;
  agreedToTerms: boolean;
}

export interface LoginFormData {
  email: string;
  password: string;
  rememberPreference?: boolean;
}

export interface ValidationErrors {
  [key: string]: string | undefined;
}

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) {
    return 'Institutional email is required.';
  }
  if (!EMAIL_REGEX.test(trimmed)) {
    return 'Please enter a valid email address (e.g. name@cit.edu.in).';
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) {
    return 'Password is required.';
  }
  if (password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password should include at least one letter and one number for prototype security.';
  }
  return null;
}

export function validateSignupForm(data: SignupFormData): ValidationErrors {
  const errors: ValidationErrors = {};

  if (!data.fullName.trim()) {
    errors.fullName = 'Full name is required.';
  } else if (data.fullName.trim().length < 2) {
    errors.fullName = 'Name must be at least 2 characters.';
  }

  const emailError = validateEmail(data.email);
  if (emailError) {
    errors.email = emailError;
  }

  if (!data.role) {
    errors.role = 'Please select your intended role.';
  }

  const passwordError = validatePassword(data.password);
  if (passwordError) {
    errors.password = passwordError;
  }

  if (!data.confirmPassword) {
    errors.confirmPassword = 'Confirmation password is required.';
  } else if (data.password !== data.confirmPassword) {
    errors.confirmPassword = 'Passwords do not match.';
  }

  if (!data.agreedToTerms) {
    errors.agreedToTerms = 'You must acknowledge the prototype terms of use.';
  }

  return errors;
}

export function validateLoginForm(data: LoginFormData): ValidationErrors {
  const errors: ValidationErrors = {};

  const emailError = validateEmail(data.email);
  if (emailError) {
    errors.email = emailError;
  }

  if (!data.password) {
    errors.password = 'Password is required.';
  } else if (data.password.length < 6) {
    errors.password = 'Password must be at least 6 characters.';
  }

  return errors;
}
