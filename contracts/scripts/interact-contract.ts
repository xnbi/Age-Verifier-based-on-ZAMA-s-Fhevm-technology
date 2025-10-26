import { ethers } from "hardhat";
import fs from "fs";
import path from "path";
import readline from "readline";

// 创建命令行接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log("🎮 AgeVerifier 合约交互工具\n");

  // 读取部署信息
  const deploymentPath = path.join(__dirname, "../deployments/sepolia-deployment.json");

  if (!fs.existsSync(deploymentPath)) {
    console.error("❌ 错误: 未找到部署信息");
    console.log("   请先部署合约");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const contractAddress = deployment.contractAddress;

  console.log("📍 合约地址:", contractAddress);

  // 获取合约实例
  const ageVerifier = await ethers.getContractAt("AgeVerifier", contractAddress);
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();

  console.log("👤 当前账户:", signerAddress);
  console.log("\n" + "=".repeat(50));

  // 主菜单
  while (true) {
    console.log("\n📋 可用操作:");
    console.log("   1. 查看最小年龄要求");
    console.log("   2. 查看我的验证状态");
    console.log("   3. Mock 验证（明文）");
    console.log("   4. 查看合约信息");
    console.log("   5. 退出");

    const choice = await question("\n请选择操作 (1-5): ");

    switch (choice.trim()) {
      case "1":
        await checkMinimumAge(ageVerifier);
        break;

      case "2":
        await checkVerificationStatus(ageVerifier, signerAddress);
        break;

      case "3":
        await mockVerify(ageVerifier);
        break;

      case "4":
        await showContractInfo(ageVerifier, contractAddress);
        break;

      case "5":
        console.log("\n👋 再见！");
        rl.close();
        return;

      default:
        console.log("❌ 无效选择，请重试");
    }
  }
}

async function checkMinimumAge(contract: any) {
  console.log("\n🔍 查询最小年龄要求...");
  try {
    const minAge = await contract.MINIMUM_AGE();
    console.log("   ✅ 最小年龄:", minAge.toString(), "岁");
  } catch (error: any) {
    console.error("   ❌ 查询失败:", error.message);
  }
}

async function checkVerificationStatus(contract: any, address: string) {
  console.log("\n🔍 查询验证状态...");
  try {
    const isVerified = await contract.isVerified(address);
    console.log("   账户:", address);
    console.log("   状态:", isVerified ? "✅ 已验证（年龄符合）" : "❌ 未验证或年龄不符");
  } catch (error: any) {
    console.error("   ❌ 查询失败:", error.message);
  }
}

async function mockVerify(contract: any) {
  console.log("\n📝 Mock 验证（明文模式）");
  console.log("   ⚠️  注意：此模式不使用 FHE 加密，仅用于测试");

  const ageInput = await question("   请输入年龄: ");
  const age = parseInt(ageInput);

  if (isNaN(age) || age < 1 || age > 150) {
    console.log("   ❌ 无效的年龄");
    return;
  }

  console.log("\n🚀 发送交易...");
  try {
    const tx = await contract.verifyAgeMock(age);
    console.log("   交易哈希:", tx.hash);
    console.log("   ⏳ 等待确认...");

    await tx.wait();
    console.log("   ✅ 交易已确认！");

    // 检查结果
    const [signer] = await ethers.getSigners();
    const signerAddress = await signer.getAddress();
    const isVerified = await contract.isVerified(signerAddress);

    if (isVerified) {
      console.log("   🎉 验证成功！您的年龄符合要求。");
    } else {
      console.log("   ❌ 验证失败！年龄不符合要求（需要 >= 18 岁）。");
    }
  } catch (error: any) {
    console.error("   ❌ 交易失败:", error.message);
  }
}

async function showContractInfo(contract: any, address: string) {
  console.log("\n📊 合约信息:");
  console.log("   地址:", address);

  try {
    const provider = contract.runner?.provider;
    if (provider) {
      const balance = await provider.getBalance(address);
      console.log("   余额:", ethers.formatEther(balance), "ETH");

      const code = await provider.getCode(address);
      console.log("   代码大小:", code.length, "字节");
    }

    const minAge = await contract.MINIMUM_AGE();
    console.log("   最小年龄:", minAge.toString(), "岁");

    console.log("\n   Etherscan:");
    console.log(`   https://sepolia.etherscan.io/address/${address}`);
  } catch (error: any) {
    console.error("   ❌ 获取信息失败:", error.message);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    rl.close();
    process.exit(1);
  });


