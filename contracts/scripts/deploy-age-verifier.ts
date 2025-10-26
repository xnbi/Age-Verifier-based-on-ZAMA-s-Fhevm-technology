import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🚀 开始部署 AgeVerifier 合约到 Sepolia...\n");

  // 获取部署账户
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddress);

  console.log("📍 部署账户信息:");
  console.log("   地址:", deployerAddress);
  console.log("   余额:", ethers.formatEther(balance), "ETH");

  // 检查余额
  if (balance < ethers.parseEther("0.005")) {
    console.log("\n⚠️  警告: 余额可能不足，建议至少 0.01 ETH");
    console.log("   访问水龙头: https://sepoliafaucet.com/");
  }

  console.log("\n📦 正在编译和部署合约...");

  // 部署合约
  const AgeVerifier = await ethers.getContractFactory("AgeVerifier");
  console.log("   工厂创建完成");

  const ageVerifier = await AgeVerifier.deploy();
  console.log("   交易已发送，等待确认...");

  await ageVerifier.waitForDeployment();
  const contractAddress = await ageVerifier.getAddress();

  console.log("\n✅ 部署成功!");
  console.log("   合约地址:", contractAddress);

  // 获取部署交易详情
  const deployTx = ageVerifier.deploymentTransaction();
  if (deployTx) {
    console.log("   交易哈希:", deployTx.hash);
    console.log("   区块确认:", await deployTx.confirmations());
    console.log("   Gas 使用:", deployTx.gasLimit.toString());
  }

  // 验证合约是否可调用
  console.log("\n🔍 验证合约...");
  try {
    const MINIMUM_AGE = await ageVerifier.MINIMUM_AGE();
    console.log("   ✅ 合约可调用");
    console.log("   最小年龄要求:", MINIMUM_AGE.toString());
  } catch (error) {
    console.log("   ⚠️  合约验证失败:", error);
  }

  // 保存部署信息
  const deploymentInfo = {
    network: "sepolia",
    contractAddress: contractAddress,
    deployerAddress: deployerAddress,
    timestamp: new Date().toISOString(),
    blockNumber: await ethers.provider.getBlockNumber(),
    transactionHash: deployTx?.hash || "",
  };

  // 保存到 JSON 文件
  const infoPath = path.join(__dirname, "../deployments/sepolia-deployment.json");
  const infoDir = path.dirname(infoPath);
  if (!fs.existsSync(infoDir)) {
    fs.mkdirSync(infoDir, { recursive: true });
  }
  fs.writeFileSync(infoPath, JSON.stringify(deploymentInfo, null, 2));
  console.log("\n💾 部署信息已保存到:", infoPath);

  // 生成前端配置
  const frontendEnv = `# AgeVerifier 合约地址 (部署于 ${deploymentInfo.timestamp})
VITE_CONTRACT_ADDRESS=${contractAddress}
VITE_CONTRACT_ADDRESS_MOCK=${contractAddress}

# Privy App ID (需要您自己配置)
VITE_PRIVY_APP_ID=你的Privy-App-ID
`;

  const envPath = path.join(__dirname, "../../frontend/.env.example");
  fs.writeFileSync(envPath, frontendEnv);
  console.log("📝 前端配置模板已生成:", envPath);

  // 显示下一步操作
  console.log("\n📋 下一步操作:");
  console.log("   1. 在 Etherscan 查看合约:");
  console.log(`      https://sepolia.etherscan.io/address/${contractAddress}`);
  console.log("\n   2. 复制合约地址到前端 .env 文件:");
  console.log(`      VITE_CONTRACT_ADDRESS=${contractAddress}`);
  console.log("\n   3. (可选) 验证合约源码:");
  console.log(`      npx hardhat verify --network sepolia ${contractAddress}`);
  console.log("\n   4. 重启前端服务器:");
  console.log("      cd frontend && npm run dev");

  console.log("\n🎉 部署完成！");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ 部署失败:", error);
    process.exit(1);
  });


