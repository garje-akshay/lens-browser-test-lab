import './globals.css';
import ThemeRegistry from '../lib/ThemeRegistry';

export const metadata = {
  title: 'Lens by KnickLab — Multi-device browser preview',
  description: 'Test any URL across every device, instantly. A KnickLab product.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
