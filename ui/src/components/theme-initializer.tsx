'use client';
import { useEffect } from 'react';
import {useLocale} from 'next-intl';
const storageKey = 'geocite-theme';
export function ThemeInitializer() { const locale = useLocale(); useEffect(() => { const theme = window.localStorage.getItem(storageKey) === 'light' ? 'light' : 'dark'; document.documentElement.lang = locale; document.documentElement.classList.toggle('dark', theme === 'dark'); document.documentElement.style.colorScheme = theme; }, [locale]); return null; }
