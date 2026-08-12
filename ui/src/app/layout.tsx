import type {ReactNode} from 'react';
import './globals.css';

export default function RootLayout({children}: Readonly<{children: ReactNode}>) {
  return <html lang="zh" className="dark" suppressHydrationWarning><body>{children}</body></html>;
}
