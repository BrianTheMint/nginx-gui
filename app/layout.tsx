import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'nginx-gui',
  description: 'Browser-based nginx config manager',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
