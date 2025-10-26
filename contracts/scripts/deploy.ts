import { ethers } from "hardhat";

async function main() {
  // 部署 AgeVerifier 合约
  const AgeVerifier = await ethers.getContractFactory("AgeVerifier");
  const contract = await AgeVerifier.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("AgeVerifier deployed to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});