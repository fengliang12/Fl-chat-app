# 前端集成指南

## 📋 快速开始

本指南将帮助您将 TeacherCertificationV2 合约集成到前端 DApp 中。

---

## 🔧 安装依赖

```bash
npm install ethers wagmi viem
# 或
yarn add ethers wagmi viem
```

---

## 📝 合约 ABI

部署后，从 `artifacts/contracts/TeacherCertificationV2.sol/TeacherCertificationV2.json` 获取 ABI。

---

## 🎯 完整流程实现

### 1. 配置合约实例

```typescript
// src/config/contracts.ts
export const CONTRACTS = {
  certification: {
    address: '0x...', // 部署的合约地址
    abi: [...] // 合约 ABI
  },
  ydToken: {
    address: '0x...', // YD Token 地址
    abi: [...] // ERC20 ABI
  }
};

export const STAKE_AMOUNT = '500'; // 500 YD Token
```

### 2. React Hook: 认证管理

```typescript
// src/hooks/useTeacherCertification.ts
import { useState } from 'react';
import { ethers } from 'ethers';
import { useAccount, useContract, useSigner } from 'wagmi';
import { CONTRACTS, STAKE_AMOUNT } from '../config/contracts';

export function useTeacherCertification() {
  const { address } = useAccount();
  const { data: signer } = useSigner();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 初始化合约实例
  const certificationContract = useContract({
    address: CONTRACTS.certification.address,
    abi: CONTRACTS.certification.abi,
    signerOrProvider: signer,
  });

  const ydTokenContract = useContract({
    address: CONTRACTS.ydToken.address,
    abi: CONTRACTS.ydToken.abi,
    signerOrProvider: signer,
  });

  // 1. 检查余额和授权
  const checkBalanceAndAllowance = async () => {
    if (!address || !ydTokenContract) return null;

    try {
      const balance = await ydTokenContract.balanceOf(address);
      const allowance = await ydTokenContract.allowance(
        address,
        CONTRACTS.certification.address
      );

      return {
        balance: ethers.formatEther(balance),
        allowance: ethers.formatEther(allowance),
        hasEnoughBalance: balance >= ethers.parseEther(STAKE_AMOUNT),
        hasEnoughAllowance: allowance >= ethers.parseEther(STAKE_AMOUNT),
      };
    } catch (err) {
      console.error('检查余额失败:', err);
      return null;
    }
  };

  // 2. 授权代币
  const approveToken = async () => {
    if (!ydTokenContract) throw new Error('合约未初始化');

    setLoading(true);
    setError(null);

    try {
      const tx = await ydTokenContract.approve(
        CONTRACTS.certification.address,
        ethers.parseEther(STAKE_AMOUNT)
      );

      await tx.wait();
      return tx.hash;
    } catch (err: any) {
      const errorMsg = err.reason || err.message || '授权失败';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // 3. 申请认证
  const certifyAsTeacher = async (
    email: string,
    category: string,
    credentials: string
  ) => {
    if (!certificationContract) throw new Error('合约未初始化');

    setLoading(true);
    setError(null);

    try {
      // 先检查余额和授权
      const check = await checkBalanceAndAllowance();
      if (!check?.hasEnoughBalance) {
        throw new Error('YD Token 余额不足');
      }
      if (!check?.hasEnoughAllowance) {
        throw new Error('请先授权代币');
      }

      // 提交认证
      const tx = await certificationContract.certifyAsTeacher(
        email,
        category,
        credentials
      );

      const receipt = await tx.wait();

      // 从事件中获取认证信息
      const event = receipt.events?.find(
        (e: any) => e.event === 'TeacherCertified'
      );

      return {
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        event: event?.args,
      };
    } catch (err: any) {
      const errorMsg = err.reason || err.message || '认证失败';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // 4. 查询认证信息
  const getTeacherInfo = async (teacherAddress?: string) => {
    if (!certificationContract) return null;
    const addr = teacherAddress || address;
    if (!addr) return null;

    try {
      const info = await certificationContract.getTeacherInfo(addr);

      return {
        certifyTime: new Date(Number(info.certifyTime) * 1000),
        expiryTime: new Date(Number(info.expiryTime) * 1000),
        stakedAmount: ethers.formatEther(info.stakedAmount),
        emailHash: info.emailHash,
        categoryHash: info.categoryHash,
        credentialsHash: info.credentialsHash,
        status: Number(info.status),
        isActive: info.isActive,
      };
    } catch (err) {
      console.error('查询认证信息失败:', err);
      return null;
    }
  };

  // 5. 检查是否有效认证
  const isActiveCertification = async (teacherAddress?: string) => {
    if (!certificationContract) return false;
    const addr = teacherAddress || address;
    if (!addr) return false;

    try {
      return await certificationContract.isActiveCertification(addr);
    } catch (err) {
      console.error('检查认证状态失败:', err);
      return false;
    }
  };

  // 6. 续期认证
  const renewCertification = async () => {
    if (!certificationContract) throw new Error('合约未初始化');

    setLoading(true);
    setError(null);

    try {
      const tx = await certificationContract.renewCertification();
      const receipt = await tx.wait();
      return receipt.transactionHash;
    } catch (err: any) {
      const errorMsg = err.reason || err.message || '续期失败';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // 7. 撤销认证
  const revokeCertification = async () => {
    if (!certificationContract) throw new Error('合约未初始化');

    setLoading(true);
    setError(null);

    try {
      // 先计算退款金额
      const [refund, penalty] = await certificationContract.calculateRevocationRefund(
        address
      );

      const tx = await certificationContract.revokeMyCertification();
      const receipt = await tx.wait();

      return {
        txHash: receipt.transactionHash,
        refundAmount: ethers.formatEther(refund),
        penaltyAmount: ethers.formatEther(penalty),
      };
    } catch (err: any) {
      const errorMsg = err.reason || err.message || '撤销失败';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // 8. 更新认证信息
  const updateTeacherInfo = async (
    newEmail: string,
    newCategory: string,
    newCredentials: string
  ) => {
    if (!certificationContract) throw new Error('合约未初始化');

    setLoading(true);
    setError(null);

    try {
      const tx = await certificationContract.updateTeacherInfo(
        newEmail,
        newCategory,
        newCredentials
      );

      const receipt = await tx.wait();
      return receipt.transactionHash;
    } catch (err: any) {
      const errorMsg = err.reason || err.message || '更新失败';
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    checkBalanceAndAllowance,
    approveToken,
    certifyAsTeacher,
    getTeacherInfo,
    isActiveCertification,
    renewCertification,
    revokeCertification,
    updateTeacherInfo,
  };
}
```

