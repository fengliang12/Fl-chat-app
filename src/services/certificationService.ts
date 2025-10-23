/**
 * 老师认证服务
 * 封装与 TeacherCertificationV2 合约的交互逻辑
 */

import { ethers } from 'ethers';

// 合约配置（从环境变量或配置文件读取）
const CERTIFICATION_CONTRACT_ADDRESS = process.env.REACT_APP_CERTIFICATION_ADDRESS || '';
const YD_TOKEN_ADDRESS = process.env.REACT_APP_YD_TOKEN_ADDRESS || '';
const STAKE_AMOUNT = '500'; // 500 YD Token

// ERC20 ABI（简化版，只包含需要的方法）
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
];

// 认证合约 ABI（需要从编译后的 artifacts 获取完整版）
const CERTIFICATION_ABI = [
  'function certifyAsTeacher(string memory _email, string memory _category, string memory _credentials) external',
  'function renewCertification() external',
  'function revokeMyCertification() external',
  'function updateTeacherInfo(string memory _newEmail, string memory _newCategory, string memory _newCredentials) external',
  'function getTeacherInfo(address teacher) view returns (uint64 certifyTime, uint64 expiryTime, uint256 stakedAmount, bytes32 emailHash, bytes32 categoryHash, bytes32 credentialsHash, uint8 status, bool isActive)',
  'function isActiveCertification(address teacher) view returns (bool)',
  'function verifyTeacherInfo(address teacher, string memory email, string memory category) view returns (bool)',
  'function calculateRevocationRefund(address teacher) view returns (uint256 refundAmount, uint256 penaltyAmount)',
  'function isCertified(address) view returns (bool)',
  'function getContractStats() view returns (uint256 totalTeachers, uint256 totalStaked, uint256 totalPenalty, uint256 stakeAmount, uint256 validityPeriod)',
  'event TeacherCertified(address indexed teacher, bytes32 emailHash, bytes32 categoryHash, uint256 stakedAmount, uint64 expiryTime, uint256 timestamp)',
  'event CertificationRevoked(address indexed teacher, uint256 refundAmount, uint256 penaltyAmount, uint256 timestamp)',
];

export interface TeacherInfo {
  certifyTime: Date;
  expiryTime: Date;
  stakedAmount: string;
  emailHash: string;
  categoryHash: string;
  credentialsHash: string;
  status: CertificationStatus;
  isActive: boolean;
}

export enum CertificationStatus {
  None = 0,
  Active = 1,
  Expired = 2,
  Revoked = 3,
  Suspended = 4,
}

export class CertificationService {
  private provider: ethers.BrowserProvider | null = null;
  private signer: ethers.Signer | null = null;
  private certificationContract: ethers.Contract | null = null;
  private ydTokenContract: ethers.Contract | null = null;

  /**
   * 初始化服务
   */
  async initialize() {
    if (!window.ethereum) {
      throw new Error('请安装 MetaMask 钱包');
    }

    this.provider = new ethers.BrowserProvider(window.ethereum);
    this.signer = await this.provider.getSigner();

    this.certificationContract = new ethers.Contract(
      CERTIFICATION_CONTRACT_ADDRESS,
      CERTIFICATION_ABI,
      this.signer
    );

    this.ydTokenContract = new ethers.Contract(
      YD_TOKEN_ADDRESS,
      ERC20_ABI,
      this.signer
    );
  }

  /**
   * 连接钱包
   */
  async connectWallet(): Promise<string> {
    if (!window.ethereum) {
      throw new Error('请安装 MetaMask 钱包');
    }

    const accounts = await window.ethereum.request({
      method: 'eth_requestAccounts',
    });

    await this.initialize();

    return accounts[0];
  }

  /**
   * 获取当前连接的地址
   */
  async getConnectedAddress(): Promise<string | null> {
    if (!this.signer) return null;
    return await this.signer.getAddress();
  }

  /**
   * 检查余额和授权
   */
  async checkBalanceAndAllowance(address: string) {
    if (!this.ydTokenContract || !this.certificationContract) {
      throw new Error('服务未初始化');
    }

    const [balance, allowance] = await Promise.all([
      this.ydTokenContract.balanceOf(address),
      this.ydTokenContract.allowance(address, CERTIFICATION_CONTRACT_ADDRESS),
    ]);

    const stakeAmountWei = ethers.parseEther(STAKE_AMOUNT);

    return {
      balance: ethers.formatEther(balance),
      allowance: ethers.formatEther(allowance),
      hasEnoughBalance: balance >= stakeAmountWei,
      hasEnoughAllowance: allowance >= stakeAmountWei,
      requiredAmount: STAKE_AMOUNT,
    };
  }

