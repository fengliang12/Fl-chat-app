# TeacherCertificationV2 合约技术文档

## 📋 目录

- [概述](#概述)
- [安全改进](#安全改进)
- [架构设计](#架构设计)
- [核心功能](#核心功能)
- [使用指南](#使用指南)
- [Gas 优化](#gas-优化)
- [安全审计清单](#安全审计清单)

---

## 📖 概述

**TeacherCertificationV2** 是一个专业级的老师认证智能合约，通过质押 YD Token 实现去中心化的教师身份认证系统。

### 主要特性

✅ **安全性**
- ReentrancyGuard 防重入攻击
- Pausable 紧急暂停机制
- AccessControl 多角色权限管理
- CEI 模式（Checks-Effects-Interactions）

✅ **完整功能**
- 认证申请与质押
- 认证续期
- 自主撤销（扣除惩罚）
- 信息更新
- 黑名单管理

✅ **灵活治理**
- 可调整质押金额
- 可调整认证有效期
- 可调整惩罚比例
- 多签管理（可扩展）

✅ **Gas 优化**
- 使用 immutable
- 紧凑的数据结构
- 哈希存储字符串
- SafeERC20 安全转账

---

## 🔒 安全改进

### 对比原合约的安全改进

| 问题 | 原合约 | V2 改进 |
|------|--------|---------|
| 重入攻击 | ❌ 无保护 | ✅ ReentrancyGuard |
| 状态更新顺序 | ❌ 错误（Interaction before Effect） | ✅ CEI 模式 |
| 权限管理 | ❌ 单一 owner | ✅ 多角色 AccessControl |
| 紧急暂停 | ❌ 无 | ✅ Pausable |
| 代币转账 | ❌ 不安全 | ✅ SafeERC20 |
| owner 权力 | ❌ 过大（可随意退款） | ✅ 受限（需合理理由） |
| 认证生命周期 | ❌ 永久有效 | ✅ 可设置过期 |
| 撤销机制 | ❌ 无 | ✅ 自主撤销 + 惩罚 |

### CEI 模式示例

```solidity
// ❌ 原合约（错误）
function certifyAsTeacher() {
    YDToken.transferFrom(...);  // Interaction
    teachers[msg.sender] = ...; // Effect
}

// ✅ V2 合约（正确）
function certifyAsTeacher() {
    // Checks
    require(conditions);
    
    // Effects
    teachers[msg.sender] = ...;
    isCertified[msg.sender] = true;
    
    // Interactions
    ydToken.safeTransferFrom(...);
}
```

---

## 🏗️ 架构设计

### 角色权限体系

```
DEFAULT_ADMIN_ROLE (超级管理员)
├── ADMIN_ROLE (管理员)
│   ├── 更新质押金额
│   ├── 更新有效期
│   ├── 更新惩罚比例
│   ├── 强制撤销认证
│   ├── 更新黑名单
│   ├── 暂停/恢复合约
│   └── 提取惩罚金
│
└── OPERATOR_ROLE (操作员)
    ├── 暂停老师认证
    └── 恢复老师认证
```

### 认证状态机

```
       certifyAsTeacher()
None ──────────────────────> Active
                                │
                                │ renewCertification()
                                ├─────────────────────┐
                                │                     │
                                ↓                     ↓
           suspendTeacher()   Suspended          (续期)
           ────────────────>    │
                                │ reactivateTeacher()
                                └────────────────> Active
                                
                                
Active ──> revokeMyCertification() ──> Revoked
       └─> forceRevokeTeacher() ────> Revoked
       └─> (时间到期) ─────────────> Expired
```

### 数据结构

```solidity
struct TeacherInfo {
    uint64 certifyTime;         // 认证时间（8字节）
    uint64 expiryTime;          // 过期时间（8字节）
    uint256 stakedAmount;       // 质押金额（32字节）
    bytes32 emailHash;          // 邮箱哈希（32字节）
    bytes32 categoryHash;       // 分类哈希（32字节）
    bytes32 credentialsHash;    // 资质哈希（32字节）
    CertificationStatus status; // 状态（1字节）
}
// 总计: 145 字节
```

---

## ⚙️ 核心功能

### 1. 认证申请

```solidity
function certifyAsTeacher(
    string calldata _email,
    string calldata _category,
    string calldata _credentials
) external
```

**流程**:
1. 检查用户未认证、未被黑名单
2. 验证邮箱未被占用
3. 计算过期时间
4. 更新状态（Effect）
5. 转移质押代币（Interaction）

**Gas 消耗**: ~150,000 - 200,000 (首次认证)

### 2. 认证续期

```solidity
function renewCertification() external
```

**适用场景**:
- 认证即将过期
- 认证已过期但想恢复

**Gas 消耗**: ~50,000 - 80,000

### 3. 撤销认证

```solidity
function revokeMyCertification() external
```

**退款计算**:
```
退款金额 = 质押金额 × (1 - 惩罚比例)
默认: 500 YD × (1 - 10%) = 450 YD
```

### 4. 更新信息

```solidity
function updateTeacherInfo(
    string calldata _newEmail,
    string calldata _newCategory,
    string calldata _newCredentials
) external
```

**特点**:
- 不需要重新质押
- 可更新邮箱、分类、资质

---

## 📚 使用指南

### 部署合约

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入 YD_TOKEN_ADDRESS 等

# 3. 编译合约
npx hardhat compile

# 4. 运行测试
npx hardhat test

# 5. 部署到测试网
npx hardhat run scripts/deploy.js --network sepolia

# 6. 验证合约
npx hardhat verify --network sepolia <合约地址> <YD_TOKEN地址>
```

### 前端集成示例

```typescript
import { ethers } from 'ethers';
import CertificationABI from './abis/TeacherCertificationV2.json';

// 初始化合约
const provider = new ethers.providers.Web3Provider(window.ethereum);
const signer = provider.getSigner();
const contract = new ethers.Contract(
    CERTIFICATION_ADDRESS,
    CertificationABI,
    signer
);

// 1. 授权代币
const ydToken = new ethers.Contract(YD_TOKEN_ADDRESS, ERC20_ABI, signer);
await ydToken.approve(CERTIFICATION_ADDRESS, ethers.parseEther("500"));

// 2. 申请认证
const tx = await contract.certifyAsTeacher(
    "teacher@example.com",
    "Mathematics",
    "PhD in Math, 10 years experience"
);
await tx.wait();

// 3. 查询认证信息
const info = await contract.getTeacherInfo(teacherAddress);
console.log("认证时间:", new Date(info.certifyTime * 1000));
console.log("过期时间:", new Date(info.expiryTime * 1000));
console.log("质押金额:", ethers.formatEther(info.stakedAmount));
console.log("状态:", info.status);

// 4. 检查是否有效
const isActive = await contract.isActiveCertification(teacherAddress);
```

### 管理员操作

```typescript
// 暂停合约
await contract.pause();

// 暂停某个老师
await contract.suspendTeacher(teacherAddress, "违规原因");

// 更新质押金额
await contract.updateStakeAmount(ethers.parseEther("1000"));

// 添加到黑名单
await contract.updateBlacklist(maliciousAddress, true);
```

---

## ⚡ Gas 优化

### 优化技巧

1. **使用 immutable**
```solidity
IERC20 public immutable ydToken; // 节省 ~2100 gas/读取
```

2. **紧凑的时间戳**
```solidity
uint64 certifyTime;  // 而不是 uint256，节省 24 字节
```

3. **哈希存储字符串**
```solidity
bytes32 emailHash;   // 而不是 string，节省大量存储
```

4. **批量状态更新**
```solidity
// 在一个函数中完成多个状态更新
teachers[msg.sender] = TeacherInfo({...});
isCertified[msg.sender] = true;
emailToAddress[emailHash] = msg.sender;
```

### Gas 消耗估算

| 操作 | Gas 消耗 | 成本 (20 Gwei) |
|------|----------|----------------|
| 首次认证 | ~200,000 | ~$0.80 |
| 续期 | ~80,000 | ~$0.32 |
| 撤销 | ~100,000 | ~$0.40 |
| 更新信息 | ~70,000 | ~$0.28 |
| 查询信息 | ~5,000 | ~$0.02 |

---

## 🔍 安全审计清单

### 已实现的安全措施

- ✅ **重入攻击防护**: ReentrancyGuard
- ✅ **整数溢出防护**: Solidity 0.8.x 内置
- ✅ **紧急暂停**: Pausable
- ✅ **权限控制**: AccessControl
- ✅ **安全转账**: SafeERC20
- ✅ **CEI 模式**: Checks-Effects-Interactions
- ✅ **输入验证**: require 检查
- ✅ **事件日志**: 完整的事件记录

### 需要额外考虑的点

⚠️ **升级性**
- 当前合约不可升级
- 如需升级，考虑使用代理模式

⚠️ **治理**
- 建议使用多签钱包作为 DEFAULT_ADMIN_ROLE
- 考虑实现时间锁（Timelock）

⚠️ **经济模型**
- 质押代币的使用（质押挖矿、回购等）
- 惩罚金的分配机制

⚠️ **前端安全**
- 验证交易参数
- 处理交易失败
- 防止前端攻击

---

## 📊 对比总结

| 指标 | 原合约 | V2 合约 |
|------|--------|---------|
| 安全性 | 4/10 | 9/10 |
| 功能完整性 | 5/10 | 9/10 |
| Gas 优化 | 8/10 | 8/10 |
| 代码质量 | 7/10 | 9/10 |
| 可维护性 | 6/10 | 9/10 |
| 可扩展性 | 5/10 | 8/10 |
| **总体评分** | **5.8/10** | **8.7/10** |

---

## 🚀 未来改进方向

1. **代理升级模式**
   - 使用 UUPS 或 Transparent Proxy
   - 实现合约版本管理

2. **链下数据存储**
   - 使用 IPFS 存储详细信息
   - 链上只存储哈希

3. **NFT 证书**
   - 认证成功后铸造 NFT
   - NFT 可展示和转让

4. **质押收益**
   - 质押代币可获得收益
   - 实现质押挖矿

5. **治理投票**
   - 参数调整需社区投票
   - 实现 DAO 治理

6. **多链部署**
   - 支持跨链认证
   - 使用桥接协议

---

## 📞 联系方式

- 文档版本: v2.0
- 最后更新: 2025-10-23
- 合约版本: Solidity 0.8.19

如有问题，请提交 Issue 或 PR。