### 3. React 组件: 认证表单

```typescript
// src/components/TeacherCertificationForm.tsx
import React, { useState, useEffect } from 'react';
import { useTeacherCertification } from '../hooks/useTeacherCertification';
import { STAKE_AMOUNT } from '../config/contracts';

export function TeacherCertificationForm() {
  const {
    loading,
    error,
    checkBalanceAndAllowance,
    approveToken,
    certifyAsTeacher,
  } = useTeacherCertification();

  const [formData, setFormData] = useState({
    email: '',
    category: '',
    credentials: '',
  });

  const [balanceInfo, setBalanceInfo] = useState<any>(null);
  const [step, setStep] = useState<'check' | 'approve' | 'certify'>('check');

  useEffect(() => {
    loadBalanceInfo();
  }, []);

  const loadBalanceInfo = async () => {
    const info = await checkBalanceAndAllowance();
    setBalanceInfo(info);

    if (info) {
      if (!info.hasEnoughBalance) {
        alert(`余额不足！需要 ${STAKE_AMOUNT} YD Token`);
      } else if (!info.hasEnoughAllowance) {
        setStep('approve');
      } else {
        setStep('certify');
      }
    }
  };

  const handleApprove = async () => {
    try {
      await approveToken();
      alert('授权成功！');
      setStep('certify');
      await loadBalanceInfo();
    } catch (err) {
      console.error('授权失败:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.email || !formData.category) {
      alert('请填写必填项');
      return;
    }

    try {
      const result = await certifyAsTeacher(
        formData.email,
        formData.category,
        formData.credentials
      );

      alert(`认证成功！交易哈希: ${result.txHash}`);
      
      // 提交到后端
      await submitToBackend(result.txHash);
    } catch (err) {
      console.error('认证失败:', err);
    }
  };

  const submitToBackend = async (txHash: string) => {
    try {
      const response = await fetch('/api/certifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txHash,
          email: formData.email,
          category: formData.category,
        }),
      });

      if (!response.ok) throw new Error('后端提交失败');
      
      const data = await response.json();
      console.log('后端验证成功:', data);
    } catch (err) {
      console.error('后端提交失败:', err);
    }
  };

  return (
    <div className="certification-form">
      <h2>老师认证申请</h2>

      {balanceInfo && (
        <div className="balance-info">
          <p>YD Token 余额: {balanceInfo.balance}</p>
          <p>已授权额度: {balanceInfo.allowance}</p>
          <p>需要质押: {STAKE_AMOUNT} YD</p>
        </div>
      )}

      {step === 'approve' && (
        <div className="approve-step">
          <p>⚠️ 请先授权合约使用您的 YD Token</p>
          <button onClick={handleApprove} disabled={loading}>
            {loading ? '授权中...' : '授权代币'}
          </button>
        </div>
      )}

      {step === 'certify' && (
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>邮箱 *</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              required
            />
          </div>

          <div className="form-group">
            <label>教学分类 *</label>
            <select
              value={formData.category}
              onChange={(e) =>
                setFormData({ ...formData, category: e.target.value })
              }
              required
            >
              <option value="">请选择</option>
              <option value="Math">数学</option>
              <option value="Science">科学</option>
              <option value="English">英语</option>
              <option value="Programming">编程</option>
              <option value="Art">艺术</option>
            </select>
          </div>

          <div className="form-group">
            <label>资质证明（可选）</label>
            <textarea
              value={formData.credentials}
              onChange={(e) =>
                setFormData({ ...formData, credentials: e.target.value })
              }
              placeholder="例如：博士学位、10年教学经验等"
              rows={4}
            />
          </div>

          {error && <div className="error">{error}</div>}

          <button type="submit" disabled={loading}>
            {loading ? '认证中...' : '提交认证'}
          </button>
        </form>
      )}
    </div>
  );
}
```

