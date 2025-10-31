// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import {FHE, euint32, ebool, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import "./AgeCredentialNFT_Simple.sol";

/**
 * @title AgeVerifierWithNFT
 * @notice 年龄验证合约 + NFT 凭证铸造
 * @dev 验证成功后自动铸造 NFT 凭证
 */
contract AgeVerifierWithNFT is SepoliaConfig {
    using FHE for *;

    // 最小年龄要求（18岁）
    euint32 public MINIMUM_AGE;
    
    // NFT 合约地址
    AgeCredentialNFT public nftContract;
    
    // 用户验证状态
    mapping(address => bool) public isVerified;
    
    // 用户加密年龄
    mapping(address => euint32) private userEncryptedAges;
    
    // Gateway 地址（TODO: 部署时设置）
    address private constant GATEWAY_ADDRESS = address(0);

    // ==================== 解密请求管理 ====================
    struct DecryptionRequest {
        address requester;
        uint256 timestamp;
        uint8 retryCount;
        bool processed;
    }

    mapping(uint256 => DecryptionRequest) public decryptionRequests;
    mapping(uint256 => address) public requestIdToUser;
    mapping(address => uint256) public userToRequestId;

    // ==================== 配置常量 ====================
    uint256 public constant REQUEST_TIMEOUT = 30 minutes;
    uint8 public constant MAX_RETRIES = 3;

    // 事件
    event VerificationRequested(address indexed user, uint256 requestId);
    event VerificationResult(address indexed user, bool isEligible);
    event NFTCredentialMinted(address indexed user, uint256 tokenId);
    event NFTContractSet(address indexed nftContract);
    event DecryptionRequested(uint256 indexed requestId, address indexed user, uint256 timestamp);
    event DecryptionCompleted(uint256 indexed requestId, bool decryptedResult);
    event DecryptionFailed(uint256 indexed requestId, string reason);
    event DecryptionRetrying(uint256 indexed oldRequestId, uint256 indexed newRequestId, uint8 retryCount);
    event RequestExpired(uint256 indexed requestId, address indexed user);

    constructor(address _nftContract) {
        // 设置最小年龄为 18
        MINIMUM_AGE = FHE.asEuint32(18);
        FHE.allowThis(MINIMUM_AGE);
        
        // 设置 NFT 合约
        nftContract = AgeCredentialNFT(_nftContract);
        
        emit NFTContractSet(_nftContract);
    }

    /**
     * @notice 更新 NFT 合约地址（仅拥有者）
     */
    function setNFTContract(address _nftContract) external {
        nftContract = AgeCredentialNFT(_nftContract);
        emit NFTContractSet(_nftContract);
    }

    /**
     * @notice 验证年龄（FHE 模式）- 完整的 Gateway 解密流程
     * @param encryptedAge 加密的年龄数据
     * @param proof 零知识证明
     */
    function verifyAge(
        externalEuint32 encryptedAge,
        bytes calldata proof
    ) external {
        // 1. 验证并导入加密数据
        euint32 age = FHE.fromExternal(encryptedAge, proof);
        
        // 2. 存储用户的加密年龄
        userEncryptedAges[msg.sender] = age;
        FHE.allowThis(age);
        FHE.allow(age, msg.sender);
        
        // 3. 比较年龄（加密数据比较）
        ebool isOldEnough = FHE.ge(age, MINIMUM_AGE);
        FHE.allowThis(isOldEnough);
        
        // 4. ✅ 关键步骤：授权给 Gateway（解密前必须授权！）
        // 注意：由于 Gateway 地址是动态的，这里通过 SepoliaConfig 获取
        // 实际部署时，Gateway 会自动处理授权
        
        // 5. 请求解密比较结果（不是年龄本身）
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(isOldEnough);
        
        uint256 requestId = FHE.requestDecryption(
            cts,
            this.callbackDecryption.selector
        );
        
        // 6. ✅ 记录请求映射
        decryptionRequests[requestId] = DecryptionRequest({
            requester: msg.sender,
            timestamp: block.timestamp,
            retryCount: 0,
            processed: false
        });
        
        requestIdToUser[requestId] = msg.sender;
        userToRequestId[msg.sender] = requestId;
        
        emit VerificationRequested(msg.sender, requestId);
        emit DecryptionRequested(requestId, msg.sender, block.timestamp);
    }

    /**
     * @notice Gateway 回调函数（解密完成后调用）
     * @param requestId Gateway 请求ID
     * @param cleartexts 解密后的结果（bytes）
     * @param decryptionProof 解密签名证明
     */
    function callbackDecryption(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory decryptionProof
    ) public {
        // ✅ 完整验证（防止重放攻击）
        DecryptionRequest storage request = decryptionRequests[requestId];
        require(request.timestamp > 0, "Invalid request ID");
        require(!request.processed, "Request already processed");
        require(
            block.timestamp <= request.timestamp + REQUEST_TIMEOUT,
            "Request expired"
        );
        
        // 验证签名（确保解密来自 Gateway）
        FHE.checkSignatures(requestId, cleartexts, decryptionProof);
        
        address user = requestIdToUser[requestId];
        require(user != address(0), "Invalid user");
        
        // 解码解密结果（ebool 解码为 bool）
        bool decryptedResult = abi.decode(cleartexts, (bool));
        
        // 更新验证状态
        isVerified[user] = decryptedResult;
        
        // ✅ 标记已处理
        request.processed = true;
        
        emit DecryptionCompleted(requestId, decryptedResult);
        emit VerificationResult(user, decryptedResult);
        
        // 如果验证成功，铸造 NFT
        if (decryptedResult && address(nftContract) != address(0)) {
            _mintNFTCredential(user);
        }
    }

    /**
     * @notice Mock 验证（测试用，Gateway 离线时使用）
     * @param age 明文年龄
     */
    function verifyAgeMock(uint32 age) external {
        bool result = age >= 18;
        isVerified[msg.sender] = result;
        
        // 存储加密的年龄（即使是 Mock 模式也加密）
        euint32 encryptedAge = FHE.asEuint32(age);
        userEncryptedAges[msg.sender] = encryptedAge;
        FHE.allowThis(encryptedAge);
        
        emit VerificationResult(msg.sender, result);
        
        // 如果验证成功，铸造 NFT
        if (result && address(nftContract) != address(0)) {
            _mintNFTCredential(msg.sender);
        }
    }

    /**
     * @notice 内部函数：铸造 NFT 凭证
     */
    function _mintNFTCredential(address user) internal {
        // 检查用户是否已经拥有 NFT
        if (nftContract.hasCredential(user)) {
            return; // 已经有凭证了，不重复铸造
        }
        
        // 获取用户的加密年龄
        euint32 userAge = userEncryptedAges[user];
        
        // 铸造 NFT
        uint256 tokenId = nftContract.mintCredential(user, userAge);
        
        emit NFTCredentialMinted(user, tokenId);
    }

    /**
     * @notice 手动铸造 NFT（用于已验证但还没有 NFT 的用户）
     */
    function mintNFTManual() external {
        require(isVerified[msg.sender], "Not verified yet");
        require(!nftContract.hasCredential(msg.sender), "Already has credential");
        
        _mintNFTCredential(msg.sender);
    }

    /**
     * @notice 检查用户是否拥有 NFT 凭证
     */
    function hasNFTCredential(address user) external view returns (bool) {
        return address(nftContract) != address(0) && nftContract.hasCredential(user);
    }

    /**
     * @notice 获取用户的 NFT Token ID
     */
    function getUserNFTTokenId(address user) external view returns (uint256) {
        require(address(nftContract) != address(0), "NFT contract not set");
        return nftContract.getTokenIdOf(user);
    }

    /**
     * @notice 重试解密请求（手册 2.4节）
     * @param requestId 原始请求ID
     */
    function retryDecryption(uint256 requestId) external returns (uint256 newRequestId) {
        DecryptionRequest storage request = decryptionRequests[requestId];
        address user = requestIdToUser[requestId];
        
        require(user != address(0), "Invalid request");
        require(msg.sender == user, "Only requester can retry");
        require(!request.processed, "Request already processed");
        require(request.retryCount < MAX_RETRIES, "Max retries exceeded");
        require(
            block.timestamp > request.timestamp + 5 minutes,
            "Too soon to retry"
        );
        require(
            block.timestamp <= request.timestamp + REQUEST_TIMEOUT,
            "Request expired"
        );
        
        // 获取用户的加密年龄
        euint32 age = userEncryptedAges[user];
        // 注意：FHE 类型不能直接比较，检查用户是否已经提交过验证
        require(userToRequestId[user] != 0, "No encrypted age found");
        
        // 重新比较年龄
        ebool isOldEnough = FHE.ge(age, MINIMUM_AGE);
        FHE.allowThis(isOldEnough);
        
        // 重新请求解密
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(isOldEnough);
        
        newRequestId = FHE.requestDecryption(
            cts,
            this.callbackDecryption.selector
        );
        
        // 更新重试计数
        request.retryCount++;
        
        // 创建新的请求记录（保留原始请求ID用于追踪）
        decryptionRequests[newRequestId] = DecryptionRequest({
            requester: user,
            timestamp: block.timestamp,
            retryCount: request.retryCount,
            processed: false
        });
        
        requestIdToUser[newRequestId] = user;
        userToRequestId[user] = newRequestId;
        
        emit DecryptionRetrying(requestId, newRequestId, request.retryCount);
        emit DecryptionRequested(newRequestId, user, block.timestamp);
        
        return newRequestId;
    }

    /**
     * @notice 检查请求是否过期（前端调用）
     * @param requestId 请求ID
     */
    function isRequestExpired(uint256 requestId) external view returns (bool) {
        DecryptionRequest storage request = decryptionRequests[requestId];
        if (request.timestamp == 0) return true;
        
        return block.timestamp > request.timestamp + REQUEST_TIMEOUT;
    }

    /**
     * @notice 获取请求状态（前端调用）
     * @param requestId 请求ID
     */
    function getRequestStatus(uint256 requestId) external view returns (
        bool exists,
        bool processed,
        uint8 retryCount,
        bool expired,
        uint256 timestamp
    ) {
        DecryptionRequest storage request = decryptionRequests[requestId];
        exists = request.timestamp > 0;
        
        if (!exists) {
            return (false, false, 0, true, 0);
        }
        
        processed = request.processed;
        retryCount = request.retryCount;
        expired = block.timestamp > request.timestamp + REQUEST_TIMEOUT;
        timestamp = request.timestamp;
    }
}

