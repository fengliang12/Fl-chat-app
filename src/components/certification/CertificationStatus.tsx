import React, { useEffect, useState } from 'react';
import { certificationService, TeacherInfo, CertificationStatus as Status } from '../../services/certificationService';
import './CertificationStatus.css';

export const CertificationStatus: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<TeacherInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadCertificationInfo();
  }, []);

  const loadCertificationInfo = async () => {
    setLoading(true);
    setError(null);

    try {
      await certificationService.initialize();
      const certificationInfo = await certificationService.getTeacherInfo();
      setInfo(certificationInfo);
    } catch (err: any) {
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleRenew = async () => {
    if (!window.confirm('确定要续期认证吗？')) return;

    setActionLoading(true);
    try {
      const txHash = await certificationService.renewCertification();
      alert(`续期成功！交易哈希: ${txHash.substring(0, 10)}...`);
      await loadCertificationInfo();
    } catch (err: any) {
      alert('续期失败: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevoke = async () => {
    const refundInfo = await certificationService.calculateRevocationRefund();

    if (!window.confirm(
      `确定要撤销认证吗？\n\n退款: ${refundInfo.refundAmount} YD\n惩罚: ${refundInfo.penaltyAmount} YD`
    )) {
      return;
    }

    setActionLoading(true);
    try {
      const result = await certificationService.revokeCertification();
      alert(
        `撤销成功！\n交易哈希: ${result.txHash.substring(0, 10)}...\n退款: ${result.refundAmount} YD`
      );
      await loadCertificationInfo();
    } catch (err: any) {
      alert('撤销失败: ' + err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusText = (status: Status): string => {
    const statusMap = {
      [Status.None]: '未认证',
      [Status.Active]: '活跃',
      [Status.Expired]: '已过期',
      [Status.Revoked]: '已撤销',
      [Status.Suspended]: '已暂停',
    };
    return statusMap[status] || '未知';
  };

  const getStatusColor = (status: Status): string => {
    const colorMap = {
      [Status.None]: 'gray',
      [Status.Active]: 'green',
      [Status.Expired]: 'orange',
      [Status.Revoked]: 'red',
      [Status.Suspended]: 'yellow',
    };
    return colorMap[status] || 'gray';
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const isExpiringSoon = (expiryTime: Date): boolean => {
    const daysUntilExpiry = (expiryTime.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return daysUntilExpiry > 0 && daysUntilExpiry <= 30;
  };

  if (loading) {
    return (
      <div className="certification-status loading">
        <div className="spinner"></div>
        <p>加载认证信息...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="certification-status error">
        <p>❌ {error}</p>
        <button onClick={loadCertificationInfo}>重试</button>
      </div>
    );
  }

  if (!info || info.status === Status.None) {
    return (
      <div className="certification-status not-certified">
        <div className="empty-state">
          <span className="empty-icon">👤</span>
          <h3>尚未认证</h3>
          <p>您还没有进行老师认证</p>
          <button onClick={() => window.location.href = '/certify'} className="btn-primary">
            立即认证
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="certification-status">
      <div className="status-header">
        <h2>认证状态</h2>
        <span className={`status-badge status-${getStatusColor(info.status)}`}>
          {getStatusText(info.status)} {info.isActive && '✓'}
        </span>
      </div>

      <div className="info-grid">
        <div className="info-card">
          <div className="info-label">认证时间</div>
          <div className="info-value">{formatDate(info.certifyTime)}</div>
        </div>

        <div className="info-card">
          <div className="info-label">过期时间</div>
          <div className="info-value">
            {info.expiryTime.getFullYear() === 2106
              ? '永久有效 ∞'
              : formatDate(info.expiryTime)}
          </div>
          {isExpiringSoon(info.expiryTime) && (
            <div className="warning-badge">⚠️ 即将过期</div>
          )}
        </div>

        <div className="info-card">
          <div className="info-label">质押金额</div>
          <div className="info-value">{info.stakedAmount} YD</div>
        </div>

        <div className="info-card">
          <div className="info-label">状态</div>
          <div className="info-value">
            {info.isActive ? (
              <span className="active-indicator">🟢 正常</span>
            ) : (
              <span className="inactive-indicator">🔴 未激活</span>
            )}
          </div>
        </div>
      </div>

      <div className="info-details">
        <div className="detail-row">
          <span className="detail-label">邮箱哈希:</span>
          <span className="detail-value hash">{info.emailHash}</span>
        </div>
        <div className="detail-row">
          <span className="detail-label">分类哈希:</span>
          <span className="detail-value hash">{info.categoryHash}</span>
        </div>
        {info.credentialsHash !== '0x0000000000000000000000000000000000000000000000000000000000000000' && (
          <div className="detail-row">
            <span className="detail-label">资质哈希:</span>
            <span className="detail-value hash">{info.credentialsHash}</span>
          </div>
        )}
      </div>

      {info.isActive && (
        <div className="action-buttons">
          <button
            onClick={handleRenew}
            disabled={actionLoading}
            className="btn-secondary"
          >
            {actionLoading ? '处理中...' : '🔄 续期认证'}
          </button>

          <button
            onClick={() => window.location.href = '/update-info'}
            disabled={actionLoading}
            className="btn-secondary"
          >
            ✏️ 更新信息
          </button>

          <button
            onClick={handleRevoke}
            disabled={actionLoading}
            className="btn-danger"
          >
            {actionLoading ? '处理中...' : '🗑️ 撤销认证'}
          </button>
        </div>
      )}

      {isExpiringSoon(info.expiryTime) && info.isActive && (
        <div className="alert alert-warning">
          <span className="alert-icon">⚠️</span>
          您的认证即将过期，请及时续期！
        </div>
      )}
    </div>
  );
};
