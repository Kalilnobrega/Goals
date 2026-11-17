import "../styles/globals.css";
import { LateGoalsProvider } from "../lib/LateGoalsContext";
import { ConfirmProvider } from "../components/ConfirmDialog";
import { ToastProvider } from "../components/Toast";
import AppNavbar from "../components/AppNavbar";
import RevealObserver from "../components/RevealObserver";
import { GoogleOAuthProvider } from "@react-oauth/google";

export const metadata = {
  title: "Goals — Gerencie suas metas",
  description: "Acompanhe suas metas e tarefas com clareza e foco.",
  applicationName: "Goals",
  manifest: "/goals.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Goals",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/goals-apple-180.png",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#dbeafe",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" data-scroll-behavior="smooth">
      <body>
        <div className="app-backdrop" aria-hidden="true" />
        <RevealObserver />
        <GoogleOAuthProvider clientId="513218395859-ptvh881sg8jl1lq9k7d86jkf9pauh4th.apps.googleusercontent.com">
          <LateGoalsProvider>
            <ToastProvider>
              <ConfirmProvider>
                <AppNavbar />
                {children}
              </ConfirmProvider>
            </ToastProvider>
          </LateGoalsProvider>
        </GoogleOAuthProvider>
      </body>
    </html>
  );
}
