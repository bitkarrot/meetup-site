import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ScrollToTop } from "./components/ScrollToTop";

import Index from "./pages/Index";
import { NIP19Page } from "./pages/NIP19Page";
import NotFound from "./pages/NotFound";

// Admin pages
import AdminWrapper from "./pages/admin/AdminWrapper";
import AdminPage from "./pages/admin/AdminPage";
import AdminBlogPage from "./pages/admin/AdminBlogPage";
import AdminEventsPage from "./pages/admin/AdminEventsPage";
import AdminSettingsPage from "./pages/admin/AdminSettingsPage";
import AdminLoginPage from "./pages/admin/AdminLoginPage";

// Public pages
import EventsPage from "./pages/EventsPage";
import EventPage from "./pages/EventPage";
import BlogPage from "./pages/BlogPage";
import BlogPostPage from "./pages/BlogPostPage";

function AdminRoutes() {
  return <AdminWrapper />;
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Index />} />
        {/* Public routes */}
        <Route path="/events" element={<EventsPage />} />
        <Route path="/event/:eventId" element={<EventPage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/blog/:postId" element={<BlogPostPage />} />
        {/* Admin routes */}
        <Route path="/admin" element={<AdminRoutes />}>
          <Route index element={<AdminPage />} />
          <Route path="blog" element={<AdminBlogPage />} />
          <Route path="events" element={<AdminEventsPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
        </Route>
        <Route path="/admin/login" element={<AdminLoginPage />} />
        {/* NIP-19 route for npub1, note1, naddr1, nevent1, nprofile1 */}
        <Route path="/:nip19" element={<NIP19Page />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
export default AppRouter;