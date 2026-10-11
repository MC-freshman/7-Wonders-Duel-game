import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Entry from './ui/Entry';
import './ui/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Entry />
  </StrictMode>,
);
