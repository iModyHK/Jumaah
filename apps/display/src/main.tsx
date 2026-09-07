import { createRoot } from 'react-dom/client';
import './index.css';
import '@jumaah/ui/fonts.css';
import '@jumaah/ui/base.css';
import { DisplayApp } from './DisplayApp';

createRoot(document.getElementById('root')!).render(<DisplayApp />);
