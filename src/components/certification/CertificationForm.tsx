import React, { useState, useEffect } from 'react';
import { certificationService } from '../../services/certificationService';
import './CertificationForm.css';

interface FormData {
  email: string;
  category: string;
  credentials: string;
}

export const CertificationForm: React.FC = () => {
  const [formData, setFormData] = useState<FormData>({
    email: '',
    category: '',
    credentials: '',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [step, setStep] = useState<'connect' | 'check' | 'approve' | 'certify'>('connect');
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [balanceInfo, setBalanceInfo] = useState<any>(null);

  useEffect(() => {
    checkWalletConnection();
  }, []);

  const checkWalletConnection = async () => {
    try {
      const address = await certificationService.getConnectedAddress();
      if (address) {
        setWalletAddress(address);
        setStep('check');
        await checkBalance(address);
      }
    } catch (err) {
      console.log('钱包未连接');
    }
  };

  const connectWallet = async () => {
    setLoading(true);
    setError(null);

    try {
      const address = await certificationService.connectWallet();
      setWalletAddress(address);
      setSuccess('钱包连接成功！');
      setStep('check');
      await checkBalance(address);
    } catch (err: any) {
      setError(err.message || '连接钱包失败');
    } finally {
      setLoading(false);
    }
  };

  const checkBalance = async (address: string) => {
    try {
      const info = await certificationService.checkBalanceAndAllowance(address);
      setBalanceInfo(info);

      if (!info.hasEnoughBalance) {
        setError(`余额不足！需要 ${info.requiredAmount} YD Token`);
        return;
      }

      if (!info.hasEnoughAllowance) {
        setStep('approve');
      } else {
        setStep('certify');
      }
    } catch (err: any) {
      setError('检查余额失败: ' + err.message);
    }
  };

  const handleApprove = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const txHash = await certificationService.approveToken();
      setSuccess(`授权成功！交易哈希: ${txHash.substring(0, 10)}...`);
      setStep('certify');

      if (walletAddress) {
        await checkBalance(walletAddress);
      }
    } catch (err: any) {
      setError('授权失败: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.email || !formData.category) {
      setError('请填写必填项');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await certificationService.certifyAsTeacher(
        formData.email,
        formData.category,
        formData.credentials
      );

      setSuccess(`认证成功！交易哈希: ${result.txHash.substring(0, 10)}...`);

      // 提交到后端（可选）
      await submitToBackend(result.txHash);

      // 清空表单
      setFormData({ email: '', category: '', credentials: '' });
    } catch (err: any) {
      setError('认证失败: ' + (err.reason || err.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  const submitToBackend = async (txHash: string) => {
    try {
      const response = await fetch('/api/certifications/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txHash,
          address: walletAddress,
          email: formData.email,
          category: formData.category,
        }),
      });

      if (!response.ok) {
        console.warn('后端提交失败');
      }
    } catch (err) {
      console.warn('后端提交失败:', err);
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case 'connect':
        return (
          <div className="step-content">
            <h3>🔌 连接钱包</h3>
            <p>请先连接您的钱包以继续</p>
            <button onClick={connectWallet} disabled={loading} className="btn-primary">
              {loading ? '连接中...' : '连接 MetaMask'}
            </button>
          </div>
        );

      case 'check':
        return (
          <div className="step-content">
            <h3>⏳ 检查余额...</h3>
            {balanceInfo && (
              <div className="balance-info">
                <p>💰 YD Token 余额: <strong>{balanceInfo.balance}</strong></p>
                <p>✅ 已授权额度: <strong>{balanceInfo.allowance}</strong></p>
                <p>🔒 需要质押: <strong>{balanceInfo.requiredAmount} YD</strong></p>
              </div>
            )}
          </div>
        );

      case 'approve':
        return (
          <div className="step-content">
            <h3>✅ 授权代币</h3>
            <p>⚠️ 请先授权合约使用您的 YD Token</p>
            {balanceInfo && (
              <div className="balance-info">
                <p>当前余额: {balanceInfo.balance} YD</p>
                <p>需要授权: {balanceInfo.requiredAmount} YD</p>
              </div>
            )}
            <button onClick={handleApprove} disabled={loading} className="btn-primary">
              {loading ? '授权中...' : '授权 YD Token'}
            </button>
          </div>
        );

      case 'certify':
        return (
          <form onSubmit={handleSubmit} className="certification-form">
            <h3>📝 填写认证信息</h3>

            {balanceInfo && (
              <div className="balance-summary">
                <p>✅ 余额充足，授权已完成</p>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="email">
                邮箱 <span className="required">*</span>
              </label>
              <input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="your@example.com"
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label htmlFor="category">
                教学分类 <span className="required">*</span>
              </label>
              <select
                id="category"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                required
                disabled={loading}
              >
                <option value="">请选择分类</option>
                <option value="Math">数学</option>
                <option value="Science">科学</option>
                <option value="English">英语</option>
                <option value="Programming">编程</option>
                <option value="Art">艺术</option>
                <option value="Music">音乐</option>
                <option value="Sports">体育</option>
                <option value="Other">其他</option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="credentials">资质证明（可选）</label>
              <textarea
                id="credentials"
                value={formData.credentials}
                onChange={(e) => setFormData({ ...formData, credentials: e.target.value })}
                placeholder="例如：博士学位、10年教学经验、国际认证等"
                rows={4}
                disabled={loading}
              />
              <small>此信息将以哈希形式存储在链上</small>
            </div>

            <button type="submit" disabled={loading} className="btn-primary btn-large">
              {loading ? '提交中...' : '🚀 提交认证申请'}
            </button>
          </form>
        );

      default:
        return null;
    }
  };

  return (
    <div className="certification-form-container">
      <div className="form-header">
        <h2>👨‍🏫 老师认证申请</h2>
        <p className="subtitle">通过质押 YD Token 获得认证资格</p>
        {walletAddress && (
          <div className="wallet-info">
            <span className="wallet-label">钱包地址:</span>
            <span className="wallet-address">
              {walletAddress.substring(0, 6)}...{walletAddress.substring(38)}
            </span>
          </div>
        )}
      </div>

      <div className="step-indicator">
        <div className={`step ${step === 'connect' ? 'active' : 'completed'}`}>
          1. 连接钱包
        </div>
        <div className={`step ${step === 'approve' ? 'active' : step === 'certify' ? 'completed' : ''}`}>
          2. 授权代币
        </div>
        <div className={`step ${step === 'certify' ? 'active' : ''}`}>
          3. 提交认证
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <span className="alert-icon">❌</span>
          {error}
        </div>
      )}

      {success && (
        <div className="alert alert-success">
          <span className="alert-icon">✅</span>
          {success}
        </div>
      )}

      <div className="form-content">{renderStepContent()}</div>

      <div className="form-footer">
        <p className="info-text">
          💡 提示：认证需要质押 500 YD Token，撤销时扣除 10% 作为惩罚
        </p>
      </div>
    </div>
  );
};
