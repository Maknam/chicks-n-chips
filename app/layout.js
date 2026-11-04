import "./globals.css";
import "./system.css";
import Install from "../components/install";

export const viewport = {
  themeColor: "#17130f",
  width: "device-width",
  initialScale: 1,
  // Lets the app use the full screen on notched phones; CSS pads with safe-area insets.
  viewportFit: "cover",
};

export const metadata = {
  title: "Chics & Chips | Pent Hall",
  description: "Skip the queue. Order ahead from Chics & Chips at Pent Hall.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/apple-touch-icon.png", sizes: "180x180" },
  },
  formatDetection: { telephone: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Chics & Chips",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Install />
      </body>
    </html>
  );
}
