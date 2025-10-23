const hre = require("hardhat");
const { ethers } = require("hardhat");

async function main() {
    console.log("🚀 开始部署 TeacherCertificationV2 合约...\n");

    // 获取部署者账户
    const [deployer] = await ethers.getSigners();
    console.log("📝 部署账户:", deployer.address);
    console.log("💰 账户余额:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH\n");

    // YD Token 地址（需要根据实际网络替换）
    const YD_TOKEN_ADDRESS = process.env.YD_TOKEN_ADDRESS || "0x0000000000000000000000000000000000000000";

    if (YD_TOKEN_ADDRESS === "0x0000000000000000000000000000000000000000") {
        console.log("⚠️  警告: YD_TOKEN_ADDRESS 未设置，使用零地址");
        console.log("⚠️  请在 .env 文件中设置正确的 YD_TOKEN_ADDRESS\n");
    }

    // 部署合约
    console.log("📦 正在部署合约...");
    const TeacherCertification = await ethers.getContractFactory("TeacherCertificationV2");
    const certification = await TeacherCertification.deploy(YD_TOKEN_ADDRESS);

    await certification.waitForDeployment();
    const certificationAddress = await certification.getAddress();

    console.log("✅ 合约部署成功!");
    console.log("📍 合约地址:", certificationAddress);
    console.log("🔗 YD Token 地址:", YD_TOKEN_ADDRESS);

    // 等待几个区块确认
    console.log("\n⏳ 等待区块确认...");
    await certification.deploymentTransaction().wait(5);

    // 验证合约初始状态
    console.log("\n🔍 验证合约初始状态:");
    const stakeAmount = await certification.certifyStakeAmount();
    const validityPeriod = await certification.certificationValidityPeriod();
    const penaltyBps = await certification.revocationPenaltyBps();

    console.log("  - 质押金额:", ethers.formatEther(stakeAmount), "YD");
    console.log("  - 有效期:", Number(validityPeriod) / 86400, "天");
    console.log("  - 撤销惩罚:", Number(penaltyBps) / 100, "%");

    // 输出部署摘要
    console.log("\n" + "=".repeat(60));
    console.log("📋 部署摘要");
    console.log("=".repeat(60));
    console.log(`合约地址: ${certificationAddress}`);
    console.log(`部署者: ${deployer.address}`);
    console.log(`网络: ${hre.network.name}`);
    console.log(`区块号: ${(await ethers.provider.getBlock("latest")).number}`);
    console.log("=".repeat(60));

    // 在 Etherscan 上验证合约（如果是主网或测试网）
    if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
        console.log("\n🔍 准备在 Etherscan 上验证合约...");
        console.log("请等待几秒钟，然后运行:");
        console.log(`npx hardhat verify --network ${hre.network.name} ${certificationAddress} ${YD_TOKEN_ADDRESS}`);
    }

    // 保存部署信息
    const fs = require("fs");
    const deploymentInfo = {
        network: hre.network.name,
        contractAddress: certificationAddress,
        ydTokenAddress: YD_TOKEN_ADDRESS,
        deployer: deployer.address,
        blockNumber: (await ethers.provider.getBlock("latest")).number,
        timestamp: new Date().toISOString(),
        config: {
            stakeAmount: ethers.formatEther(stakeAmount),
            validityPeriod: Number(validityPeriod),
            revocationPenalty: Number(penaltyBps)
        }
    };

    const deploymentPath = `./deployments/${hre.network.name}_deployment.json`;
    fs.mkdirSync("./deployments", { recursive: true });
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
    console.log(`\n💾 部署信息已保存到: ${deploymentPath}`);

    console.log("\n✨ 部署完成!\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ 部署失败:", error);
        process.exit(1);
    });
