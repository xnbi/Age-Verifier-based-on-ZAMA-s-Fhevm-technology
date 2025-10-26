import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  // ========================================
  // 配置区域
  // ========================================
  
  const NFT_CONTRACT_ADDRESS = "0x52c4f87f5C6BD3E166Dd6daeAd69D83CbB2630CF"; // 您的 NFT 合约地址
  const NEW_IMAGE_URI = "ipfs://bafkreibocdclhsdq4tmlticlp6hekn5kztvuttxcihnwdanshiexg5o5qi"; // 新的较小图片 CID
  
  // ========================================
  
  console.log("\n🎨 Updating NFT Image URI...\n");
  console.log("NFT Contract:", NFT_CONTRACT_ADDRESS);
  console.log("New Image URI:", NEW_IMAGE_URI);
  console.log("New Image URL:", `https://ipfs.io/ipfs/${NEW_IMAGE_URI.replace('ipfs://', '')}`);
  
  try {
    const [deployer] = await ethers.getSigners();
    console.log("\n👤 Using account:", deployer.address);
    
    // 获取合约实例（使用完全限定名称）
    const NFT = await ethers.getContractAt("contracts/AgeCredentialNFT_Simple.sol:AgeCredentialNFT", NFT_CONTRACT_ADDRESS);
    
    // 更新 URI
    console.log("\n⏳ Sending transaction...");
    const tx = await NFT.setBaseImageURI(NEW_IMAGE_URI, {
      gasLimit: 200000 // 明确设置 gas limit
    });
    
    console.log("📝 Transaction hash:", tx.hash);
    console.log("🔗 View on Etherscan:", `https://sepolia.etherscan.io/tx/${tx.hash}`);
    console.log("⏳ Waiting for confirmation...");
    
    const receipt = await tx.wait();
    
    console.log("\n✅ Transaction confirmed!");
    console.log("   Block:", receipt.blockNumber);
    console.log("   Gas used:", receipt.gasUsed.toString());
    
    // 验证更新（如果有 Token #1）
    try {
      const tokenURI = await NFT.tokenURI(1);
      console.log("\n📋 Updated Token #1 Metadata:");
      
      // 解码 base64
      if (tokenURI.startsWith("data:application/json;base64,")) {
        const base64Data = tokenURI.split(",")[1];
        const jsonData = Buffer.from(base64Data, "base64").toString("utf-8");
        const metadata = JSON.parse(jsonData);
        console.log("   Image:", metadata.image);
        console.log("   Image URL:", `https://ipfs.io/ipfs/${metadata.image.replace('ipfs://', '')}`);
      }
    } catch (err) {
      console.log("\n⚠️ Could not fetch Token #1 metadata (might not exist yet)");
    }
    
    console.log("\n🎉 Image URI update complete!");
    console.log("\n📍 Next steps:");
    console.log("   1. 刷新您的 DApp 页面（Ctrl+Shift+R）");
    console.log("   2. NFT 图片应该自动更新为新的较小图片");
    console.log("   3. Etherscan:", `https://sepolia.etherscan.io/address/${NFT_CONTRACT_ADDRESS}`);
    
  } catch (error: any) {
    console.error("\n❌ Error updating image URI:");
    console.error(error.message);
    
    if (error.message.includes("Ownable")) {
      console.error("\n⚠️ 只有合约 owner 可以更新图片 URI");
      console.error("   请确保您使用的是部署合约时的钱包");
    }
    
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

