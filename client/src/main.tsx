import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppProvider } from './store/AppStore';
import { App } from './App';
import './styles/index.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root element is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
);
