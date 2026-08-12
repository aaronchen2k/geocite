import {redirect} from '@/i18n/navigation';

export default async function LocaleHome({params}: {params: Promise<{locale: 'zh' | 'en'}>}) {
  const {locale} = await params;
  redirect({href: '/dashboard', locale});
}
