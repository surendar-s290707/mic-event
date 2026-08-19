import { Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Landing } from './routes/Landing';
import { Login } from './routes/Login';
import { NotFound } from './routes/NotFound';

export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
