import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
  console.log("🚀 开始部署 AgeVerifier + NFT 凭证系统...\n");

  // 获取部署账户
  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddress);

  console.log("📍 部署账户信息:");
  console.log("   地址:", deployerAddress);
  console.log("   余额:", ethers.formatEther(balance), "ETH\n");

  // 检查余额
  if (balance < ethers.parseEther("0.01")) {
    console.log("⚠️  警告: 余额可能不足，建议至少 0.02 ETH");
    console.log("   访问水龙头: https://sepoliafaucet.com/\n");
  }

  // 步骤 1: 部署 NFT 合约（使用简化版本）
  console.log("📦 步骤 1/3: 部署 AgeCredentialNFT 合约...");
  const AgeCredentialNFT = await ethers.getContractFactory("contracts/AgeCredentialNFT_Simple.sol:AgeCredentialNFT");
  const nftContract = await AgeCredentialNFT.deploy();
  await nftContract.waitForDeployment();
  const nftAddress = await nftContract.getAddress();
  console.log("   ✅ NFT 合约地址:", nftAddress);
  
  // 步骤 2: 部署 AgeVerifier 合约（带 NFT 集成）
  console.log("\n📦 步骤 2/3: 部署 AgeVerifierWithNFT 合约...");
  const AgeVerifierWithNFT = await ethers.getContractFactory("AgeVerifierWithNFT");
  const verifierContract = await AgeVerifierWithNFT.deploy(nftAddress);
  await verifierContract.waitForDeployment();
  const verifierAddress = await verifierContract.getAddress();
  console.log("   ✅ Verifier 合约地址:", verifierAddress);

  // 步骤 3: 授权 Verifier 合约铸造 NFT
  console.log("\n⚙️  步骤 3/3: 配置权限...");
  const authTx = await nftContract.authorizeMinter(verifierAddress);
  await authTx.wait();
  console.log("   ✅ 已授权 Verifier 合约铸造 NFT");

  // 验证配置
  console.log("\n🔍 验证配置...");
  try {
    const isAuthorized = await nftContract.authorizedMinters(verifierAddress);
    console.log("   ✅ Verifier 授权状态:", isAuthorized);
    
    const nftContractInVerifier = await verifierContract.nftContract();
    console.log("   ✅ NFT 合约地址匹配:", nftContractInVerifier === nftAddress);
  } catch (error) {
    console.log("   ⚠️  配置验证失败:", error);
  }

  // 保存部署信息
  const deploymentInfo = {
    network: "sepolia",
    nftContract: {
      address: nftAddress,
      name: "AgeCredentialNFT"
    },
    verifierContract: {
      address: verifierAddress,
      name: "AgeVerifierWithNFT"
    },
    deployer: deployerAddress,
    timestamp: new Date().toISOString(),
    blockNumber: await ethers.provider.getBlockNumber(),
  };

  const infoPath = path.join(__dirname, "../deployments/sepolia-nft-deployment.json");
  const infoDir = path.dirname(infoPath);
  if (!fs.existsSync(infoDir)) {
    fs.mkdirSync(infoDir, { recursive: true });
  }
  fs.writeFileSync(infoPath, JSON.stringify(deploymentInfo, null, 2));
  console.log("\n💾 部署信息已保存到:", infoPath);

  // 生成前端配置
  const frontendEnv = `# NFT 凭证系统合约地址 (部署于 ${deploymentInfo.timestamp})

# 带 NFT 功能的验证合约
VITE_CONTRACT_ADDRESS=${verifierAddress}

# NFT 凭证合约
VITE_NFT_CONTRACT_ADDRESS=${nftAddress}

# Privy App ID (需要您自己配置)
VITE_PRIVY_APP_ID=你的Privy-App-ID
`;

  const envPath = path.join(__dirname, "../../frontend/.env.nft");
  fs.writeFileSync(envPath, frontendEnv);
  console.log("📝 前端配置已生成:", envPath);

  // 显示部署总结
  console.log("\n" + "=".repeat(60));
  console.log("🎉 部署完成！");
  console.log("=".repeat(60));
  console.log("\n📋 合约地址:");
  console.log("   NFT 合约:      ", nftAddress);
  console.log("   Verifier 合约: ", verifierAddress);
  
  console.log("\n🔗 Etherscan 链接:");
  console.log(`   NFT: https://sepolia.etherscan.io/address/${nftAddress}`);
  console.log(`   Verifier: https://sepolia.etherscan.io/address/${verifierAddress}`);

  console.log("\n📝 下一步操作:");
  console.log("   1. 更新 frontend/.env:");
  console.log(`      VITE_CONTRACT_ADDRESS=${verifierAddress}`);
  console.log(`      VITE_NFT_CONTRACT_ADDRESS=${nftAddress}`);
  console.log("\n   2. (可选) 验证合约:");
  console.log(`      npx hardhat verify --network sepolia ${nftAddress}`);
  console.log(`      npx hardhat verify --network sepolia ${verifierAddress} ${nftAddress}`);
  console.log("\n   3. 重启前端:");
  console.log("      cd frontend && npm run dev");
  
  console.log("\n" + "=".repeat(60));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ 部署失败:", error);
    process.exit(1);
  });

