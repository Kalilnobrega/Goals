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
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
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
