// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import {FHE, euint32} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/**
 * @title AgeCredentialNFT
 * @notice 基于 FHE 的年龄验证凭证 NFT
 * @dev 每个地址只能拥有一个 NFT，年龄信息使用 FHE 加密存储
 */
contract AgeCredentialNFT is ERC721, Ownable, SepoliaConfig {
    using FHE for *;

    // NFT 计数器
    uint256 private _tokenIdCounter;
    
    // 存储加密的年龄信息
    mapping(uint256 => euint32) private encryptedAges;
    
    // 地址到 Token ID 的映射
    mapping(address => uint256) public addressToTokenId;
    
    // Token ID 到地址的映射
    mapping(uint256 => address) public tokenIdToAddress;
    
    // 铸造时间戳
    mapping(uint256 => uint256) public mintTimestamp;
    
    // 授权铸造者（AgeVerifier 合约）
    mapping(address => bool) public authorizedMinters;

    // 事件
    event CredentialMinted(address indexed to, uint256 indexed tokenId, uint256 timestamp);
    event CredentialRevoked(address indexed from, uint256 indexed tokenId);
    event MinterAuthorized(address indexed minter);
    event MinterRevoked(address indexed minter);

    constructor() ERC721("Age Credential", "AGE") Ownable(msg.sender) {
        _tokenIdCounter = 1; // 从 1 开始，0 表示未持有
    }

    /**
     * @notice 授权铸造者（通常是 AgeVerifier 合约）
     */
    function authorizeMinter(address minter) external onlyOwner {
        authorizedMinters[minter] = true;
        emit MinterAuthorized(minter);
    }

    /**
     * @notice 撤销铸造者权限
     */
    function revokeMinter(address minter) external onlyOwner {
        authorizedMinters[minter] = false;
        emit MinterRevoked(minter);
    }

    /**
     * @notice 铸造凭证 NFT（仅授权铸造者可调用）
     * @param to 接收者地址
     * @param encryptedAge 加密的年龄数据
     */
    function mintCredential(address to, euint32 encryptedAge) external returns (uint256) {
        require(authorizedMinters[msg.sender], "Not authorized to mint");
        require(addressToTokenId[to] == 0, "Address already has a credential");

        uint256 tokenId = _tokenIdCounter++;
        
        _safeMint(to, tokenId);
        
        encryptedAges[tokenId] = encryptedAge;
        addressToTokenId[to] = tokenId;
        tokenIdToAddress[tokenId] = to;
        mintTimestamp[tokenId] = block.timestamp;

        emit CredentialMinted(to, tokenId, block.timestamp);
        
        return tokenId;
    }

    /**
     * @notice 撤销凭证（仅拥有者可调用）
     * @param tokenId Token ID
     */
    function revokeCredential(uint256 tokenId) external onlyOwner {
        address owner = ownerOf(tokenId);
        
        _burn(tokenId);
        
        // Note: Cannot delete euint32, just clear the mappings
        delete addressToTokenId[owner];
        delete tokenIdToAddress[tokenId];
        delete mintTimestamp[tokenId];

        emit CredentialRevoked(owner, tokenId);
    }

    /**
     * @notice 检查地址是否持有凭证
     */
    function hasCredential(address account) external view returns (bool) {
        return addressToTokenId[account] != 0;
    }

    /**
     * @notice 获取地址的 Token ID
     */
    function getTokenIdOf(address account) external view returns (uint256) {
        return addressToTokenId[account];
    }

    /**
     * @notice 获取加密的年龄（需要有权限）
     * @dev 可以添加 ACL 控制谁可以访问
     */
    function getEncryptedAge(uint256 tokenId) external view returns (euint32) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return encryptedAges[tokenId];
    }

    /**
     * @notice 获取 NFT 元数据 URI
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        
        // 构建链上元数据（JSON）
        return string(
            abi.encodePacked(
                "data:application/json;base64,",
                encodeBase64(
                    bytes(
                        string(
                            abi.encodePacked(
                                '{"name":"Age Credential #',
                                _toString(tokenId),
                                '","description":"Proof of age verification using FHE technology",',
                                '"image":"data:image/svg+xml;base64,',
                                encodeBase64(bytes(_generateSVG(tokenId))),
                                '","attributes":[',
                                '{"trait_type":"Verified","value":"Yes"},',
                                '{"trait_type":"Mint Date","value":"',
                                _toString(mintTimestamp[tokenId]),
                                '"},',
                                '{"trait_type":"Privacy","value":"FHE Encrypted"}',
                                ']}'
                            )
                        )
                    )
                )
            )
        );
    }

    /**
     * @notice 生成 SVG 图像
     */
    function _generateSVG(uint256 tokenId) internal view returns (string memory) {
        return string(
            abi.encodePacked(
                '<svg xmlns="http://www.w3.org/2000/svg" width="350" height="350" viewBox="0 0 350 350">',
                '<defs>',
                '<linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">',
                '<stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />',
                '<stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />',
                '</linearGradient>',
                '</defs>',
                '<rect width="350" height="350" fill="url(#grad)"/>',
                '<text x="175" y="100" font-family="Arial" font-size="24" fill="white" text-anchor="middle" font-weight="bold">Age Credential</text>',
                '<text x="175" y="140" font-family="monospace" font-size="16" fill="white" text-anchor="middle">#',
                _toString(tokenId),
                '</text>',
                '<circle cx="175" cy="200" r="40" fill="none" stroke="white" stroke-width="3"/>',
                '<text x="175" y="210" font-family="Arial" font-size="32" fill="white" text-anchor="middle">',
                unicode"✓",
                '</text>',
                '<text x="175" y="280" font-family="Arial" font-size="14" fill="rgba(255,255,255,0.8)" text-anchor="middle">Verified with FHE</text>',
                '<text x="175" y="310" font-family="monospace" font-size="10" fill="rgba(255,255,255,0.6)" text-anchor="middle">',
                _toHexString(tokenIdToAddress[tokenId]),
                '</text>',
                '</svg>'
            )
        );
    }

    /**
     * @notice 禁止转让（灵魂绑定）
     * @dev 如果需要可转让，注释掉此函数
     */
    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal virtual override returns (address) {
        address from = _ownerOf(tokenId);
        
        // 允许 mint 和 burn，但不允许转让
        if (from != address(0) && to != address(0)) {
            revert("Credential is soulbound and cannot be transferred");
        }
        
        return super._update(to, tokenId, auth);
    }

    // ========== 辅助函数 ==========

    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }

    function _toHexString(address addr) internal pure returns (string memory) {
        bytes memory buffer = new bytes(42);
        buffer[0] = "0";
        buffer[1] = "x";
        for (uint256 i = 0; i < 20; i++) {
            uint8 value = uint8(uint160(addr) >> (8 * (19 - i)));
            uint8 hi = value >> 4;
            uint8 lo = value & 0x0f;
            buffer[2 + i * 2] = _toHexChar(hi);
            buffer[3 + i * 2] = _toHexChar(lo);
        }
        // 缩短显示
        bytes memory result = new bytes(14);
        for (uint i = 0; i < 6; i++) {
            result[i] = buffer[i];
        }
        result[6] = ".";
        result[7] = ".";
        for (uint i = 0; i < 6; i++) {
            result[8 + i] = buffer[36 + i];
        }
        return string(result);
    }

    function _toHexChar(uint8 value) internal pure returns (bytes1) {
        if (value < 10) {
            return bytes1(uint8(48 + value));
        }
        return bytes1(uint8(87 + value));
    }

    // Base64 编码
    function encodeBase64(bytes memory data) internal pure returns (string memory) {
        string memory table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        uint256 len = data.length;
        if (len == 0) return "";

        uint256 encodedLen = 4 * ((len + 2) / 3);
        bytes memory result = new bytes(encodedLen);

        uint256 i = 0;
        uint256 j = 0;
        
        for (; i + 3 <= len; i += 3) {
            result[j++] = bytes(table)[uint8(data[i] >> 2)];
            result[j++] = bytes(table)[uint8(((data[i] & 0x03) << 4) | (data[i + 1] >> 4))];
            result[j++] = bytes(table)[uint8(((data[i + 1] & 0x0f) << 2) | (data[i + 2] >> 6))];
            result[j++] = bytes(table)[uint8(data[i + 2] & 0x3f)];
        }

        if (i < len) {
            result[j++] = bytes(table)[uint8(data[i] >> 2)];
            if (i + 1 < len) {
                result[j++] = bytes(table)[uint8(((data[i] & 0x03) << 4) | (data[i + 1] >> 4))];
                result[j++] = bytes(table)[uint8((data[i + 1] & 0x0f) << 2)];
            } else {
                result[j++] = bytes(table)[uint8((data[i] & 0x03) << 4)];
                result[j++] = "=";
            }
            result[j++] = "=";
        }

        return string(result);
    }
}

