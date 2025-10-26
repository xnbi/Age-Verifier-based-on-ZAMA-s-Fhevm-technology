import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🔍 验证部署信息...\n");

  // 读取部署信息
  const deploymentPath = path.join(__dirname, "../deployments/sepolia-deployment.json");

  if (!fs.existsSync(deploymentPath)) {
    console.error("❌ 错误: 未找到部署信息");
    console.log("   请先部署合约: npx hardhat run scripts/deploy-age-verifier.ts --network sepolia");
    process.exit(1);
  }

  const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
  const contractAddress = deployment.contractAddress;

  console.log("📍 部署信息:");
  console.log("   合约地址:", contractAddress);
  console.log("   部署者:", deployment.deployerAddress);
  console.log("   部署时间:", deployment.timestamp);
  console.log("   交易哈希:", deployment.transactionHash);

  // 验证合约是否存在
  console.log("\n🔍 验证合约...");
  const code = await ethers.provider.getCode(contractAddress);

  if (code === "0x") {
    console.error("   ❌ 合约不存在或未部署成功");
    process.exit(1);
  }
  console.log("   ✅ 合约代码存在");

  // 尝试调用合约
  try {
    const ageVerifier = await ethers.getContractAt("AgeVerifier", contractAddress);

    const MINIMUM_AGE = await ageVerifier.MINIMUM_AGE();
    console.log("   ✅ 合约可调用");
    console.log("   ✅ 最小年龄要求:", MINIMUM_AGE.toString());

    // 获取合约余额（如果有）
    const balance = await ethers.provider.getBalance(contractAddress);
    console.log("   💰 合约余额:", ethers.formatEther(balance), "ETH");
  } catch (error: any) {
    console.error("   ⚠️  合约调用失败:", error.message);
  }

  // 显示 Etherscan 链接
  console.log("\n🔗 Etherscan 链接:");
  console.log(`   https://sepolia.etherscan.io/address/${contractAddress}`);
  console.log(`   https://sepolia.etherscan.io/tx/${deployment.transactionHash}`);

  // 生成前端配置
  console.log("\n📝 前端配置:");
  console.log(`   VITE_CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`   VITE_CONTRACT_ADDRESS_MOCK=${contractAddress}`);

  console.log("\n🎉 验证完成！");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ 验证失败:", error);
    process.exit(1);
  });


