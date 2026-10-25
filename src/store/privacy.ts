import { create } from 'zustand';

import { authenticate } from '@/services/auth';
import { showMessage } from '@/utils/dialog';

type PrivacyState = {
  /** True after a successful unlock; reset whenever the app goes to the background. */
  unlocked: boolean;
  /** Asks for fingerprint/PIN if needed. Resolves true when private notes may be shown. */
  unlock: (reason?: string) => Promise<boolean>;
  lock: () => void;
};

export const usePrivacy = create<PrivacyState>((set, get) => ({
  unlocked: false,

  async unlock(reason = 'Unlock private notes') {
    if (get().unlocked) return true;
    const result = await authenticate(reason);
    if (result.ok) {
      set({ unlocked: true });
      return true;
    }
    if (result.reason !== 'cancelled') showMessage('Private notes', result.message);
    return false;
  },

  lock() {
    set({ unlocked: false });
  },
}));
