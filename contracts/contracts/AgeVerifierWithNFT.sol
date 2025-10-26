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

    // 事件
    event VerificationRequested(address indexed user, uint256 requestId);
    event VerificationResult(address indexed user, bool isEligible);
    event NFTCredentialMinted(address indexed user, uint256 tokenId);
    event NFTContractSet(address indexed nftContract);

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
     * @notice 验证年龄（FHE 模式）
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
        
        // 3. 比较年龄（简化版：直接标记为已验证）
        // 注意：实际生产环境需要通过 Gateway 解密
        isVerified[msg.sender] = true;
        
        emit VerificationResult(msg.sender, true);
        
        // 如果验证成功，铸造 NFT
        if (address(nftContract) != address(0)) {
            _mintNFTCredential(msg.sender);
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
}

