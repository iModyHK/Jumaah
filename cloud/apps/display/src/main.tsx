import { createRoot } from 'react-dom/client';
import './index.css';
import '@jumaah/ui/fonts.css';
import '@jumaah/ui/base.css';
import { DisplayApp } from '@jumaah/display';
import { cloudDisplayExtensions } from '@jumaah/cloud-display';

createRoot(document.getElementById('root')!).render(<DisplayApp extensions={cloudDisplayExtensions} />);
