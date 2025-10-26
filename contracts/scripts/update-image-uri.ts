import { ethers } from "hardhat";

async function main() {
  // ========================================
  // 配置区域 - 请修改这里
  // ========================================
  
  const NFT_CONTRACT_ADDRESS = process.env.VITE_NFT_CONTRACT_ADDRESS || "0xYourNFTContractAddress"; // NFT 合约地址
  const NEW_IMAGE_URI = "ipfs://bafkreibocdclhsdq4tmlticlp6hekn5kztvuttxcihnwdanshiexg5o5qi"; // 新的较小图片
  
  // ========================================
  
  console.log("\n🎨 Updating NFT Image URI...\n");
  console.log("NFT Contract:", NFT_CONTRACT_ADDRESS);
  console.log("New Image URI:", NEW_IMAGE_URI);
  
  try {
    // 获取合约实例
    const NFT = await ethers.getContractAt("AgeCredentialNFT", NFT_CONTRACT_ADDRESS);
    
    // 显示当前 URI
    const currentURI = await NFT.baseImageURI();
    console.log("\n📋 Current Image URI:", currentURI);
    
    // 更新 URI
    console.log("\n⏳ Sending transaction...");
    const tx = await NFT.setBaseImageURI(NEW_IMAGE_URI);
    
    console.log("Transaction hash:", tx.hash);
    console.log("⏳ Waiting for confirmation...");
    
    await tx.wait();
    
    // 验证更新
    const updatedURI = await NFT.baseImageURI();
    console.log("\n✅ Image URI updated successfully!");
    console.log("New URI:", updatedURI);
    
    // 测试 tokenURI（如果有 NFT 的话）
    try {
      const tokenURI = await NFT.tokenURI(1);
      console.log("\n📋 Sample Token URI for Token #1:");
      
      // 如果是 base64 编码的，解码显示
      if (tokenURI.startsWith("data:application/json;base64,")) {
        const base64Data = tokenURI.split(",")[1];
        const jsonData = Buffer.from(base64Data, "base64").toString("utf-8");
        const metadata = JSON.parse(jsonData);
        console.log("Metadata:", JSON.stringify(metadata, null, 2));
      } else {
        console.log(tokenURI);
      }
    } catch (err) {
      console.log("\n⚠️ No Token #1 exists yet (this is OK if you haven't minted any NFTs)");
    }
    
    console.log("\n🎉 Update complete!");
    console.log("\n📍 Next steps:");
    console.log("   1. Verify on Etherscan: https://sepolia.etherscan.io/address/" + NFT_CONTRACT_ADDRESS);
    console.log("   2. Mint a new NFT to see the updated image");
    console.log("   3. View on OpenSea: https://testnets.opensea.io/assets/sepolia/" + NFT_CONTRACT_ADDRESS + "/1");
    
  } catch (error: any) {
    console.error("\n❌ Error updating image URI:");
    console.error(error.message);
    
    if (error.message.includes("Ownable")) {
      console.error("\n⚠️ Only the contract owner can update the image URI.");
      console.error("   Make sure you're using the same wallet that deployed the contract.");
    }
    
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

