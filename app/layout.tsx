import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ServiceWorkerRegister } from '@/components/pwa/ServiceWorkerRegister';
import { AppBootstrap } from '@/components/AppBootstrap';

export const metadata: Metadata = {
  applicationName: 'Boletim de Câmera',
  title: {
    default: 'Boletim Diário de Câmera',
    template: '%s · Boletim de Câmera',
  },
  description:
    'PWA offline-first para criar, editar e exportar boletins diários de câmera em set audiovisual. 100% local, sem internet.',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Boletim de Câmera',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#08090b',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="min-h-dvh bg-ink text-zinc-200 antialiased">
        <AppBootstrap />
        <ServiceWorkerRegister />
        {children}
      </body>
    </html>
  );
}
