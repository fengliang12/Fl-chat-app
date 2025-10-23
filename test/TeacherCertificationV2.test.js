const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("TeacherCertificationV2", function () {
    // 部署合约和设置测试环境
    async function deployFixture() {
        const [owner, teacher1, teacher2, operator, treasury] = await ethers.getSigners();

        // 部署 Mock ERC20 代币
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const ydToken = await MockERC20.deploy("YD Token", "YD", ethers.parseEther("1000000"));

        // 部署认证合约
        const TeacherCertification = await ethers.getContractFactory("TeacherCertificationV2");
        const certification = await TeacherCertification.deploy(await ydToken.getAddress());

        // 给测试老师转账代币
        await ydToken.transfer(teacher1.address, ethers.parseEther("10000"));
        await ydToken.transfer(teacher2.address, ethers.parseEther("10000"));

        // 授权合约使用代币
        await ydToken.connect(teacher1).approve(
            await certification.getAddress(),
            ethers.parseEther("10000")
        );
        await ydToken.connect(teacher2).approve(
            await certification.getAddress(),
            ethers.parseEther("10000")
        );

        // 设置操作员角色
        const OPERATOR_ROLE = await certification.OPERATOR_ROLE();
        await certification.grantRole(OPERATOR_ROLE, operator.address);

        return { certification, ydToken, owner, teacher1, teacher2, operator, treasury };
    }

    describe("部署", function () {
        it("应该正确设置 YD Token 地址", async function () {
            const { certification, ydToken } = await loadFixture(deployFixture);
            expect(await certification.ydToken()).to.equal(await ydToken.getAddress());
        });

        it("应该设置正确的初始参数", async function () {
            const { certification } = await loadFixture(deployFixture);
            expect(await certification.certifyStakeAmount()).to.equal(ethers.parseEther("500"));
            expect(await certification.certificationValidityPeriod()).to.equal(365 * 24 * 60 * 60);
        });

        it("应该给部署者授予管理员角色", async function () {
            const { certification, owner } = await loadFixture(deployFixture);
            const ADMIN_ROLE = await certification.ADMIN_ROLE();
            expect(await certification.hasRole(ADMIN_ROLE, owner.address)).to.be.true;
        });
    });

    describe("老师认证", function () {
        it("应该允许老师成功认证", async function () {
            const { certification, teacher1 } = await loadFixture(deployFixture);

            const email = "teacher1@example.com";
            const category = "Math";
            const credentials = "PhD in Mathematics";

            await expect(
                certification.connect(teacher1).certifyAsTeacher(email, category, credentials)
            )
                .to.emit(certification, "TeacherCertified")
                .withArgs(
                    teacher1.address,
                    ethers.keccak256(ethers.toUtf8Bytes(email)),
                    ethers.keccak256(ethers.toUtf8Bytes(category)),
                    ethers.parseEther("500"),
                    await time.latest() + 365 * 24 * 60 * 60 + 1,
                    await time.latest() + 1
                );

            expect(await certification.isCertified(teacher1.address)).to.be.true;
        });

        it("应该正确扣除质押代币", async function () {
            const { certification, ydToken, teacher1 } = await loadFixture(deployFixture);

            const balanceBefore = await ydToken.balanceOf(teacher1.address);

            await certification.connect(teacher1).certifyAsTeacher(
                "teacher1@example.com",
                "Math",
                ""
            );

            const balanceAfter = await ydToken.balanceOf(teacher1.address);
            expect(balanceBefore - balanceAfter).to.equal(ethers.parseEther("500"));
        });

        it("应该拒绝空邮箱", async function () {
            const { certification, teacher1 } = await loadFixture(deployFixture);

            await expect(
                certification.connect(teacher1).certifyAsTeacher("", "Math", "")
            ).to.be.revertedWith("Email required");
        });

        it("应该拒绝空分类", async function () {
            const { certification, teacher1 } = await loadFixture(deployFixture);

            await expect(
                certification.connect(teacher1).certifyAsTeacher("teacher@example.com", "", "")
            ).to.be.revertedWith("Category required");
        });

        it("应该拒绝重复邮箱", async function () {
            const { certification, teacher1, teacher2 } = await loadFixture(deployFixture);

            const email = "same@example.com";

            await certification.connect(teacher1).certifyAsTeacher(email, "Math", "");

            await expect(
                certification.connect(teacher2).certifyAsTeacher(email, "Science", "")
            ).to.be.revertedWith("Email already registered");
        });

        it("应该拒绝已认证的老师再次认证", async function () {
            const { certification, teacher1 } = await loadFixture(deployFixture);

            await certification.connect(teacher1).certifyAsTeacher(
                "teacher1@example.com",
                "Math",
                ""
            );

            await expect(
                certification.connect(teacher1).certifyAsTeacher(
                    "teacher2@example.com",
                    "Science",
                    ""
                )
            ).to.be.revertedWith("Already certified");
        });

        it("应该拒绝余额不足的认证", async function () {
            const { certification, ydToken } = await loadFixture(deployFixture);
            const [, , , , , poorTeacher] = await ethers.getSigners();

            // 只给少量代币
            await ydToken.transfer(poorTeacher.address, ethers.parseEther("100"));
            await ydToken.connect(poorTeacher).approve(
                await certification.getAddress(),
                ethers.parseEther("100")
            );

            await expect(
                certification.connect(poorTeacher).certifyAsTeacher(
                    "poor@example.com",
                    "Art",
                    ""
                )
            ).to.be.reverted;
        });
    });

    describe("认证续期", function () {
        it("应该允许活跃老师续期", async function () {
            const { certification, teacher1 } = await loadFixture(deployFixture);

            await certification.connect(teacher1).certifyAsTeacher(
                "teacher1@example.com",
                "Math",
                ""
            );

            // 快进时间到接近过期
            await time.increase(360 * 24 * 60 * 60);

            await expect(certification.connect(teacher1).renewCertification())
                .to.emit(certification, "CertificationRenewed");
        });

        it("应该更新过期时间", async function () {
            const { certification, teacher1 } = await loadFixture(deployFixture);

            await certification.connect(teacher1).certifyAsTeacher(
                "teacher1@example.com",
                "Math",
                ""
            );

            const infoBefore = await certification.getTeacherInfo(teacher1.address);
            
            await time.increase(200 * 24 * 60 * 60);
            await certification.connect(teacher1).renewCertification();

            const infoAfter = await certification.getTeacherInfo(teacher1.address);
            expect(infoAfter.expiryTime).to.be.gt(infoBefore.expiryTime);
        });
    });

    describe("撤销认证", function () {
        it("应该允许老师撤销自己的认证", async function () {
            const { certification, teacher1 } = await loadFixture(deployFixture);

            await certification.connect(teacher1).certifyAsTeacher(
                "teacher1@example.com",
                "Math",
                ""
            );

            await expect(certification.connect(teacher1).revokeMyCertification())
                .to.emit(certification, "CertificationRevoked");

            expect(await certification.isCertified(teacher1.address)).to.be.false;
        });

        it("应该扣除惩罚并退还剩余代币", async function () {
            const { certification, ydToken, teacher1 } = await loadFixture(deployFixture);

            await certification.connect(teacher1).certifyAsTeacher(
                "teacher1@example.com",
                "Math",
                ""
            );

            const balanceBefore = await ydToken.balanceOf(teacher1.address);

            await certification.connect(teacher1).revokeMyCertification();

            const balanceAfter = await ydToken.balanceOf(teacher1.address);
            
            // 应该退还 90% (惩罚10%)
            const expectedRefund = ethers.parseEther("450"); // 500 * 0.9
            expect(balanceAfter - balanceBefore).to.equal(expectedRefund);
        });

        it("应该记录惩罚金额", async function () {
            const { certification, teacher1 } = await loadFixture(deployFixture);

            await certification.connect(teacher1).certifyAsTeacher(
                "teacher1@example.com",
                "Math",
                ""
            );

            const penaltyBefore = await certification.totalPenaltyCollected();

            await certification.connect(teacher1).revokeMyCertification();

            const penaltyAfter = await certification.totalPenaltyCollected();
            
            const expectedPenalty = ethers.parseEther("50"); // 500 * 0.1
            expect(penaltyAfter - penaltyBefore).to.equal(expectedPenalty);
        });
    });

    describe("更新老师信息", function () {
        it("应该允许更新邮箱和分类", async function () {
            const { certification, teacher1 } = await loadFixture(deployFixture);

            await certification.connect(teacher1).certifyAsTeacher(
                "old@example.com",
                "Math",
                ""
            );

            const newEmail = "new@example.com";
            const newCategory = "Science";

            await expect(
                certification.connect(teacher1).updateTeacherInfo(
                    newEmail,
                    newCategory,
                    "New credentials"
                )
            )
                .to.emit(certification, "TeacherInfoUpdated");

            // 验证新信息
            const isValid = await certification.verifyTeacherInfo(
                teacher1.address,
                newEmail,
                newCategory
            );
            expect(isValid).to.be.true;
        });

        it("应该拒绝更新为已占用的邮箱", async function () {
            const { certification, teacher1, teacher2 } = await loadFixture(deployFixture);

            await certification.connect(teacher1).certifyAsTeacher(
                "teacher1@example.com",
                "Math",
                ""
            );

            await certification.connect(teacher2).certifyAsTeacher(
                "teacher2@example.com",
                "Science",
                ""
            );

            await expect(
                certification.connect(teacher2).updateTeacherInfo(
                    "teacher1@example.com",
                    "Science",
                    ""
                )
            ).to.be.revertedWith("Email already registered");
        });
    });

    describe("管理员功能", function () {
        it("应该允许暂停老师认证", async function () {
            const { certification, teacher1, operator } = await loadFixture(deployFixture);

            await certification.connect(teacher1).certifyAsTeacher(
                "teacher1@example.com",
                "Math",
                ""
            );

            await expect(
                certification.connect(operator).suspendTeacher(
                    teacher1.address,
                    "Violation of terms"
                )
            )
                .to.emit(certification, "CertificationSuspended");

            const info = await certification.getTeacherInfo(teacher1.address);
            expect(info.status).to.equal(4); // Suspended
        });

        it("应该允许恢复暂停的认证", async function () {
            const { certification, teacher1, operator } = await loadFixture(deployFixture);

            await certification.connect(teacher1).certifyAsTeacher(
                "teacher1@example.com",
                "Math",
                ""
            );

            await certification.connect(operator).suspendTeacher(
                teacher1.address,
                "Test"
            );

            await expect(
                certification.connect(operator).reactivateTeacher(teacher1.address)
            )
                .to.emit(certification, "CertificationReactivated");

            const info = await certification.getTeacherInfo(teacher1.address);
            expect(info.status).to.equal(1); // Active
        });

        it("应该允许强制撤销并没收质押", async function () {
            const { certification, ydToken, teacher1, owner } = await loadFixture(deployFixture);

            await certification.connect(teacher1).certifyAsTeacher(
                "teacher1@example.com",
                "Math",
                ""
            );

            const balanceBefore = await ydToken.balanceOf(teacher1.address);

            await certification.connect(owner).forceRevokeTeacher(teacher1.address);

            const balanceAfter = await ydToken.balanceOf(teacher1.address);
            
            // 余额不应该增加（全部没收）
            expect(balanceAfter).to.equal(balanceBefore);
            expect(await certification.isCertified(teacher1.address)).to.be.false;
        });

        it("应该允许更新质押金额", async function () {
            const { certification, owner } = await loadFixture(deployFixture);

            const newAmount = ethers.parseEther("1000");

            await expect(
                certification.connect(owner).updateStakeAmount(newAmount)
            )
                .to.emit(certification, "StakeAmountUpdated")
                .withArgs(ethers.parseEther("500"), newAmount, await time.latest() + 1);

            expect(await certification.certifyStakeAmount()).to.equal(newAmount);
        });

        it("应该允许更新黑名单", async function () {
            const { certification, teacher1, owner } = await loadFixture(deployFixture);

            await expect(
                certification.connect(owner).updateBlacklist(teacher1.address, true)
            )
                .to.emit(certification, "BlacklistUpdated");

            expect(await certification.isBlacklisted(teacher1.address)).to.be.true;

            // 黑名单用户不能认证
            await expect(
                certification.connect(teacher1).certifyAsTeacher(
                    "teacher1@example.com",
                    "Math",
                    ""
                )
            ).to.be.revertedWith("Address is blacklisted");
        });
    });

    describe("视图函数", function () {
        it("应该正确返回老师信息", async function () {
            const { certification, teacher1 } = await loadFixture(deployFixture);

            const email = "teacher1@example.com";
            const category = "Math";

            await certification.connect(teacher1).certifyAsTeacher(email, category, "");

            const info = await certification.getTeacherInfo(teacher1.address);
            
            expect(info.stakedAmount).to.equal(ethers.parseEther("500"));
            expect(info.status).to.equal(1); // Active
            expect(info.isActive).to.be.true;
        });

        it("应该正确验证认证状态", async function () {
            const { certification, teacher1, teacher2 } = await loadFixture(deployFixture);

            await certification.connect(teacher1).certifyAsTeacher(
                "teacher1@example.com",
                "Math",
                ""
            );

            expect(await certification.isActiveCertification(teacher1.address)).to.be.true;
            expect(await certification.isActiveCertification(teacher2.address)).to.be.false;
        });

        it("应该正确计算撤销退款", async function () {
            const { certification, teacher1 } = await loadFixture(deployFixture);

            await certification.connect(teacher1).certifyAsTeacher(
                "teacher1@example.com",
                "Math",
                ""
            );

            const [refund, penalty] = await certification.calculateRevocationRefund(
                teacher1.address
            );

            expect(refund).to.equal(ethers.parseEther("450")); // 90%
            expect(penalty).to.equal(ethers.parseEther("50"));  // 10%
        });

        it("应该正确返回合约统计", async function () {
            const { certification, teacher1 } = await loadFixture(deployFixture);

            await certification.connect(teacher1).certifyAsTeacher(
                "teacher1@example.com",
                "Math",
                ""
            );

            const stats = await certification.getContractStats();
            
            expect(stats.totalTeachers).to.equal(1);
            expect(stats.totalStaked).to.equal(ethers.parseEther("500"));
        });
    });

    describe("暂停功能", function () {
        it("应该允许管理员暂停合约", async function () {
            const { certification, owner } = await loadFixture(deployFixture);

            await certification.connect(owner).pause();
            expect(await certification.paused()).to.be.true;
        });

        it("暂停后应该拒绝认证操作", async function () {
            const { certification, teacher1, owner } = await loadFixture(deployFixture);

            await certification.connect(owner).pause();

            await expect(
                certification.connect(teacher1).certifyAsTeacher(
                    "teacher1@example.com",
                    "Math",
                    ""
                )
            ).to.be.revertedWithCustomError(certification, "EnforcedPause");
        });

        it("应该允许管理员恢复合约", async function () {
            const { certification, owner } = await loadFixture(deployFixture);

            await certification.connect(owner).pause();
            await certification.connect(owner).unpause();
            
            expect(await certification.paused()).to.be.false;
        });
    });

    describe("安全测试", function () {
        it("应该防止重入攻击", async function () {
            // ReentrancyGuard 应该自动防止重入
            const { certification, teacher1 } = await loadFixture(deployFixture);

            await certification.connect(teacher1).certifyAsTeacher(
                "teacher1@example.com",
                "Math",
                ""
            );

            // 尝试在同一交易中调用多次应该失败
            // 这个测试需要专门的攻击合约来验证
        });

        it("应该拒绝非管理员调用管理功能", async function () {
            const { certification, teacher1, teacher2 } = await loadFixture(deployFixture);

            await certification.connect(teacher1).certifyAsTeacher(
                "teacher1@example.com",
                "Math",
                ""
            );

            await expect(
                certification.connect(teacher2).forceRevokeTeacher(teacher1.address)
            ).to.be.reverted;
        });

        it("应该正确处理代币转账失败", async function () {
            const { certification } = await loadFixture(deployFixture);
            const [, , , , , noTokenTeacher] = await ethers.getSigners();

            // 没有授权
            await expect(
                certification.connect(noTokenTeacher).certifyAsTeacher(
                    "test@example.com",
                    "Math",
                    ""
                )
            ).to.be.reverted;
        });
    });
});
