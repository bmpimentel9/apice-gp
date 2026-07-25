import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ÁPICE GP',
  description:
    'Fórmula 1 no seu iPhone, em pé. Volta rápida contra o seu fantasma e Grand Prix completo, com o regulamento 2026.',
  applicationName: 'ÁPICE GP',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'ÁPICE GP',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false, date: false, address: false, email: false },
  openGraph: {
    title: 'ÁPICE GP',
    description: 'Bate o meu tempo?',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // viewport-fit=cover é obrigatório: sem ele, env(safe-area-inset-*) resolve
  // para zero e o notch e o indicador de home cobrem o jogo.
  viewportFit: 'cover',
  themeColor: '#0A0E18',
  // Não bloqueamos o zoom: o Safari moderno ignora user-scalable=no por
  // acessibilidade, e insistir só quebraria o layout sem impedir o gesto.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        {/* A Apple ainda exige a meta prefixada para a tela de abertura */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body>{children}</body>
    </html>
  );
}
