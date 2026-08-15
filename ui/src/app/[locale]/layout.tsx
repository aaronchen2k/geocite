import type {ReactNode} from 'react';
import {hasLocale, NextIntlClientProvider} from 'next-intl';
import {getMessages, setRequestLocale} from 'next-intl/server';
import {notFound} from 'next/navigation';
import {ThemeInitializer} from '@/components/theme-initializer';
import {ToastProvider} from '@/components/ui/toast';
import {routing} from '@/i18n/routing';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({locale}));
}

export default async function LocaleLayout({children, params}: Readonly<{children: ReactNode; params: Promise<{locale: string}>}>) {
  const {locale} = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  return <NextIntlClientProvider messages={messages}><ToastProvider><ThemeInitializer />{children}</ToastProvider></NextIntlClientProvider>;
}