  /**
   * 授权代币
   */
  async approveToken(amount?: string): Promise<string> {
    if (!this.ydTokenContract) {
      throw new Error('服务未初始化');
    }

    const approveAmount = amount
      ? ethers.parseEther(amount)
      : ethers.parseEther(STAKE_AMOUNT);

    const tx = await this.ydTokenContract.approve(
      CERTIFICATION_CONTRACT_ADDRESS,
      approveAmount
    );

    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * 申请认证
   */
  async certifyAsTeacher(
    email: string,
    category: string,
    credentials: string = ''
  ): Promise<{
    txHash: string;
    blockNumber: number;
    event?: any;
  }> {
    if (!this.certificationContract) {
      throw new Error('服务未初始化');
    }

    // 验证输入
    if (!email || !category) {
      throw new Error('邮箱和分类为必填项');
    }

    const tx = await this.certificationContract.certifyAsTeacher(
      email,
      category,
      credentials
    );

    const receipt = await tx.wait();

    // 解析事件
    const event = receipt.logs
      .map((log: any) => {
        try {
          return this.certificationContract!.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed: any) => parsed && parsed.name === 'TeacherCertified');

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      event: event?.args,
    };
  }

  /**
   * 获取老师认证信息
   */
  async getTeacherInfo(address?: string): Promise<TeacherInfo | null> {
    if (!this.certificationContract) {
      throw new Error('服务未初始化');
    }

    const teacherAddress = address || (await this.getConnectedAddress());
    if (!teacherAddress) {
      throw new Error('未连接钱包');
    }

    try {
      const info = await this.certificationContract.getTeacherInfo(teacherAddress);

      return {
        certifyTime: new Date(Number(info.certifyTime) * 1000),
        expiryTime: new Date(Number(info.expiryTime) * 1000),
        stakedAmount: ethers.formatEther(info.stakedAmount),
        emailHash: info.emailHash,
        categoryHash: info.categoryHash,
        credentialsHash: info.credentialsHash,
        status: Number(info.status) as CertificationStatus,
        isActive: info.isActive,
      };
    } catch (error) {
      console.error('获取认证信息失败:', error);
      return null;
    }
  }

  /**
   * 检查是否有有效认证
   */
  async isActiveCertification(address?: string): Promise<boolean> {
    if (!this.certificationContract) {
      throw new Error('服务未初始化');
    }

    const teacherAddress = address || (await this.getConnectedAddress());
    if (!teacherAddress) return false;

    try {
      return await this.certificationContract.isActiveCertification(teacherAddress);
    } catch (error) {
      console.error('检查认证状态失败:', error);
      return false;
    }
  }

  /**
   * 验证老师信息
   */
  async verifyTeacherInfo(
    address: string,
    email: string,
    category: string
  ): Promise<boolean> {
    if (!this.certificationContract) {
      throw new Error('服务未初始化');
    }

    return await this.certificationContract.verifyTeacherInfo(
      address,
      email,
      category
    );
  }

  /**
   * 续期认证
   */
  async renewCertification(): Promise<string> {
    if (!this.certificationContract) {
      throw new Error('服务未初始化');
    }

    const tx = await this.certificationContract.renewCertification();
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * 撤销认证
   */
  async revokeCertification(): Promise<{
    txHash: string;
    refundAmount: string;
    penaltyAmount: string;
  }> {
    if (!this.certificationContract) {
      throw new Error('服务未初始化');
    }

    const address = await this.getConnectedAddress();
    if (!address) {
      throw new Error('未连接钱包');
    }

    // 先计算退款金额
    const [refund, penalty] =
      await this.certificationContract.calculateRevocationRefund(address);

    const tx = await this.certificationContract.revokeMyCertification();
    const receipt = await tx.wait();

    return {
      txHash: receipt.hash,
      refundAmount: ethers.formatEther(refund),
      penaltyAmount: ethers.formatEther(penalty),
    };
  }

  /**
   * 更新认证信息
   */
  async updateTeacherInfo(
    newEmail: string,
    newCategory: string,
    newCredentials: string = ''
  ): Promise<string> {
    if (!this.certificationContract) {
      throw new Error('服务未初始化');
    }

    if (!newEmail || !newCategory) {
      throw new Error('邮箱和分类为必填项');
    }

    const tx = await this.certificationContract.updateTeacherInfo(
      newEmail,
      newCategory,
      newCredentials
    );

    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * 计算撤销退款金额
   */
  async calculateRevocationRefund(address?: string): Promise<{
    refundAmount: string;
    penaltyAmount: string;
  }> {
    if (!this.certificationContract) {
      throw new Error('服务未初始化');
    }

    const teacherAddress = address || (await this.getConnectedAddress());
    if (!teacherAddress) {
      throw new Error('未连接钱包');
    }

    const [refund, penalty] =
      await this.certificationContract.calculateRevocationRefund(teacherAddress);

    return {
      refundAmount: ethers.formatEther(refund),
      penaltyAmount: ethers.formatEther(penalty),
    };
  }

  /**
   * 获取合约统计信息
   */
  async getContractStats(): Promise<{
    totalTeachers: number;
    totalStaked: string;
    totalPenalty: string;
    stakeAmount: string;
    validityPeriod: number;
  }> {
    if (!this.certificationContract) {
      throw new Error('服务未初始化');
    }

    const stats = await this.certificationContract.getContractStats();

    return {
      totalTeachers: Number(stats.totalTeachers),
      totalStaked: ethers.formatEther(stats.totalStaked),
      totalPenalty: ethers.formatEther(stats.totalPenalty),
      stakeAmount: ethers.formatEther(stats.stakeAmount),
      validityPeriod: Number(stats.validityPeriod),
    };
  }

  /**
   * 监听认证事件
   */
  onTeacherCertified(
    callback: (teacher: string, emailHash: string, categoryHash: string) => void
  ) {
    if (!this.certificationContract) {
      throw new Error('服务未初始化');
    }

    this.certificationContract.on(
      'TeacherCertified',
      (teacher, emailHash, categoryHash) => {
        callback(teacher, emailHash, categoryHash);
      }
    );
  }

  /**
   * 取消事件监听
   */
  removeAllListeners() {
    if (this.certificationContract) {
      this.certificationContract.removeAllListeners();
    }
  }
}

// 导出单例
export const certificationService = new CertificationService();

// 类型声明
declare global {
  interface Window {
    ethereum?: any;
  }
}
