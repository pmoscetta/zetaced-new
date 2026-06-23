import type { Metadata } from "next";
import type { ReactNode } from "react";

import "leaflet/dist/leaflet.css";
import "react-datepicker/dist/react-datepicker.css";

import "./globals.css";

export const metadata: Metadata = {
  title: "Zetaced Monitoring",
  description: "Environmental monitoring platform for multi-tenant clients.",
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          fontFamily: "Arial, sans-serif",
          backgroundColor: "#09111f",
          color: "#f8fafc",
        }}
      >
        {children}
      </body>
    </html>
  );
}