### 4. 认证状态展示组件

```typescript
// src/components/TeacherCertificationStatus.tsx
import React, { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import { useTeacherCertification } from '../hooks/useTeacherCertification';

export function TeacherCertificationStatus() {
  const { address } = useAccount();
  const { getTeacherInfo, isActiveCertification } = useTeacherCertification();
  const [info, setInfo] = useState<any>(null);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (address) {
      loadCertificationInfo();
    }
  }, [address]);

  const loadCertificationInfo = async () => {
    const [teacherInfo, active] = await Promise.all([
      getTeacherInfo(),
      isActiveCertification(),
    ]);

    setInfo(teacherInfo);
    setIsActive(active);
  };

  if (!info) {
    return <div>未认证</div>;
  }

  const getStatusText = (status: number) => {
    const statusMap = ['未认证', '活跃', '已过期', '已撤销', '已暂停'];
    return statusMap[status] || '未知';
  };

  const getStatusColor = (status: number) => {
    const colorMap = ['gray', 'green', 'orange', 'red', 'yellow'];
    return colorMap[status] || 'gray';
  };

  return (
    <div className="certification-status">
      <h3>认证状态</h3>

      <div className="status-badge" style={{ backgroundColor: getStatusColor(info.status) }}>
        {getStatusText(info.status)}
        {isActive && ' ✓'}
      </div>

      <div className="info-grid">
        <div className="info-item">
          <label>认证时间</label>
          <span>{info.certifyTime.toLocaleDateString()}</span>
        </div>

        <div className="info-item">
          <label>过期时间</label>
          <span>
            {info.expiryTime.getFullYear() === 2106
              ? '永久有效'
              : info.expiryTime.toLocaleDateString()}
          </span>
        </div>

        <div className="info-item">
          <label>质押金额</label>
          <span>{info.stakedAmount} YD</span>
        </div>
      </div>

      {isActive && (
        <div className="actions">
          <button onClick={() => {/* 续期逻辑 */}}>
            续期认证
          </button>
          <button onClick={() => {/* 更新信息逻辑 */}}>
            更新信息
          </button>
          <button 
            onClick={() => {/* 撤销逻辑 */}}
            className="danger"
          >
            撤销认证
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## 🔄 完整认证流程

```typescript
// 完整的认证流程示例
async function completeCertificationFlow() {
  // 1. 连接钱包
  const { address, connector } = useAccount();
  
  if (!address) {
    await connector?.connect();
  }

  // 2. 检查余额和授权
  const balanceInfo = await checkBalanceAndAllowance();
  
  if (!balanceInfo?.hasEnoughBalance) {
    throw new Error('余额不足');
  }

  // 3. 授权代币（如果需要）
  if (!balanceInfo?.hasEnoughAllowance) {
    const approveTx = await approveToken();
    console.log('授权成功:', approveTx);
  }

  // 4. 提交认证
  const certifyResult = await certifyAsTeacher(
    'teacher@example.com',
    'Mathematics',
    'PhD, 10 years exp'
  );

  // 5. 提交到后端验证
  await fetch('/api/certifications/verify', {
    method: 'POST',
    body: JSON.stringify({
      txHash: certifyResult.txHash,
      address: address,
    }),
  });

  // 6. 显示成功消息
  alert('认证成功！');
}
```

---

## 🎨 样式示例

```css
/* src/styles/certification.css */
.certification-form {
  max-width: 600px;
  margin: 0 auto;
  padding: 2rem;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.balance-info {
  background: #f5f5f5;
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 1.5rem;
}

.form-group {
  margin-bottom: 1.5rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

button {
  background: #007bff;
  color: white;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}

button:hover {
  background: #0056b3;
}

button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

button.danger {
  background: #dc3545;
}

.error {
  color: #dc3545;
  margin-top: 0.5rem;
}

.status-badge {
  display: inline-block;
  padding: 0.5rem 1rem;
  border-radius: 20px;
  color: white;
  font-weight: 600;
  margin-bottom: 1rem;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin: 1rem 0;
}

.info-item label {
  display: block;
  font-size: 0.875rem;
  color: #666;
  margin-bottom: 0.25rem;
}

.info-item span {
  display: block;
  font-size: 1rem;
  font-weight: 600;
}
```

---

## 📱 移动端适配

```typescript
// 检测移动端钱包
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

if (isMobile) {
  // 使用 WalletConnect
  await connector?.connect({ chainId: 1 });
} else {
  // 使用 MetaMask
  await window.ethereum?.request({ method: 'eth_requestAccounts' });
}
```

---

## 🐛 错误处理

```typescript
try {
  await certifyAsTeacher(email, category, credentials);
} catch (error: any) {
  if (error.code === 4001) {
    alert('用户拒绝了交易');
  } else if (error.code === -32603) {
    alert('Gas 不足或交易失败');
  } else if (error.message?.includes('Email already registered')) {
    alert('该邮箱已被注册');
  } else if (error.message?.includes('Insufficient balance')) {
    alert('YD Token 余额不足');
  } else {
    alert('交易失败: ' + error.message);
  }
}
```

---

## ✅ 测试清单

- [ ] 连接钱包
- [ ] 检查余额
- [ ] 授权代币
- [ ] 提交认证
- [ ] 查询认证状态
- [ ] 续期认证
- [ ] 更新信息
- [ ] 撤销认证
- [ ] 错误处理
- [ ] 移动端适配

---

这个集成指南提供了完整的代码示例，可以直接用于前端项目！
