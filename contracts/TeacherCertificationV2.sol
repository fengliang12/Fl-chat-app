// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title TeacherCertificationV2
 * @dev 专业级老师认证合约 - 完整安全性和功能
 * 
 * 主要改进：
 * 1. 安全性：ReentrancyGuard、Pausable、AccessControl
 * 2. 状态更新遵循 CEI 模式（Checks-Effects-Interactions）
 * 3. 完善的认证生命周期管理
 * 4. 灵活的质押和退款机制
 * 5. 事件驱动的可追溯性
 * 6. Gas 优化
 */
contract TeacherCertificationV2 is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ==================== 常量和不可变变量 ====================
    
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    
    IERC20 public immutable ydToken;
    
    // 默认质押金额（可通过治理调整）
    uint256 public certifyStakeAmount = 500 * 10**18;
    
    // 认证有效期（默认1年，0表示永久有效）
    uint256 public certificationValidityPeriod = 365 days;
    
    // 撤销认证时的惩罚比例（basis points: 1000 = 10%）
    uint256 public revocationPenaltyBps = 1000; // 10%
    uint256 public constant MAX_PENALTY_BPS = 5000; // 最大50%

    // ==================== 数据结构 ====================
    
    enum CertificationStatus {
        None,           // 未认证
        Active,         // 活跃
        Expired,        // 已过期
        Revoked,        // 已撤销
        Suspended       // 已暂停
    }

    struct TeacherInfo {
        uint64 certifyTime;         // 认证时间
        uint64 expiryTime;          // 过期时间
        uint256 stakedAmount;       // 质押金额
        bytes32 emailHash;          // 邮箱哈希
        bytes32 categoryHash;       // 分类哈希
        bytes32 credentialsHash;    // 资质证明哈希（可选）
        CertificationStatus status; // 认证状态
    }

    // ==================== 状态变量 ====================
    
    // 地址 -> 老师信息
    mapping(address => TeacherInfo) public teachers;
    
    // 快速状态查询
    mapping(address => bool) public isCertified;
    
    // 黑名单
    mapping(address => bool) public isBlacklisted;
    
    // 邮箱哈希 -> 地址（防止重复邮箱）
    mapping(bytes32 => address) public emailToAddress;
    
    // 统计数据
    uint256 public totalCertifiedTeachers;
    uint256 public totalStakedAmount;
    uint256 public totalPenaltyCollected;

    // ==================== 事件 ====================
    
    event TeacherCertified(
        address indexed teacher,
        bytes32 emailHash,
        bytes32 categoryHash,
        uint256 stakedAmount,
        uint64 expiryTime,
        uint256 timestamp
    );

    event CertificationRenewed(
        address indexed teacher,
        uint64 newExpiryTime,
        uint256 timestamp
    );

    event CertificationRevoked(
        address indexed teacher,
        uint256 refundAmount,
        uint256 penaltyAmount,
        uint256 timestamp
    );

    event CertificationSuspended(
        address indexed teacher,
        string reason,
        uint256 timestamp
    );

    event CertificationReactivated(
        address indexed teacher,
        uint256 timestamp
    );

    event StakeAmountUpdated(
        uint256 oldAmount,
        uint256 newAmount,
        uint256 timestamp
    );

    event ValidityPeriodUpdated(
        uint256 oldPeriod,
        uint256 newPeriod,
        uint256 timestamp
    );

    event PenaltyCollected(
        address indexed teacher,
        uint256 amount,
        uint256 timestamp
    );

    event TeacherInfoUpdated(
        address indexed teacher,
        bytes32 newEmailHash,
        bytes32 newCategoryHash,
        uint256 timestamp
    );

    event BlacklistUpdated(
        address indexed teacher,
        bool isBlacklisted,
        uint256 timestamp
    );

    // ==================== Modifiers ====================
    
    modifier notBlacklisted() {
        require(!isBlacklisted[msg.sender], "Address is blacklisted");
        _;
    }

    modifier onlyCertified() {
        require(isCertified[msg.sender], "Not certified");
        require(teachers[msg.sender].status == CertificationStatus.Active, "Certification not active");
        _;
    }

    modifier notCertified() {
        require(!isCertified[msg.sender] || teachers[msg.sender].status == CertificationStatus.None, "Already certified");
        _;
    }

    // ==================== 构造函数 ====================
    
    constructor(address _ydTokenAddress) {
        require(_ydTokenAddress != address(0), "Invalid token address");
        
        ydToken = IERC20(_ydTokenAddress);
        
        // 设置角色
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(OPERATOR_ROLE, msg.sender);
    }

    // ==================== 核心功能：认证 ====================
    
    /**
     * @dev 申请成为认证老师
     * @param _email 邮箱
     * @param _category 教学分类
     * @param _credentials 资质证明（可选）
     */
    function certifyAsTeacher(
        string calldata _email,
        string calldata _category,
        string calldata _credentials
    ) external nonReentrant whenNotPaused notBlacklisted notCertified {
        require(bytes(_email).length > 0, "Email required");
        require(bytes(_category).length > 0, "Category required");

        bytes32 emailHash = keccak256(bytes(_email));
        bytes32 categoryHash = keccak256(bytes(_category));
        bytes32 credentialsHash = bytes(_credentials).length > 0 
            ? keccak256(bytes(_credentials)) 
            : bytes32(0);

        // 检查邮箱是否已被使用
        require(emailToAddress[emailHash] == address(0), "Email already registered");

        // 计算过期时间
        uint64 expiryTime = certificationValidityPeriod > 0 
            ? uint64(block.timestamp + certificationValidityPeriod)
            : type(uint64).max; // 永久有效

        // Effects: 更新状态（CEI 模式）
        teachers[msg.sender] = TeacherInfo({
            certifyTime: uint64(block.timestamp),
            expiryTime: expiryTime,
            stakedAmount: certifyStakeAmount,
            emailHash: emailHash,
            categoryHash: categoryHash,
            credentialsHash: credentialsHash,
            status: CertificationStatus.Active
        });

        isCertified[msg.sender] = true;
        emailToAddress[emailHash] = msg.sender;
        totalCertifiedTeachers++;
        totalStakedAmount += certifyStakeAmount;

        // Interactions: 转移代币（最后执行）
        ydToken.safeTransferFrom(msg.sender, address(this), certifyStakeAmount);

        emit TeacherCertified(
            msg.sender,
            emailHash,
            categoryHash,
            certifyStakeAmount,
            expiryTime,
            block.timestamp
        );
    }

    /**
     * @dev 续期认证
     */
    function renewCertification() external nonReentrant whenNotPaused onlyCertified {
        TeacherInfo storage teacher = teachers[msg.sender];
        
        // 如果已过期，需要重新质押
        if (teacher.status == CertificationStatus.Expired || block.timestamp > teacher.expiryTime) {
            require(teacher.stakedAmount >= certifyStakeAmount, "Insufficient stake");
            
            // 如果质押不足，需要补充
            uint256 additionalStake = certifyStakeAmount - teacher.stakedAmount;
            if (additionalStake > 0) {
                teacher.stakedAmount = certifyStakeAmount;
                totalStakedAmount += additionalStake;
                ydToken.safeTransferFrom(msg.sender, address(this), additionalStake);
            }
        }

        // 更新过期时间
        uint64 newExpiryTime = certificationValidityPeriod > 0
            ? uint64(block.timestamp + certificationValidityPeriod)
            : type(uint64).max;

        teacher.expiryTime = newExpiryTime;
        teacher.status = CertificationStatus.Active;

        emit CertificationRenewed(msg.sender, newExpiryTime, block.timestamp);
    }

    /**
     * @dev 撤销自己的认证并取回质押（扣除惩罚）
     */
    function revokeMyCertification() external nonReentrant onlyCertified {
        TeacherInfo storage teacher = teachers[msg.sender];
        
        uint256 stakedAmount = teacher.stakedAmount;
        uint256 penalty = (stakedAmount * revocationPenaltyBps) / 10000;
        uint256 refundAmount = stakedAmount - penalty;

        // Effects: 更新状态
        teacher.status = CertificationStatus.Revoked;
        teacher.stakedAmount = 0;
        isCertified[msg.sender] = false;
        
        // 清理邮箱映射
        delete emailToAddress[teacher.emailHash];
        
        totalStakedAmount -= stakedAmount;
        totalPenaltyCollected += penalty;

        // Interactions: 退款
        if (refundAmount > 0) {
            ydToken.safeTransfer(msg.sender, refundAmount);
        }

        emit CertificationRevoked(msg.sender, refundAmount, penalty, block.timestamp);
        if (penalty > 0) {
            emit PenaltyCollected(msg.sender, penalty, block.timestamp);
        }
    }

    /**
     * @dev 更新认证信息（不改变质押）
     */
    function updateTeacherInfo(
        string calldata _newEmail,
        string calldata _newCategory,
        string calldata _newCredentials
    ) external nonReentrant whenNotPaused onlyCertified {
        require(bytes(_newEmail).length > 0, "Email required");
        require(bytes(_newCategory).length > 0, "Category required");

        TeacherInfo storage teacher = teachers[msg.sender];
        
        bytes32 newEmailHash = keccak256(bytes(_newEmail));
        bytes32 newCategoryHash = keccak256(bytes(_newCategory));
        bytes32 newCredentialsHash = bytes(_newCredentials).length > 0
            ? keccak256(bytes(_newCredentials))
            : bytes32(0);

        // 如果邮箱改变，检查新邮箱是否可用
        if (newEmailHash != teacher.emailHash) {
            require(
                emailToAddress[newEmailHash] == address(0),
                "Email already registered"
            );
            
            // 清理旧邮箱映射
            delete emailToAddress[teacher.emailHash];
            emailToAddress[newEmailHash] = msg.sender;
        }

        // 更新信息
        teacher.emailHash = newEmailHash;
        teacher.categoryHash = newCategoryHash;
        teacher.credentialsHash = newCredentialsHash;

        emit TeacherInfoUpdated(
            msg.sender,
            newEmailHash,
            newCategoryHash,
            block.timestamp
        );
    }

    // ==================== 管理员功能 ====================
    
    /**
     * @dev 暂停某个老师的认证（管理员）
     */
    function suspendTeacher(
        address teacher,
        string calldata reason
    ) external onlyRole(OPERATOR_ROLE) {
        require(isCertified[teacher], "Not certified");
        require(
            teachers[teacher].status == CertificationStatus.Active,
            "Not active"
        );

        teachers[teacher].status = CertificationStatus.Suspended;

        emit CertificationSuspended(teacher, reason, block.timestamp);
    }

    /**
     * @dev 恢复老师的认证
     */
    function reactivateTeacher(address teacher) external onlyRole(OPERATOR_ROLE) {
        require(isCertified[teacher], "Not certified");
        require(
            teachers[teacher].status == CertificationStatus.Suspended,
            "Not suspended"
        );

        teachers[teacher].status = CertificationStatus.Active;

        emit CertificationReactivated(teacher, block.timestamp);
    }

    /**
     * @dev 强制撤销认证并没收质押（仅限严重违规）
     */
    function forceRevokeTeacher(
        address teacher
    ) external onlyRole(ADMIN_ROLE) {
        require(isCertified[teacher], "Not certified");

        TeacherInfo storage info = teachers[teacher];
        uint256 confiscatedAmount = info.stakedAmount;

        // 更新状态
        info.status = CertificationStatus.Revoked;
        info.stakedAmount = 0;
        isCertified[teacher] = false;
        
        delete emailToAddress[info.emailHash];
        
        totalStakedAmount -= confiscatedAmount;
        totalPenaltyCollected += confiscatedAmount;

        emit CertificationRevoked(teacher, 0, confiscatedAmount, block.timestamp);
        emit PenaltyCollected(teacher, confiscatedAmount, block.timestamp);
    }

    /**
     * @dev 更新黑名单
     */
    function updateBlacklist(
        address teacher,
        bool blacklisted
    ) external onlyRole(ADMIN_ROLE) {
        isBlacklisted[teacher] = blacklisted;
        emit BlacklistUpdated(teacher, blacklisted, block.timestamp);
    }

    /**
     * @dev 更新质押金额
     */
    function updateStakeAmount(
        uint256 newAmount
    ) external onlyRole(ADMIN_ROLE) {
        require(newAmount > 0, "Invalid amount");
        
        uint256 oldAmount = certifyStakeAmount;
        certifyStakeAmount = newAmount;

        emit StakeAmountUpdated(oldAmount, newAmount, block.timestamp);
    }

    /**
     * @dev 更新认证有效期
     */
    function updateValidityPeriod(
        uint256 newPeriod
    ) external onlyRole(ADMIN_ROLE) {
        uint256 oldPeriod = certificationValidityPeriod;
        certificationValidityPeriod = newPeriod;

        emit ValidityPeriodUpdated(oldPeriod, newPeriod, block.timestamp);
    }

    /**
     * @dev 更新撤销惩罚比例
     */
    function updateRevocationPenalty(
        uint256 newPenaltyBps
    ) external onlyRole(ADMIN_ROLE) {
        require(newPenaltyBps <= MAX_PENALTY_BPS, "Penalty too high");
        revocationPenaltyBps = newPenaltyBps;
    }

    /**
     * @dev 提取惩罚金（用于社区治理或销毁）
     */
    function withdrawPenalty(
        address recipient,
        uint256 amount
    ) external onlyRole(ADMIN_ROLE) {
        require(recipient != address(0), "Invalid recipient");
        require(amount <= totalPenaltyCollected, "Insufficient penalty");

        totalPenaltyCollected -= amount;
        ydToken.safeTransfer(recipient, amount);
    }

    /**
     * @dev 暂停/恢复合约
     */
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    // ==================== 视图函数 ====================
    
    /**
     * @dev 获取老师详细信息
     */
    function getTeacherInfo(address teacher) external view returns (
        uint64 certifyTime,
        uint64 expiryTime,
        uint256 stakedAmount,
        bytes32 emailHash,
        bytes32 categoryHash,
        bytes32 credentialsHash,
        CertificationStatus status,
        bool isActive
    ) {
        TeacherInfo memory info = teachers[teacher];
        bool active = isCertified[teacher] && 
                     info.status == CertificationStatus.Active &&
                     (info.expiryTime == type(uint64).max || block.timestamp <= info.expiryTime);
        
        return (
            info.certifyTime,
            info.expiryTime,
            info.stakedAmount,
            info.emailHash,
            info.categoryHash,
            info.credentialsHash,
            info.status,
            active
        );
    }

    /**
     * @dev 检查认证是否有效
     */
    function isActiveCertification(address teacher) external view returns (bool) {
        if (!isCertified[teacher]) return false;
        
        TeacherInfo memory info = teachers[teacher];
        return info.status == CertificationStatus.Active &&
               (info.expiryTime == type(uint64).max || block.timestamp <= info.expiryTime);
    }

    /**
     * @dev 验证老师信息哈希
     */
    function verifyTeacherInfo(
        address teacher,
        string calldata email,
        string calldata category
    ) external view returns (bool) {
        TeacherInfo memory info = teachers[teacher];
        return info.emailHash == keccak256(bytes(email)) &&
               info.categoryHash == keccak256(bytes(category));
    }

    /**
     * @dev 获取合约统计信息
     */
    function getContractStats() external view returns (
        uint256 totalTeachers,
        uint256 totalStaked,
        uint256 totalPenalty,
        uint256 stakeAmount,
        uint256 validityPeriod
    ) {
        return (
            totalCertifiedTeachers,
            totalStakedAmount,
            totalPenaltyCollected,
            certifyStakeAmount,
            certificationValidityPeriod
        );
    }

    /**
     * @dev 计算撤销可退款金额
     */
    function calculateRevocationRefund(address teacher) external view returns (
        uint256 refundAmount,
        uint256 penaltyAmount
    ) {
        if (!isCertified[teacher]) return (0, 0);
        
        uint256 stakedAmount = teachers[teacher].stakedAmount;
        penaltyAmount = (stakedAmount * revocationPenaltyBps) / 10000;
        refundAmount = stakedAmount - penaltyAmount;
        
        return (refundAmount, penaltyAmount);
    }

    /**
     * @dev 获取合约余额
     */
    function getContractBalance() external view returns (uint256) {
        return ydToken.balanceOf(address(this));
    }

    // ==================== 紧急功能 ====================
    
    /**
     * @dev 紧急提取代币（仅在合约升级或紧急情况使用）
     */
    function emergencyWithdraw(
        address token,
        address recipient,
        uint256 amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(recipient != address(0), "Invalid recipient");
        IERC20(token).safeTransfer(recipient, amount);
    }
}
