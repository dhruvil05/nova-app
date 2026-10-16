import WakeWord from '@modules/wake-word';
import { router, usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';

/**
 * Opens the voice screen when the wake-word service hears "Hey Nova" while Nova
 * is already on screen. (When Nova is in the background or the phone is locked,
 * the native service opens nova://voice?wake=1 itself.)
 */
export function WakeWordListener() {
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!WakeWord) return;
    const sub = WakeWord.addListener('onWake', () => {
      if (pathRef.current === '/voice') return;
      router.push({ pathname: '/voice', params: { wake: '1' } });
    });
    return () => sub.remove();
  }, []);

  return null;
}
