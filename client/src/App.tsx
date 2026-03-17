import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { HomePage } from '@/pages/HomePage';
import { NewEntryPage } from '@/pages/NewEntryPage';
import { EntriesPage } from '@/pages/EntriesPage';
import { LedgersPage } from '@/pages/LedgersPage';
import { FeeRegisterPage } from '@/pages/FeeRegisterPage';
import { SalaryRegisterPage } from '@/pages/SalaryRegisterPage';
import { BankAccountsPage } from '@/pages/BankAccountsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { Spinner } from '@/components/ui/Spinner';
import { ToastContainer } from '@/components/ui/Toast';
import { SettingsProvider } from '@/context/SettingsContext';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  return user ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastContainer />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <SettingsProvider>
                <DashboardPage />
              </SettingsProvider>
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<HomePage />} />
          <Route path="new-entry" element={<NewEntryPage />} />
          <Route path="entries" element={<EntriesPage />} />
          <Route path="ledgers" element={<LedgersPage />} />
          <Route path="fee-register" element={<FeeRegisterPage />} />
          <Route path="salary-register" element={<SalaryRegisterPage />} />
          <Route path="bank-accounts" element={<BankAccountsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
