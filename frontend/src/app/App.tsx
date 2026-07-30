import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { CurrencyProvider } from "@/lib/currency";
import { Shell } from "@/app/Shell";
import { Spinner } from "@/components/ui/misc";
import { LoginPage } from "@/features/auth/LoginPage";
import { ShaxmatkaPage } from "@/features/shaxmatka/ShaxmatkaPage";
import { StructurePage } from "@/features/structure/StructurePage";
import { PlanirovkaPage } from "@/features/structure/PlanirovkaPage";
import { ShowroomPage } from "@/features/showroom/ShowroomPage";
import { CrmPage } from "@/features/crm/CrmPage";
import { CrmSettingsPage } from "@/features/crm/CrmSettingsPage";
import { DealsPage } from "@/features/deals/DealsPage";
import { SalesSettingsPage } from "@/features/sales/SalesSettingsPage";
import { ContactsPage } from "@/features/contacts/ContactsPage";
import { AccountingPage } from "@/features/accounting/AccountingPage";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { ClientsPage } from "@/features/clients/ClientsPage";
import { UsersPage } from "@/features/settings/UsersPage";
import { CurrencyPage } from "@/features/settings/CurrencyPage";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { me, loading } = useAuth();
  if (loading)
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  if (!me) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <CurrencyProvider>
              <Shell />
            </CurrencyProvider>
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/showroom" replace />} />
        <Route path="obyektlar" element={<StructurePage />} />
        <Route path="planirovkalar" element={<PlanirovkaPage />} />
        <Route path="showroom" element={<ShowroomPage />} />
        <Route path="shaxmatka" element={<ShaxmatkaPage />} />
        <Route path="crm" element={<CrmPage />} />
        <Route path="crm/settings" element={<CrmSettingsPage />} />
        <Route path="accounting" element={<AccountingPage />} />
        <Route path="deals" element={<DealsPage />} />
        <Route path="sales/settings" element={<SalesSettingsPage />} />
        <Route path="kontaktlar" element={<ContactsPage />} />
        <Route path="clients" element={<ClientsPage />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="settings/users" element={<UsersPage />} />
        <Route path="settings/currency" element={<CurrencyPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
