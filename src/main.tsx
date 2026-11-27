import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import './games/games.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element missing');

createRoot(container).render(<App />);
