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
import AdminFeedPage from "./pages/admin/AdminFeedPage";
import AdminPagesPage from "./pages/admin/AdminPagesPage";
import AdminSettingsPage from "./pages/admin/AdminSettingsPage";
import AdminSystemSettingsPage from "./pages/admin/AdminSystemSettingsPage";
import AdminLoginPage from "./pages/admin/AdminLoginPage";

// Public pages
import EventsPage from "./pages/EventsPage";
import EventPage from "./pages/EventPage";
import BlogPage from "./pages/BlogPage";
import BlogPostPage from "./pages/BlogPostPage";
import FeedPage from "./pages/FeedPage";
import StaticPage from "./pages/StaticPage";

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
        <Route path="/feed" element={<FeedPage />} />
        {/* NIP-19 route for npub1, note1, naddr1, nevent1, nprofile1 */}
        <Route
          path="/:nip19(npub1[a-z0-9]+|nprofile1[a-z0-9]+|note1[a-z0-9]+|nevent1[a-z0-9]+|naddr1[a-z0-9]+)"
          element={<NIP19Page />}
        />
        {/* Static pages (about, contact, etc.) */}
        <Route path="/about" element={<StaticPage pathOverride="/about" />} />
        <Route path="/contact" element={<StaticPage pathOverride="/contact" />} />
        <Route path="/p/:path" element={<StaticPage />} />
        
        {/* Admin routes */}
        <Route path="/admin" element={<AdminRoutes />}>
          <Route index element={<AdminPage />} />
          <Route path="blog" element={<AdminBlogPage />} />
          <Route path="events" element={<AdminEventsPage />} />
          <Route path="feed" element={<AdminFeedPage />} />
          <Route path="pages" element={<AdminPagesPage />} />
          <Route path="settings" element={<AdminSettingsPage />} />
          <Route path="system-settings" element={<AdminSystemSettingsPage />} />
        </Route>
        <Route path="/admin/login" element={<AdminLoginPage />} />

        {/* Dynamic Static Pages (catch-all for routes not matched above) */}
        <Route path="/:path" element={<StaticPage />} />

        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
export default AppRouter;