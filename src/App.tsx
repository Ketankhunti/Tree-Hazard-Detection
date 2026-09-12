import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Dashboard } from "./pages/Dashboard";
import { DetailPage } from "./pages/DetailPage";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/complaint/:id" element={<DetailPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
