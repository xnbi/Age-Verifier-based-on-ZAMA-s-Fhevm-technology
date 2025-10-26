import fs from "fs";
import path from "path";

async function main() {
  console.log("📦 导出 AgeVerifier ABI...\n");

  // 读取编译后的 artifacts
  const artifactPath = path.join(
    __dirname,
    "../artifacts/contracts/AgeVerifier.sol/AgeVerifier.json"
  );

  if (!fs.existsSync(artifactPath)) {
    console.error("❌ 错误: 合约未编译");
    console.log("   请先运行: npx hardhat compile");
    process.exit(1);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
  const abi = artifact.abi;

  // 导出到前端目录
  const frontendAbiPath = path.join(__dirname, "../../frontend/src/AgeVerifier.json");
  fs.writeFileSync(frontendAbiPath, JSON.stringify(abi, null, 2));

  console.log("✅ ABI 已导出到:", frontendAbiPath);
  console.log(`   包含 ${abi.length} 个函数/事件`);

  // 显示主要接口
  console.log("\n📋 主要接口:");
  abi.forEach((item: any) => {
    if (item.type === "function") {
      console.log(`   - ${item.name}()`);
    }
  });

  console.log("\n🎉 导出完成！");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });


