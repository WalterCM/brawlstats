import React from 'react';

const AlertModal = ({ isOpen, type, title, message, onClose }) => {
  if (!isOpen) return null;

  const iconMap = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: 'ℹ'
  };

  const colorMap = {
    success: '#2ed573',
    error: '#ff4757',
    info: '#1e90ff',
    warning: '#ff9800'
  };

  const bgMap = {
    success: 'rgba(46, 213, 115, 0.15)',
    error: 'rgba(255, 71, 87, 0.15)',
    info: 'rgba(30, 144, 255, 0.15)',
    warning: 'rgba(255, 152, 0, 0.15)'
  };

  const displayType = type || 'info';
  const icon = iconMap[displayType] || 'ℹ';
  const color = colorMap[displayType] || '#1e90ff';
  const bg = bgMap[displayType] || 'rgba(30, 144, 255, 0.15)';

  return (
    <div
      className="modal-backdrop"
      style={{ animation: 'fadeIn 0.25s ease-out', zIndex: 1000 }}
      onClick={onClose}
    >
      <div
        className="modal-content glass-panel"
        style={{
          maxWidth: '400px',
          textAlign: 'center',
          padding: '30px 24px',
          animation: 'slideUp 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
          background: 'rgba(20, 20, 30, 0.95)',
          border: '1px solid var(--border-glass)',
          borderRadius: '16px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.6)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <div
            style={{
              width: '60px',
              height: '60px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              background: bg,
              border: `2px solid ${color}`,
              color: color
            }}
          >
            {icon}
          </div>
          <h2 style={{ margin: 0, fontSize: '20px', color: '#fff', borderBottom: 'none', paddingBottom: 0 }}>
            {title}
          </h2>
          <p style={{ margin: 0, fontSize: '14px', color: 'rgba(255,255,255,0.7)', lineHeight: '1.5' }}>
            {message}
          </p>
          <button
            className="btn btn-primary"
            style={{
              marginTop: '10px',
              padding: '10px 30px',
              borderRadius: '24px',
              fontWeight: 600,
              fontSize: '14px',
              letterSpacing: '0.5px',
              width: 'auto'
            }}
            onClick={onClose}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlertModal;
