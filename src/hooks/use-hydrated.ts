'use client';
import { useSyncExternalStore } from 'react';

// Sunucuda false; istemci bileşeni olay işleyicileriyle bağlandıktan sonra true.
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
export function useHydrated() {
  return useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
}
