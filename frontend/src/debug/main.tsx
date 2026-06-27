import React from 'react';
import ReactDOM from 'react-dom/client';
import DebugApp from './DebugApp';
import '../index.css';

ReactDOM.createRoot(document.getElementById('debug-root')!).render(
  <React.StrictMode>
    <DebugApp />
  </React.StrictMode>
);
