import React from 'react';
import { Database, Download, FileText, FolderOpen } from 'lucide-react';

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function SharedFilesView({ files, onSaveCopy, onOpenFolder, status }) {
  return (
    <div>
      <div className="view-header">
        <h2 className="view-header-title">Shared Files on This Node</h2>
        <p className="view-header-subtitle">Files received from peers and files stored locally. Each transfer is checked with SHA-256.</p>
      </div>

      <div className="section-box">
        <div className="section-box-header">
          <div className="section-title"><Database size={18} color="#f59e0b" /><span>{files.length} stored {files.length === 1 ? 'file' : 'files'}</span></div>
          <button className="btn-secondary" onClick={onOpenFolder}><FolderOpen size={14} /> Open Storage Folder</button>
        </div>
        {status && <div style={{ marginBottom: '12px', padding: '10px 12px', borderRadius: '7px', fontSize: '12px', background: status.type === 'error' ? 'rgba(239,68,68,.12)' : 'rgba(16,185,129,.12)', color: status.type === 'error' ? '#f87171' : '#34d399' }}>{status.text}</div>}
        {files.length === 0 ? (
          <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <FileText size={32} color="#64748b" style={{ marginBottom: '10px' }} />
            <div>No files stored on this node yet. Use Share a File to send one here or receive one from a peer.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {files.map(file => (
              <div key={file.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, 2fr) 1fr 1.3fr minmax(110px, auto)', gap: '12px', alignItems: 'center', padding: '12px 4px', borderTop: '1px solid var(--border-color)' }}>
                <div style={{ minWidth: 0 }}>
                  <div title={file.name} style={{ color: '#f1f5f9', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</div>
                  <div style={{ color: 'var(--text-dim)', fontSize: '11px', marginTop: '3px' }}>From {file.sourceNodeName || 'local node'}</div>
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{formatFileSize(file.size)}</span>
                <span title={file.sha256} style={{ color: '#10b981', fontSize: '11px', fontFamily: 'var(--font-mono)' }}>SHA-256 verified · {file.sha256.slice(0, 12)}…</span>
                <button className="btn-secondary" onClick={() => onSaveCopy(file.id)}><Download size={14} /> Save a Copy</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
