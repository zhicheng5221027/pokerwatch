import { Routes, Route } from "react-router-dom";
import IndexPage from "./pages/Index";
import SessionsPage from "./pages/Sessions";
import SessionDetailPage from "./pages/SessionDetail";
import NotFoundPage from "./pages/NotFound";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<IndexPage />} />
      <Route path="/sessions" element={<SessionsPage />} />
      <Route path="/sessions/:id" element={<SessionDetailPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
