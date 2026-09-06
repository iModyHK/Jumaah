import { Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth, RequireRole, RequireTenant } from './auth/RequireAuth';
import { Shell } from './layout/Shell';
import { LoginPage } from './pages/LoginPage';
import { InvitePage } from './pages/InvitePage';
import { DashboardPage } from './pages/DashboardPage';
import { KhutbahsPage } from './pages/KhutbahsPage';
import { KhutbahNewPage } from './pages/KhutbahNewPage';
import { KhutbahEditorPage } from './pages/KhutbahEditorPage';
import { HandoutPage } from './pages/HandoutPage';
import { OrganisationPage } from './pages/OrganisationPage';
import { OrganisationsPage } from './pages/OrganisationsPage';
import { ApiPage } from './pages/ApiPage';
import { ForgotPasswordPage, ResetPasswordPage } from './pages/ForgotPasswordPage';
import { GlossaryPage } from './pages/GlossaryPage';
import { ProvidersPage } from './pages/ProvidersPage';
import { DisplaysPage } from './pages/DisplaysPage';
import { UsersPage } from './pages/UsersPage';
import { SettingsPage } from './pages/SettingsPage';
import { AuditPage } from './pages/AuditPage';
import { BackupsPage } from './pages/BackupsPage';
import { SyncPage } from './pages/SyncPage';
import { LibraryPage } from './pages/LibraryPage';
import { TenantsPage } from './pages/TenantsPage';
import { PlatformPage } from './pages/PlatformPage';
import { NotFoundPage } from './pages/NotFoundPage';

const ADMIN = ['SUPER_ADMIN', 'MOSQUE_ADMIN'] as const;

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route path="/forgot" element={<ForgotPasswordPage />} />
      <Route path="/reset/:token" element={<ResetPasswordPage />} />
      <Route
        path="/khutbahs/:id/handout"
        element={
          <RequireAuth>
            <RequireTenant>
              <HandoutPage />
            </RequireTenant>
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="khutbahs" element={<RequireTenant><KhutbahsPage /></RequireTenant>} />
        <Route path="khutbahs/new" element={<RequireTenant><KhutbahNewPage /></RequireTenant>} />
        <Route path="khutbahs/:id" element={<RequireTenant><KhutbahEditorPage /></RequireTenant>} />
        <Route path="glossary" element={<RequireTenant><GlossaryPage /></RequireTenant>} />
        <Route path="providers" element={<RequireRole roles={[...ADMIN]}><RequireTenant><ProvidersPage /></RequireTenant></RequireRole>} />
        <Route path="displays" element={<RequireTenant><DisplaysPage /></RequireTenant>} />
        <Route path="users" element={<RequireRole roles={[...ADMIN]}><RequireTenant><UsersPage /></RequireTenant></RequireRole>} />
        <Route path="settings" element={<RequireRole roles={[...ADMIN]}><RequireTenant><SettingsPage /></RequireTenant></RequireRole>} />
        <Route path="audit" element={<RequireRole roles={[...ADMIN]}><AuditPage /></RequireRole>} />
        <Route path="backups" element={<RequireRole roles={[...ADMIN]}><RequireTenant><BackupsPage /></RequireTenant></RequireRole>} />
        <Route path="sync" element={<RequireRole roles={[...ADMIN]}><RequireTenant><SyncPage /></RequireTenant></RequireRole>} />
        <Route path="library" element={<LibraryPage />} />
        <Route path="organisation" element={<OrganisationPage />} />
        <Route path="api" element={<RequireRole roles={[...ADMIN]}><RequireTenant><ApiPage /></RequireTenant></RequireRole>} />
        <Route path="organisations" element={<RequireRole roles={['SUPER_ADMIN']}><OrganisationsPage /></RequireRole>} />
        <Route path="tenants" element={<RequireRole roles={['SUPER_ADMIN']}><TenantsPage /></RequireRole>} />
        <Route path="platform" element={<RequireRole roles={['SUPER_ADMIN']}><PlatformPage /></RequireRole>} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
