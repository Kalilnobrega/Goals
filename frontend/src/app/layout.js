import "../styles/globals.css";
import { LateGoalsProvider } from "../lib/LateGoalsContext";

export const metadata = {
  title: "Goals — Gerencie suas metas",
  description: "Acompanhe suas metas e tarefas com clareza e foco.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>
        <LateGoalsProvider>{children}</LateGoalsProvider>
      </body>
    </html>
  );
}
