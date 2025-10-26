import { ethers } from "hardhat";

async function main() {
  console.log("💰 检查账户余额...\n");

  const [deployer, ...accounts] = await ethers.getSigners();
  
  console.log("主部署账户:");
  const deployerAddress = await deployer.getAddress();
  const balance = await ethers.provider.getBalance(deployerAddress);
  console.log("  地址:", deployerAddress);
  console.log("  余额:", ethers.formatEther(balance), "ETH");
  
  if (balance < ethers.parseEther("0.005")) {
    console.log("  状态: ⚠️  余额不足，建议至少 0.01 ETH");
    console.log("\n  获取测试币:");
    console.log("  - https://sepoliafaucet.com/");
    console.log("  - https://sepolia-faucet.pk910.de/");
    console.log("  - https://www.alchemy.com/faucets/ethereum-sepolia");
  } else {
    console.log("  状态: ✅ 余额充足");
  }

  // 显示网络信息
  const network = await ethers.provider.getNetwork();
  console.log("\n网络信息:");
  console.log("  网络名称:", network.name);
  console.log("  链 ID:", network.chainId.toString());
  console.log("  当前区块:", await ethers.provider.getBlockNumber());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


