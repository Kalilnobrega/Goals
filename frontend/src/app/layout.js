import "../styles/globals.css";
import { LateGoalsProvider } from "../lib/LateGoalsContext";
import { GoogleOAuthProvider } from "@react-oauth/google";

export const metadata = {
  title: "Goals — Gerencie suas metas",
  description: "Acompanhe suas metas e tarefas com clareza e foco.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <GoogleOAuthProvider clientId="513218395859-ptvh881sg8jl1lq9k7d86jkf9pauh4th.apps.googleusercontent.com">
          <LateGoalsProvider>{children}</LateGoalsProvider>
        </GoogleOAuthProvider>
      </body>
    </html>
  );
}
