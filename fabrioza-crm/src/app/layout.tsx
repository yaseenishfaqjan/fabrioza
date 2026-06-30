import type { ReactNode } from "react";

export const metadata = {
  title: "FABRIOZA CRM",
  description: "Internal lead-response CRM",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          background: "#f6f8f6",
          color: "#1d1f1e",
        }}
      >
        {children}
      </body>
    </html>
  );
}
