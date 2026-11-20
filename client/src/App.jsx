import { Routes, Route, Navigate } from "react-router-dom";
import LoginPage from "./pages/LoginPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import CasesPage from "./pages/CasesPage.jsx";
import SubmitComplaintPage from "./pages/SubmitComplaintPage.jsx";
import EditComplaintPage from "./pages/EditComplaintPage.jsx";
import PrintComplaintPage from "./pages/PrintComplaintPage.jsx";
import CaseDetailPage from "./pages/CaseDetailPage.jsx";
import CommitteeAccountsPage from "./pages/CommitteeAccountsPage.jsx";
import CalendarPage from "./pages/CalendarPage.jsx";
import NotificationsPage from "./pages/NotificationsPage.jsx";
import SettingsPage from "./pages/SettingsPage.jsx";
import ReportsPage from "./pages/ReportsPage.jsx";
import AuditLogPage from "./pages/AuditLogPage.jsx";
import LoginAttemptsPage from "./pages/LoginAttemptsPage.jsx";
import RecordsPage from "./pages/RecordsPage.jsx";
import FaqEditorPage from "./pages/FaqEditorPage.jsx";
import PrintReportPage from "./pages/PrintReportPage.jsx";
import NotFoundPage from "./pages/NotFoundPage.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";

function Protected({ children }) {
  return <ProtectedRoute>{children}</ProtectedRoute>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Protected><DashboardPage /></Protected>} />
      <Route path="/cases" element={<Protected><CasesPage /></Protected>} />
      <Route path="/cases/:id" element={<Protected><CaseDetailPage /></Protected>} />
      <Route path="/cases/:id/edit" element={<Protected><EditComplaintPage /></Protected>} />
      <Route path="/cases/:id/print" element={<Protected><PrintComplaintPage /></Protected>} />
      <Route path="/complaints/new" element={<Protected><SubmitComplaintPage /></Protected>} />
      <Route path="/accounts" element={<Protected><CommitteeAccountsPage /></Protected>} />
      <Route path="/accounts/new" element={<Navigate to="/accounts" replace />} />
      <Route path="/reports" element={<Protected><ReportsPage /></Protected>} />
      <Route path="/reports/print" element={<Protected><PrintReportPage /></Protected>} />
      <Route path="/audit" element={<Protected><AuditLogPage /></Protected>} />
      <Route path="/login-attempts" element={<Protected><LoginAttemptsPage /></Protected>} />
      <Route path="/records" element={<Protected><RecordsPage /></Protected>} />
      <Route path="/faqs" element={<Protected><FaqEditorPage /></Protected>} />
      <Route path="/calendar" element={<Protected><CalendarPage /></Protected>} />
      <Route path="/notifications" element={<Protected><NotificationsPage /></Protected>} />
      <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
