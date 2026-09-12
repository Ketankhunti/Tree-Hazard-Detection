import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { DetailPage } from "./pages/DetailPage";
import { SubmitComplaint } from "./pages/SubmitComplaint";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/complaint/:id" element={<DetailPage />} />
        <Route path="/report" element={<SubmitComplaint />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
