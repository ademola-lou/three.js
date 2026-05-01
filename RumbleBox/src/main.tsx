import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Experience } from './core/Experience';
import { Hud } from './ui/Hud';
import './styles.css';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

createRoot(root).render(
  <StrictMode>
    <Experience />
    <Hud />
  </StrictMode>,
);
