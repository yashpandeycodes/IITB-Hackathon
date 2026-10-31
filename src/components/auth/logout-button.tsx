'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

export const LogoutButton: React.FC = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
      router.refresh();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-white bg-[#220745] hover:bg-[#340d69] border border-[#a855f7]/40 hover:border-[#fbbf24] transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-[#c084fc]"
    >
      <LogOut className="w-4 h-4 text-[#f43f5e]" />
      <span>{loading ? 'Disconnecting...' : 'Sign Out'}</span>
    </button>
  );
};

