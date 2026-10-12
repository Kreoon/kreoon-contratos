import { createBrowserRouter } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { PublicLayout } from "./components/layout/PublicLayout";
import { Dashboard } from "./pages/Dashboard";
import { Templates } from "./pages/Templates";
import { TemplateImport } from "./pages/TemplateImport";
import { Contracts } from "./pages/Contracts";
import { ContractNew } from "./pages/ContractNew";
import { ContractDetail } from "./pages/ContractDetail";
import { Contacts_CRM } from "./pages/Contacts";
import { ContactNew } from "./pages/ContactNew";
import { ContactDetail } from "./pages/ContactDetail";
import { SignPage } from "./pages/SignPage";
import { SignComplete } from "./pages/SignComplete";
import { Login } from "./pages/Login";
import { ForgotPassword } from "./pages/ForgotPassword";
import { ResetPassword } from "./pages/ResetPassword";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <Login />,
  },
  {
    path: "/forgot-password",
    element: <ForgotPassword />,
  },
  {
    path: "/reset-password",
    element: <ResetPassword />,
  },
  // Rutas admin (protegidas)
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: "templates", element: <Templates /> },
      { path: "templates/import", element: <TemplateImport /> },
      { path: "templates/:id/edit", element: <TemplateImport /> },
      { path: "contracts", element: <Contracts /> },
      { path: "contracts/new", element: <ContractNew /> },
      { path: "contracts/:id", element: <ContractDetail /> },
      { path: "contacts", element: <Contacts_CRM /> },
      { path: "contacts/new", element: <ContactNew /> },
      { path: "contacts/:id", element: <ContactDetail /> },
    ],
  },
  // Rutas publicas (firma)
  {
    path: "/sign",
    element: <PublicLayout />,
    children: [
      { path: ":token", element: <SignPage /> },
      { path: ":token/complete", element: <SignComplete /> },
    ],
  },
]);
