'use client';
import { MoonStar, SunMedium } from 'lucide-react'; import { useEffect, useState } from 'react';
import {useTranslations} from 'next-intl';
const storageKey = 'geocite-theme'; type Theme = 'light' | 'dark';
function applyTheme(theme: Theme) { document.documentElement.classList.toggle('dark', theme === 'dark'); document.documentElement.style.colorScheme = theme; window.localStorage.setItem(storageKey, theme); }
export function ThemeToggle() { const t=useTranslations('Shell'); const [theme,setTheme]=useState<Theme>('dark'); useEffect(()=>{ const initial=window.localStorage.getItem(storageKey)==='light'?'light':'dark'; setTheme(initial); applyTheme(initial); },[]); const next=theme==='dark'?'light':'dark'; return <button type="button" className="grid size-9 place-items-center rounded-md border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]" aria-label={theme==='dark'?t('themeLight'):t('themeDark')} aria-pressed={theme==='dark'} onClick={()=>{setTheme(next);applyTheme(next);}}>{theme==='dark'?<SunMedium size={17}/>:<MoonStar size={17}/>}</button>; }
