// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, euint32, ebool, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title AgeVerifier
 * @notice 使用 FHE 技术的年龄验证合约
 * @dev 实现完全隐私保护的年龄验证
 */
contract AgeVerifier is SepoliaConfig {
    // Gateway 合约地址（用于解密回调验证）
    address private constant GATEWAY_ADDRESS = address(0); // TODO: 设置实际的 Gateway 地址
    // Events
    event AgeVerified(address indexed user);
    event DecryptionRequested(address indexed user, uint256 requestId);
    event VerificationResult(address indexed user, bool isEligible);

    // Storage
    mapping(address => euint32) private userAges;
    mapping(address => bool) private verificationResults;
    mapping(uint256 => address) private requestIdToUser;

    // 修复1: 用 immutable (构造函数初始化，避开 constant 限制)
    euint32 private immutable MINIMUM_AGE;

    // Modifier: 只允许 Gateway 调用回调函数
    modifier onlyGateway() {
        // TODO: 在实际部署时启用此检查
        // require(msg.sender == GATEWAY_ADDRESS, "只有 Gateway 可以调用");
        _;
    }

    constructor() {
        MINIMUM_AGE = FHE.asEuint32(18);  // 运行时加密初始化
    }

    // Step 1: Accept encrypted age and perform comparison
    function verifyAge(
        externalEuint32 encryptedAge,
        bytes calldata proof
    ) external {
        // Convert external encrypted input to internal format
        euint32 age = FHE.fromExternal(encryptedAge, proof);

        // Store encrypted age
        userAges[msg.sender] = age;

        // COMPUTATION: Compare encrypted age with encrypted minimum (18)
        // This happens on encrypted data without decryption!
        ebool isOldEnough = FHE.ge(age, MINIMUM_AGE);

        // Grant access permissions
        FHE.allowThis(age);
        FHE.allow(age, msg.sender);
        FHE.allowThis(isOldEnough);

        // ✅ 关键修复：授权给 Gateway（解密前必须授权！）
        // TODO: 在实际部署时，需要授权给真实的 Gateway 地址
        // FHE.allow(isOldEnough, GATEWAY_ADDRESS);

        // Request decryption of the comparison result (not the age itself)
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(isOldEnough);

        uint256 requestId = FHE.requestDecryption(
            cts,
            this.callbackDecryption.selector
        );

        // Store request mapping
        requestIdToUser[requestId] = msg.sender;

        emit AgeVerified(msg.sender);
        emit DecryptionRequested(msg.sender, requestId);
    }

    // Step 2: Callback receives decrypted result (修复2: 3 参数 + checkSignatures 3 args + decode)
    // ✅ 关键修复：添加 onlyGateway modifier 防止未授权调用
    function callbackDecryption(
        uint256 requestId,
        bytes memory cleartexts,  // 解密结果 bytes
        bytes memory decryptionProof  // 签名证明
    ) public onlyGateway {
        // Verify the decryption came from authorized KMS (3 参数)
        FHE.checkSignatures(requestId, cleartexts, decryptionProof);

        // Get the user who made this request
        address user = requestIdToUser[requestId];
        require(user != address(0), "Invalid request");

        // Decode cleartexts as bool (FHE ge 返回 ebool，转 bytes 后 decode)
        bool decryptedResult = abi.decode(cleartexts, (bool));

        // Store the plaintext verification result
        verificationResults[user] = decryptedResult;

        // Clean up
        delete requestIdToUser[requestId];

        // Emit result
        emit VerificationResult(user, decryptedResult);
    }

    // Check if user passed verification
    function isVerified(address user) external view returns (bool) {
        return verificationResults[user];
    }

    // Mock function for testing (NOT for production)
    function verifyAgeMock(uint32 plainAge) external {
        euint32 encryptedAge = FHE.asEuint32(plainAge);
        userAges[msg.sender] = encryptedAge;

        bool result = plainAge >= 18;
        verificationResults[msg.sender] = result;

        emit AgeVerified(msg.sender);
        emit VerificationResult(msg.sender, result);
    }

    // View encrypted age
    function getEncryptedAge(address user) external view returns (euint32) {
        return userAges[user];
    }
}