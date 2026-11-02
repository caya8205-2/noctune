import React from 'react';
import ReactDOM from 'react-dom/client';
import DebugApp from './DebugApp';
import '../index.css';

const rootEl = document.getElementById('debug-root')!;
rootEl.removeAttribute('style');
rootEl.className = 'h-screen w-screen overflow-hidden bg-base-950 text-white';

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <DebugApp />
  </React.StrictMode>
);
