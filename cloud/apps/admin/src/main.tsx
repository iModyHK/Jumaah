import { createRoot } from 'react-dom/client';
import './index.css';
import '@jumaah/ui/fonts.css';
import '@jumaah/ui/base.css';
import { AdminApp } from '@jumaah/admin';
import { cloudAdminExtensions } from '@jumaah/cloud-admin';

createRoot(document.getElementById('root')!).render(<AdminApp extensions={cloudAdminExtensions} />);
